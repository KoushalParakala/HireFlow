import { ApifyClient, ApifyError } from "@/lib/apify";
import { matchRepo, scoreEvidence, type RepoEvidence } from "@/lib/evidence";
import { locationVerdict } from "@/lib/location";
import { canonicalLinkedin } from "@/lib/social";
import { deriveSignals, normalize, type Signals } from "@/lib/skills";
import { serverEnv } from "@/lib/env";
import { fail } from "../types";
import type {
  SourceOptions,
  SourceProvider,
  SourceStats,
  SourcedPerson,
} from "./index";

const KIND = "source_linkedin";
/** Profile-by-username actor the account can actually run. Search is a separate Google SERP actor. */
const DEFAULT_ACTOR = "apimaestro/linkedin-profile-detail";
const DEFAULT_SEARCH_ACTOR = "apify/google-search-scraper";

export const linkedinSource: SourceProvider = {
  key: "linkedin",

  async search({ criteria, options }) {
    const started = Date.now();
    const env = serverEnv();
    const meta = {
      kind: KIND,
      model: env.apifyLinkedinActor || DEFAULT_ACTOR,
      durationMs: 0,
    };
    const deadline = options.deadline ?? Date.now() + 200_000;
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
    if (!env.apifyToken) {
      return fail(
        KIND,
        {
          code: "missing_key",
          message: "Set APIFY_TOKEN to source LinkedIn profiles.",
          retryable: false,
        },
        meta,
      );
    }

    const limits = resolveOptions(options);
    const searchQuery = buildSearchQuery(signals, limits, options.titles ?? []);
    const stats: SourceStats = {
      authed: true,
      queries: [searchQuery],
      reposFound: 0,
      reposKept: 0,
      reposInspected: 0,
      peopleFound: 0,
      peopleConsidered: 0,
      droppedLocation: 0,
      droppedScore: 0,
      locationUnknown: 0,
      withLinkedin: 0,
      calls: {},
      notes: [],
      partial: false,
    };

    const client = new ApifyClient({ deadline });
    try {
      const searchActor = env.apifyGoogleSearchActor || DEFAULT_SEARCH_ACTOR;
      const handles = await discoverHandles(
        client,
        searchActor,
        searchQuery,
        limits.limit,
        options.apifyRunId,
        options.onRunStarted,
        stats,
      );
      stats.peopleFound = handles.length;
      stats.reposFound = handles.length;
      stats.notes.push(`discovered ${handles.length} LinkedIn URLs`);

      const items: unknown[] = [];
      for (const handle of handles.slice(0, limits.limit)) {
        try {
          const profile = await scrapeProfile(client, meta.model!, handle);
          if (profile) items.push(profile);
        } catch (error) {
          stats.notes.push(
            `skip ${handle}: ${error instanceof Error ? error.message.slice(0, 80) : "failed"}`,
          );
        }
      }

      stats.peopleConsidered = items.length;
      const people = buildPeople(items, signals, stats, limits);
      stats.calls = client.spent;
      stats.withLinkedin = people.length;
      return {
        ok: true,
        data: { people, stats },
        meta: { ...meta, durationMs: Date.now() - started },
      };
    } catch (error) {
      if (error instanceof ApifyError) {
        return fail(
          KIND,
          {
            code:
              error.status === 401 || error.status === 403
                ? "missing_key"
                : error.status === 402
                  ? "quota"
                  : "upstream",
            message: error.message,
            retryable: error.retryable,
          },
          { ...meta, durationMs: Date.now() - started },
        );
      }
      return fail(
        KIND,
        {
          code: "upstream",
          message: error instanceof Error ? error.message : "LinkedIn sourcing failed",
          retryable: true,
        },
        { ...meta, durationMs: Date.now() - started },
      );
    }
  },
};

type Limits = ReturnType<typeof resolveOptions>;

function resolveOptions(options: SourceOptions) {
  return {
    location: options.location?.trim() ?? "",
    limit: Math.max(1, Math.min(options.limit ?? 20, 40)),
    minEvidence: Math.max(0, Math.min(options.minEvidence ?? 40, 100)),
  };
}

