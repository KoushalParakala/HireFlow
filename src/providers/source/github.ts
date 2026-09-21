import {
  BudgetError,
  GithubClient,
  GithubError,
  type GithubRepo,
} from "@/lib/github";
import {
  manifestPathsFor,
  matchRepo,
  parseDeps,
  repoNoiseReason,
  scoreEvidence,
  type RepoEvidence,
} from "@/lib/evidence";
import { deriveSignals, type Signals } from "@/lib/skills";
import { locationVerdict } from "@/lib/location";
import { linkedinFrom } from "@/lib/social";
import { fail } from "../types";
import type {
  SourceOptions,
  SourceProvider,
  SourceStats,
  SourcedPerson,
} from "./index";

const KIND = "source_github";

type Inspected = {
  repo: GithubRepo;
  evidence: Omit<RepoEvidence, "commits" | "total_commits" | "share">;
  matches: Map<string, "dependency" | "topic" | "language" | "mention">;
  contributors: Array<{ login: string; contributions: number }>;
  totalCommits: number;
  prior: number;
};

export const githubSource: SourceProvider = {
  key: "github",

  async search({ criteria, options }) {
    const started = Date.now();
    const meta = { kind: KIND, model: "github-rest", durationMs: 0 };
    const deadline = options.deadline ?? Date.now() + 200_000;
    const client = new GithubClient({ deadline });
    // The form is prefilled from the JD's must_have, so typed skills replace it
    // rather than adding to it — otherwise deleting a bad skill has no effect.
    const signals = deriveSignals(
      options.skills?.length ? { ...criteria, must_have: options.skills } : criteria,
    );

    if (!signals.must.length) {
      return fail(
        KIND,
        {
          code: "invalid",
          message:
            "No searchable skills. Add skills on this job or type them into the sourcing form.",
          retryable: false,
        },
        meta,
      );
    }

    const limits = resolveOptions(options, client.authed);
    const queries = buildQueries(signals, limits);
    const stats: SourceStats = {
      authed: client.authed,
      queries,
      reposFound: 0,
      reposKept: 0,
      reposInspected: 0,
      peopleConsidered: 0,
      droppedLocation: 0,
      droppedScore: 0,
      locationUnknown: 0,
      withLinkedin: 0,
      calls: {},
      notes: [],
      partial: false,
    };

    try {
      const candidates = await collectRepos(client, queries, stats, limits);
      const inspected = await inspectRepos(client, candidates, signals, stats, limits);
      const people = await buildPeople(client, inspected, signals, stats, limits);
      return {
        ok: true,
        data: { people, stats: finishStats(stats, client) },
        meta: { ...meta, durationMs: Date.now() - started },
      };
    } catch (error) {
      if (error instanceof BudgetError) {
        // Budget stops are expected on the free tier; keep whatever we proved.
        stats.partial = true;
        stats.notes.push(error.message);
        return {
          ok: true,
          data: { people: [], stats: finishStats(stats, client) },
          meta: { ...meta, durationMs: Date.now() - started },
        };
      }
      if (error instanceof GithubError) {
        return fail(
          KIND,
          { code: error.status === 401 ? "missing_key" : "upstream", message: error.message, retryable: error.retryable },
          { ...meta, durationMs: Date.now() - started },
        );
      }
      return fail(
        KIND,
        {
          code: "upstream",
          message: error instanceof Error ? error.message : "Sourcing failed",
          retryable: true,
        },
        { ...meta, durationMs: Date.now() - started },
      );
    }
  },
};

type Limits = ReturnType<typeof resolveOptions>;

function resolveOptions(options: SourceOptions, authed: boolean) {
  return {
    location: options.location?.trim() ?? "",
    minStars: Math.max(0, options.minStars ?? 3),
    pushedWithinMonths: Math.max(1, options.pushedWithinMonths ?? 18),
    limit: Math.max(1, Math.min(options.limit ?? 25, 60)),
    minEvidence: Math.max(0, Math.min(options.minEvidence ?? 45, 100)),
    repoBudget: Math.max(1, options.repoBudget ?? (authed ? 24 : 6)),
    minCommitShare: Math.max(0.05, Math.min(options.minCommitShare ?? 0.2, 1)),
  };
}

/**
 * Queries are ordered most-precise first: two topics together, then one topic
 * scoped to a language, then a keyword scoped to a language. Repo qualifiers
 * describe artifacts, which is why this finds builders and user search does not.
 */
function buildQueries(signals: Signals, limits: Limits) {
  const cutoff = new Date(Date.now() - limits.pushedWithinMonths * 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const base = `fork:false archived:false pushed:>${cutoff} stars:>=${limits.minStars}`;
  const topics = signals.topics.slice(0, 5);
  const languages = signals.languages.slice(0, 3);
  const queries: string[] = [];

  for (let i = 0; i < topics.length && i < 3; i += 1) {
    for (let j = i + 1; j < topics.length && j < 4; j += 1) {
      queries.push(`topic:${topics[i]} topic:${topics[j]} ${base}`);
    }
  }
  for (const topic of topics) {
    if (languages.length) queries.push(`topic:${topic} language:${languages[0]} ${base}`);
    queries.push(`topic:${topic} ${base}`);
  }
  // Skills with no topic of their own still search well as name/readme terms.
  const keywordSignals = signals.must.filter((s) => !s.topics.length && s.slug.length >= 4);
  for (const signal of keywordSignals.slice(0, 2)) {
    const language = signal.languages[0] ?? languages[0];
    queries.push(
      `${signal.slug.replace(/-/g, " ")} in:name,description,readme ${language ? `language:${language} ` : ""}${base}`,
    );
  }
  return [...new Set(queries)].slice(0, 12);
}

async function collectRepos(
  client: GithubClient,
  queries: string[],
  stats: SourceStats,
  limits: Limits,
) {
  const byName = new Map<string, GithubRepo>();
  const perOwner = new Map<string, number>();

  for (const query of queries) {
    if (byName.size >= limits.repoBudget * 3) break;
    let page: Awaited<ReturnType<typeof client.searchRepos>>;
    try {
      page = await client.searchRepos(query, { perPage: 50 });
    } catch (error) {
      if (error instanceof BudgetError) {
        stats.partial = true;
        stats.notes.push(`Stopped searching early: ${error.message}`);
        break;
      }
      throw error;
    }
    stats.reposFound += page.items.length;
    for (const repo of page.items) {
      if (byName.has(repo.full_name)) continue;
      if (repoNoiseReason(repo)) continue;
      const owner = repo.owner.login.toLowerCase();
      if ((perOwner.get(owner) ?? 0) >= 3) continue;
      perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1);
      byName.set(repo.full_name, repo);
    }
  }
  stats.reposKept = byName.size;
  return [...byName.values()];
}

/** Cheap ordering so the expensive per-repo reads go to the best repos first. */
function repoPrior(repo: GithubRepo, signals: Signals) {
  const topics = repo.topics ?? [];
  const topicHits = topics.filter((t) => signals.topics.includes(t)).length;
  const languageHit = repo.language && signals.languages.includes(repo.language) ? 1 : 0;
  const stars = Math.log10(repo.stargazers_count + 1);
  const days = (Date.now() - new Date(repo.pushed_at).getTime()) / 86_400_000;
  const recency = days < 90 ? 1 : days < 365 ? 0.6 : 0.2;
  return topicHits * 3 + languageHit * 1.5 + stars + recency;
}

async function inspectRepos(
  client: GithubClient,
  repos: GithubRepo[],
  signals: Signals,
  stats: SourceStats,
  limits: Limits,
) {
  const ordered = repos
    .map((repo) => ({ repo, prior: repoPrior(repo, signals) }))
    .sort((a, b) => b.prior - a.prior)
    .slice(0, limits.repoBudget);

  const out: Inspected[] = [];
  const allSignals = [...signals.must, ...signals.nice];

  for (const { repo, prior } of ordered) {
    try {
      const [owner, name] = repo.full_name.split("/");
      const languageBytes = (await client.languages(owner, name)) ?? {};
      const languages = Object.entries(languageBytes)
        .sort((a, b) => b[1] - a[1])
        .map(([language]) => language);

      const deps: string[] = [];
      for (const path of manifestPathsFor(languages)) {
        const text = await client.file(owner, name, path);
        if (text) deps.push(...parseDeps(path, text));
      }
      // A manifest already proves the stack, so the README is only worth a call
      // when we found no declared dependencies to read.
      const readme = deps.length ? null : await client.readme(owner, name);

      const contributors = (await client.contributors(owner, name))
        .filter(
          (c): c is { login: string; contributions: number; type?: string } =>
            Boolean(c.login) && c.type !== "Bot" && !c.login!.endsWith("[bot]"),
        )
        .map((c) => ({ login: c.login, contributions: c.contributions }));
      const totalCommits = contributors.reduce((sum, c) => sum + c.contributions, 0);
      if (!totalCommits) continue;

      const evidence = {
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        stars: repo.stargazers_count,
        pushed_at: repo.pushed_at,
        size: repo.size,
        topics: repo.topics ?? [],
        languages: languages.slice(0, 6),
        deps: [...new Set(deps)].slice(0, 40),
        proves: [] as string[],
      };
      const matches = matchRepo({ ...evidence, readme }, allSignals);
      evidence.proves = [...matches.keys()];
      stats.reposInspected += 1;
      out.push({ repo, evidence, matches, contributors, totalCommits, prior });
    } catch (error) {
      if (error instanceof BudgetError) {
        stats.partial = true;
        stats.notes.push(`Stopped inspecting early: ${error.message}`);
        break;
      }
      throw error;
    }
  }
  return out;
}