function buildSearchQuery(signals: Signals, limits: Limits, titles: string[]) {
  const title = titles.map((value) => value.trim()).filter(Boolean)[0] ?? "";
  const skills = signals.must.map((signal) => signal.skill).slice(0, 4).join(" ");
  return `site:linkedin.com/in ${title} ${skills} ${limits.location}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function quotaMessage(statusMessage: string | null | undefined) {
  return /limit reached|quota|insufficient credit|out of credits/i.test(statusMessage ?? "");
}

async function discoverHandles(
  client: ApifyClient,
  actor: string,
  query: string,
  limit: number,
  existingId: string | undefined,
  onRunStarted: ((runId: string) => Promise<void>) | undefined,
  stats: SourceStats,
) {
  let run = existingId
    ? await client.getRun(existingId)
    : await client.startRun(actor, {
        queries: query,
        maxPagesPerQuery: 1,
      });
  const restart =
    Boolean(existingId) &&
    run.status !== "SUCCEEDED" &&
    run.status !== "RUNNING" &&
    run.status !== "READY" &&
    run.status !== "TIMING-OUT" &&
    run.status !== "ABORTING";
  if (restart) {
    stats.notes.push(`previous search run ${run.status}, starting a new one`);
    run = await client.startRun(actor, { queries: query, maxPagesPerQuery: 1 });
  }
  if (!existingId || restart) await onRunStarted?.(run.id);
  stats.notes.push(`search run ${run.id}`);

  const finished = await client.waitForRun(run.id);
  if (quotaMessage(finished.statusMessage)) {
    throw new ApifyError(finished.statusMessage?.trim() || "Apify search quota reached.", 402, false);
  }
  if (!finished.defaultDatasetId) return [];
  const items = await client.datasetItems(finished.defaultDatasetId);
  return linkedinHandlesFromSearch(items).slice(0, Math.max(limit * 2, limit));
}

async function scrapeProfile(client: ApifyClient, actor: string, username: string) {
  const run = await client.startRun(actor, { username, includeEmail: false });
  const finished = await client.waitForRun(run.id);
  if (quotaMessage(finished.statusMessage)) {
    throw new ApifyError(finished.statusMessage?.trim() || "Apify profile quota reached.", 402, false);
  }
  if (!finished.defaultDatasetId) return null;
  const items = await client.datasetItems(finished.defaultDatasetId);
  return items[0] ?? null;
}

function linkedinHandlesFromSearch(items: unknown[]) {
  const handles: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | null) => {
    const slug = slugFromUrl(url);
    if (!slug || seen.has(slug.toLowerCase())) return;
    seen.add(slug.toLowerCase());
    handles.push(slug);
  };
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    add(str(row.url) || str(row.link));
    const organic = row.organicResults;
    if (Array.isArray(organic)) {
      for (const result of organic) {
        if (!result || typeof result !== "object") continue;
        add(str((result as Record<string, unknown>).url));
      }
    }
  }
  return handles;
}

function buildPeople(
  items: unknown[],
  signals: Signals,
  stats: SourceStats,
  limits: Limits,
) {
  const people: SourcedPerson[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const profile = parseProfile(item);
    if (!profile) continue;
    const key = profile.externalId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const verdict = locationVerdict(profile.location, limits.location);
    if (verdict === "miss") {
      stats.droppedLocation += 1;
      continue;
    }
    if (verdict === "unknown") stats.locationUnknown += 1;

    const evidence = toEvidence(profile);
    const matchesByRepo = new Map(
      evidence.map((repo) => [repo.full_name, matchRepo(repo, [...signals.must, ...signals.nice])]),
    );
    for (const repo of evidence) {
      repo.proves = [...(matchesByRepo.get(repo.full_name)?.keys() ?? [])];
    }
    stats.reposInspected += evidence.length;
    stats.reposKept += evidence.length;

    const scored = scoreEvidence({
      must: signals.must,
      nice: signals.nice,
      repos: evidence,
      matchesByRepo,
    });
    if (scored.score < limits.minEvidence) {
      stats.droppedScore += 1;
      continue;
    }

    people.push({
      externalId: profile.externalId,
      handle: profile.handle,
      name: profile.name,
      profileUrl: profile.linkedinUrl,
      avatarUrl: profile.avatarUrl,
      location: profile.location,
      email: profile.email,
      bio: profile.headline,
      company: profile.company,
      blog: null,
      followers: profile.followers,
      publicRepos: null,
      hireable: profile.openToWork,
      socials: [{ provider: "linkedin", url: profile.linkedinUrl }],
      linkedinUrl: profile.linkedinUrl,
      skills: scored.skills,
      evidence,
      matched: scored.matched,
      missing: scored.missing,
      evidenceScore: scored.score,
      summary: profileSummary(profile, scored.matched),
    });
  }

  return people
    .sort((a, b) => b.evidenceScore - a.evidenceScore)
    .slice(0, limits.limit);
}

type ParsedProfile = {
  externalId: string;
  handle: string;
  name: string | null;
  linkedinUrl: string;
  avatarUrl: string | null;
  location: string | null;
  email: string | null;
  headline: string | null;
  about: string | null;
  company: string | null;
  followers: number | null;
  openToWork: boolean | null;
  skillNames: string[];
  roles: ParsedRole[];
};

type ParsedRole = {
  title: string;
  company: string;
  description: string | null;
  skills: string[];
  months: number;
  current: boolean;
  endedAt: string;
};

function parseProfile(raw: unknown): ParsedProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const nested = raw as Record<string, unknown>;
  const basic =
    nested.basic_info && typeof nested.basic_info === "object"
      ? (nested.basic_info as Record<string, unknown>)
      : null;
  const row = basic ? { ...nested, ...basic } : nested;
  const handle =
    str(row.public_identifier) ||
    str(row.publicIdentifier) ||
    slugFromUrl(str(row.profile_url) || str(row.linkedinUrl) || str(row.url));
  const linkedinUrl = canonicalLinkedin(
    str(row.profile_url) ||
      str(row.linkedinUrl) ||
      str(row.url) ||
      (handle ? `https://www.linkedin.com/in/${handle}` : null),
  );
  if (!handle || !linkedinUrl) return null;

  const first = str(row.first_name) || str(row.firstName);
  const last = str(row.last_name) || str(row.lastName);
  const name = str(row.fullname) || str(row.name) || [first, last].filter(Boolean).join(" ") || null;
  const roles = parseRoles(row.experience);
  const current = Array.isArray(row.currentPosition)
    ? (row.currentPosition[0] as Record<string, unknown> | undefined)
    : undefined;
  const company =
    str(row.current_company) ||
    str(current?.companyName) ||
    roles.find((role) => role.current)?.company ||
    roles[0]?.company ||
    null;

  return {
    externalId: handle,
    handle,
    name,
    linkedinUrl,
    avatarUrl: str(row.profile_picture_url) || str(row.photo) || pictureUrl(row.profilePicture),
    location: locationText(row.location),
    email: firstEmail(row),
    headline: str(row.headline),
    about: str(row.about),
    company,
    followers: num(row.follower_count) ?? num(row.followerCount) ?? num(row.connection_count),
    openToWork: typeof row.open_to_work === "boolean" ? row.open_to_work : typeof row.openToWork === "boolean" ? row.openToWork : null,
    skillNames: parseSkillNames(row),
    roles,
  };
}