async function buildPeople(
  client: GithubClient,
  inspected: Inspected[],
  signals: Signals,
  stats: SourceStats,
  limits: Limits,
) {
  type Draft = { login: string; repos: RepoEvidence[]; prior: number };
  const drafts = new Map<string, Draft>();

  for (const item of inspected) {
    for (const contributor of item.contributors) {
      const share = contributor.contributions / item.totalCommits;
      if (share < limits.minCommitShare) continue;
      if (contributor.contributions < 3) continue;
      const key = contributor.login.toLowerCase();
      const draft = drafts.get(key) ?? { login: contributor.login, repos: [], prior: 0 };
      draft.repos.push({
        ...item.evidence,
        commits: contributor.contributions,
        total_commits: item.totalCommits,
        share: Math.round(share * 100) / 100,
      });
      draft.prior = Math.max(draft.prior, item.prior * share);
      drafts.set(key, draft);
    }
  }
  stats.peopleConsidered = drafts.size;

  const matchesByRepo = new Map(
    inspected.map((item) => [item.evidence.full_name, item.matches]),
  );
  const ranked = [...drafts.values()].sort((a, b) => b.prior - a.prior);
  const people: SourcedPerson[] = [];
  const wanted = Math.min(ranked.length, limits.limit * 3);

  for (const draft of ranked.slice(0, wanted)) {
    if (people.length >= limits.limit * 2) break;
    let profile: Awaited<ReturnType<typeof client.user>>;
    try {
      profile = await client.user(draft.login);
    } catch (error) {
      if (error instanceof BudgetError) {
        stats.partial = true;
        stats.notes.push(`Stopped fetching profiles early: ${error.message}`);
        break;
      }
      throw error;
    }
    if (!profile) continue;
    const verdict = locationVerdict(profile.location, limits.location);
    if (verdict === "miss") {
      stats.droppedLocation += 1;
      continue;
    }
    if (verdict === "unknown") stats.locationUnknown += 1;

    const repos = draft.repos
      .sort((a, b) => b.share * (b.stars + 1) - a.share * (a.stars + 1))
      .slice(0, 5);
    const scored = scoreEvidence({
      must: signals.must,
      nice: signals.nice,
      repos,
      matchesByRepo,
    });
    if (scored.score < limits.minEvidence) {
      stats.droppedScore += 1;
      continue;
    }

    // Only spend this call on people we are keeping, and never lose a proven
    // candidate over it: a missing social list is cosmetic.
    let socials: Array<{ provider: string; url: string }> = [];
    try {
      socials = await client.socialAccounts(draft.login);
    } catch (error) {
      if (!(error instanceof BudgetError)) throw error;
      stats.partial = true;
    }
    const linkedinUrl = linkedinFrom(socials, profile.blog);
    if (linkedinUrl) stats.withLinkedin += 1;

    people.push({
      externalId: profile.login,
      handle: profile.login,
      name: profile.name,
      profileUrl: profile.html_url,
      avatarUrl: profile.avatar_url,
      location: profile.location,
      email: profile.email,
      bio: profile.bio,
      company: profile.company,
      blog: profile.blog,
      followers: profile.followers,
      publicRepos: profile.public_repos,
      hireable: profile.hireable,
      socials,
      linkedinUrl,
      skills: scored.skills,
      evidence: repos,
      matched: scored.matched,
      missing: scored.missing,
      evidenceScore: scored.score,
      summary: scored.summary,
    });
  }

  return people
    .sort((a, b) => b.evidenceScore - a.evidenceScore)
    .slice(0, limits.limit);
}

export { locationVerdict } from "@/lib/location";

function finishStats(stats: SourceStats, client: GithubClient): SourceStats {
  return {
    ...stats,
    calls: client.spent,
    notes: [...new Set([...stats.notes, ...client.notes])].slice(0, 8),
  };
}