function toEvidence(profile: ParsedProfile): RepoEvidence[] {
  const skillsRepo: RepoEvidence = {
    full_name: profile.headline || "LinkedIn profile",
    html_url: profile.linkedinUrl,
    description: [profile.headline, profile.about].filter(Boolean).join("\n\n") || null,
    stars: profile.followers ?? 0,
    pushed_at: new Date().toISOString(),
    size: Math.max(120, profile.skillNames.length * 80),
    topics: profile.skillNames.map((skill) => normalize(skill)).filter(Boolean).slice(0, 24),
    languages: [],
    deps: profile.skillNames.map((skill) => skill.toLowerCase()).slice(0, 40),
    commits: Math.max(1, profile.skillNames.length),
    total_commits: Math.max(1, profile.skillNames.length),
    share: 1,
    proves: [],
  };

  const roles = profile.roles.slice(0, 5).map((role) => {
    const label = [role.title, role.company].filter(Boolean).join(" @ ") || "Role";
    return {
      full_name: label,
      html_url: profile.linkedinUrl,
      description: [role.title, role.description].filter(Boolean).join("\n") || null,
      stars: 0,
      pushed_at: role.endedAt,
      size: Math.max(80, role.months * 40),
      topics: role.skills.map((skill) => normalize(skill)).filter(Boolean),
      languages: [],
      deps: role.skills.map((skill) => skill.toLowerCase()),
      commits: Math.max(1, role.months),
      total_commits: Math.max(1, role.months),
      share: 1,
      proves: [],
    } satisfies RepoEvidence;
  });

  return [...roles, skillsRepo];
}

function profileSummary(
  profile: ParsedProfile,
  matched: Array<{ skill: string; how: string; repo: string }>,
) {
  const role = profile.roles[0];
  const lines = [
    role
      ? `${role.title}${role.company ? ` @ ${role.company}` : ""} — ${role.current ? "current role" : `${role.months} mo`}.`
      : profile.headline ?? "",
    profile.skillNames.length
      ? `Listed skills: ${profile.skillNames.slice(0, 10).join(", ")}.`
      : "",
    matched.length
      ? `Matched from the JD: ${matched.map((m) => m.skill).slice(0, 8).join(", ")}.`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function parseRoles(raw: unknown): ParsedRole[] {
  if (!Array.isArray(raw)) return [];
  const roles: ParsedRole[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = str(row.position) || str(row.title) || "";
    const company = str(row.companyName) || str(row.company) || "";
    if (!title && !company) continue;
    const current =
      row.is_current === true ||
      (row.is_current !== false && isCurrent(row.end_date ?? row.endDate));
    const started = parseYearMonth(row.start_date ?? row.startDate);
    const ended = current ? new Date() : parseYearMonth(row.end_date ?? row.endDate);
    const months = monthSpan(started, ended) || parseDurationMonths(str(row.duration));
    roles.push({
      title,
      company,
      description: str(row.description),
      skills: stringList(row.skills),
      months: Math.max(1, months),
      current,
      endedAt: (ended ?? new Date()).toISOString(),
    });
  }
  return roles;
}

function parseSkillNames(row: Record<string, unknown>): string[] {
  const fromList = stringList(row.skills);
  const fromObjects = Array.isArray(row.skills)
    ? row.skills
        .map((item) => (item && typeof item === "object" ? str((item as Record<string, unknown>).name) : str(item)))
        .filter((name): name is string => Boolean(name))
    : [];
  const fromTopArr = Array.isArray(row.top_skills)
    ? row.top_skills.map((item) => str(item)).filter((name): name is string => Boolean(name))
    : [];
  const fromTop = (str(row.topSkills) ?? "")
    .split(/[•|,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set([...fromObjects, ...fromList, ...fromTopArr, ...fromTop])].slice(0, 40);
}

function locationText(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.linkedinText === "string" && row.linkedinText.trim()) return row.linkedinText;
  if (typeof row.full === "string" && row.full.trim()) return row.full;
  const parsed = row.parsed;
  if (parsed && typeof parsed === "object") {
    const text = str((parsed as Record<string, unknown>).text);
    if (text) return text;
  }
  return str(row.country) || str(row.city);
}

function pictureUrl(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return null;
  return str((raw as Record<string, unknown>).url);
}

function firstEmail(row: Record<string, unknown>): string | null {
  const direct = str(row.email) || str(row.emailAddress);
  if (direct && direct.includes("@")) return direct.toLowerCase();
  if (Array.isArray(row.emails)) {
    for (const item of row.emails) {
      const value = typeof item === "string" ? item : str((item as Record<string, unknown> | undefined)?.email);
      if (value && value.includes("@")) return value.toLowerCase();
    }
  }
  return null;
}

function slugFromUrl(url: string | null): string | null {
  const canonical = canonicalLinkedin(url);
  if (!canonical) return null;
  return canonical.split("/").filter(Boolean).pop() ?? null;
}

function isCurrent(endDate: unknown) {
  if (!endDate) return true;
  if (typeof endDate === "object") {
    const row = endDate as Record<string, unknown>;
    const text = str(row.text);
    if (text && /present/i.test(text)) return true;
    if (num(row.year)) return false;
    return !text;
  }
  return /present/i.test(String(endDate));
}

function parseYearMonth(raw: unknown): Date | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const year = num(row.year);
  if (!year) return null;
  const month = monthIndex(row.month) ?? 0;
  return new Date(Date.UTC(year, month, 1));
}

function monthIndex(value: unknown): number | null {
  if (typeof value === "number" && value >= 1 && value <= 12) return value - 1;
  const text = str(value)?.slice(0, 3).toLowerCase();
  if (!text) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(text);
  return index === -1 ? null : index;
}

function monthSpan(start: Date | null, end: Date | null) {
  if (!start || !end) return 0;
  return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()));
}

function parseDurationMonths(value: string | null) {
  if (!value) return 0;
  const years = Number(/(\d+)\s*y/i.exec(value)?.[1] ?? 0);
  const months = Number(/(\d+)\s*mo/i.exec(value)?.[1] ?? 0);
  return years * 12 + months;
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => str(item)).filter((item): item is string => Boolean(item));
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
