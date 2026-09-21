import type { GithubRepo } from "@/lib/github";
import type { SkillSignal } from "@/lib/skills";

/**
 * Reading a dependency manifest costs one core call and returns a declared,
 * machine-readable list of what a project really uses. That is stronger proof
 * than a README and far cheaper than code search, which is capped at 10/min.
 */
const MANIFESTS: Array<{ path: string; languages: string[] }> = [
  { path: "package.json", languages: ["JavaScript", "TypeScript", "Vue", "Svelte"] },
  { path: "requirements.txt", languages: ["Python", "Jupyter Notebook"] },
  { path: "pyproject.toml", languages: ["Python", "Jupyter Notebook"] },
  { path: "go.mod", languages: ["Go"] },
  { path: "Cargo.toml", languages: ["Rust"] },
  { path: "pom.xml", languages: ["Java", "Kotlin", "Scala"] },
  { path: "build.gradle", languages: ["Java", "Kotlin"] },
  { path: "Gemfile", languages: ["Ruby"] },
  { path: "composer.json", languages: ["PHP"] },
  { path: "pubspec.yaml", languages: ["Dart"] },
];

/** At most two manifest reads per repo keeps the core budget predictable. */
export function manifestPathsFor(languages: string[], limit = 2) {
  const wanted = MANIFESTS.filter((m) =>
    m.languages.some((l) => languages.includes(l)),
  ).map((m) => m.path);
  if (!wanted.length) return ["package.json"];
  return wanted.slice(0, limit);
}

export function parseDeps(path: string, text: string): string[] {
  const out = new Set<string>();
  const add = (value: string | undefined) => {
    const clean = value?.trim().toLowerCase().replace(/^['"]|['"]$/g, "");
    if (clean && clean.length > 1) out.add(clean);
  };

  try {
    if (path === "package.json" || path === "composer.json") {
      const json = JSON.parse(text) as Record<string, unknown>;
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "require"]) {
        const block = json[key];
        if (block && typeof block === "object") {
          for (const name of Object.keys(block as Record<string, unknown>)) add(name);
        }
      }
    } else if (path === "requirements.txt") {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
        add(trimmed.split(/[[\]=<>!~;,\s]/)[0]);
      }
    } else if (path === "pyproject.toml") {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
        // Handles both `fastapi = "^0.1"` and `"fastapi>=0.1",` list entries.
        const keyed = trimmed.match(/^["']?([A-Za-z0-9_.-]+)["']?\s*=/);
        if (keyed) add(keyed[1]);
        else {
          const listed = trimmed.match(/^["']([A-Za-z0-9_.-]+)/);
          if (listed) add(listed[1]);
        }
      }
    } else if (path === "go.mod") {
      for (const line of text.split(/\r?\n/)) {
        const match = line.trim().match(/^(?:require\s+)?([a-z0-9.-]+\/[^\s]+)\s+v/);
        if (match) {
          add(match[1]);
          add(match[1].split("/").pop());
        }
      }
    } else if (path === "Cargo.toml") {
      let inDeps = false;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith("[")) {
          inDeps = /^\[(dev-)?dependencies/.test(trimmed);
          continue;
        }
        if (!inDeps) continue;
        const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*=/);
        if (match) add(match[1]);
      }
    } else if (path === "Gemfile") {
      for (const match of text.matchAll(/gem\s+['"]([^'"]+)['"]/g)) add(match[1]);
    } else if (path === "pom.xml") {
      for (const match of text.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) add(match[1]);
    } else if (path === "build.gradle") {
      for (const match of text.matchAll(/['"]([a-z0-9._-]+:[a-z0-9._-]+)(?::[^'"]*)?['"]/gi)) {
        add(match[1]);
        add(match[1].split(":")[1]);
      }
    } else if (path === "pubspec.yaml") {
      let inDeps = false;
      for (const line of text.split(/\r?\n/)) {
        if (/^(dev_)?dependencies:/.test(line)) {
          inDeps = true;
          continue;
        }
        if (/^\S/.test(line)) inDeps = false;
        if (!inDeps) continue;
        const match = line.match(/^\s{2}([A-Za-z0-9_]+):/);
        if (match) add(match[1]);
      }
    }
  } catch {
    return [];
  }
  return [...out];
}

/**
 * Coursework, clones, and profile scaffolding dominate raw GitHub search and
 * are the main reason naive sourcing feels random.
 */
const NOISE =
  /(^|[-_/])(tutorial|tutorials|course|courses|bootcamp|assignment|assignments|homework|exercise|exercises|practice|kata|leetcode|hackerrank|codewars|codechef|interview[-_]?prep|interview[-_]?questions|dsa|awesome|cheat[-_]?sheet|roadmap|curriculum|syllabus|notes|book|books|resources|learning|learn|study|hello[-_]?world|test[-_]?repo|demo|sample|samples|starter|boilerplate|template|skeleton|playground|sandbox|scratch|dotfiles|config|configs|portfolio|resume|cv|clone|todo[-_]?app|todo[-_]?list)([-_/]|$)/i;

const NOISE_DESCRIPTION =
  /(my first|learning|i am learning|practice repo|following along|course project|class project|assignment for|clone of|tutorial series|solutions to)/i;

export function repoNoiseReason(
  repo: Pick<
    GithubRepo,
    "name" | "description" | "fork" | "archived" | "owner" | "size" | "stargazers_count"
  >,
): string | null {
  if (repo.fork) return "fork";
  if (repo.archived) return "archived";
  if (repo.name.toLowerCase() === repo.owner.login.toLowerCase()) return "profile readme";
  if (NOISE.test(repo.name)) return "coursework or scaffold name";
  if (repo.description && NOISE_DESCRIPTION.test(repo.description)) {
    return "description reads as practice work";
  }
  if (repo.size < 60) return "too small to carry evidence";
  if (!repo.description && repo.stargazers_count < 2) return "no description, no traction";
  return null;
}

export type RepoEvidence = {
  full_name: string;
  html_url: string;
  description: string | null;
  stars: number;
  pushed_at: string;
  size: number;
  topics: string[];
  languages: string[];
  deps: string[];
  commits: number;
  total_commits: number;
  share: number;
  proves: string[];
};

type Strength = "dependency" | "topic" | "language" | "mention";

const STRENGTH_WEIGHT: Record<Strength, number> = {
  dependency: 1,
  topic: 0.8,
  language: 0.7,
  mention: 0.45,
};

/** Which signals a single repo can prove, and how convincingly. */
export function matchRepo(
  repo: Pick<RepoEvidence, "topics" | "languages" | "deps" | "description"> & {
    readme?: string | null;
  },
  signals: SkillSignal[],
) {
  const deps = repo.deps.join(" ");
  const text = `${repo.description ?? ""} ${repo.readme ?? ""}`.toLowerCase();
  const found = new Map<string, Strength>();

  for (const signal of signals) {
    let best: Strength | null = null;
    if (signal.deps.some((dep) => deps.includes(dep.toLowerCase()))) best = "dependency";
    else if (signal.topics.some((topic) => repo.topics.includes(topic))) best = "topic";
    else if (signal.languages.some((lang) => repo.languages.includes(lang))) best = "language";
    else if (signal.slug.length >= 3 && text.includes(signal.slug)) best = "mention";
    if (best) found.set(signal.slug, best);
  }
  return found;
}

export type EvidenceResult = {
  score: number;
  matched: Array<{ skill: string; how: Strength; repo: string }>;
  missing: string[];
  skills: string[];
  summary: string;
};

export function scoreEvidence(input: {
  must: SkillSignal[];
  nice: SkillSignal[];
  repos: RepoEvidence[];
  matchesByRepo: Map<string, Map<string, Strength>>;
}): EvidenceResult {
  const { must, nice, repos, matchesByRepo } = input;
  if (!repos.length) {
    return { score: 0, matched: [], missing: must.map((m) => m.skill), skills: [], summary: "" };
  }

  // Best proof for each required skill, across every repo this person built.
  const best = new Map<string, { how: Strength; repo: string }>();
  for (const repo of repos) {
    const found = matchesByRepo.get(repo.full_name);
    if (!found) continue;
    for (const [slug, how] of found) {
      const current = best.get(slug);
      if (!current || STRENGTH_WEIGHT[how] > STRENGTH_WEIGHT[current.how]) {
        best.set(slug, { how, repo: repo.full_name });
      }
    }
  }

  const coverage = must.length
    ? must.reduce((sum, signal) => {
        const hit = best.get(signal.slug);
        return sum + (hit ? STRENGTH_WEIGHT[hit.how] : 0);
      }, 0) / must.length
    : 0;
  const niceCoverage = nice.length
    ? nice.filter((signal) => best.has(signal.slug)).length / nice.length
    : 0;

  const ownership = Math.min(
    1,
    Math.max(...repos.map((repo) => repo.share)) * 1.1,
  );
  const recency = Math.max(...repos.map((repo) => recencyScore(repo.pushed_at)));
  const substance = Math.max(...repos.map(substanceScore));

  const score = Math.round(
    100 *
      (0.45 * coverage +
        0.2 * ownership +
        0.15 * recency +
        0.15 * substance +
        0.05 * niceCoverage),
  );

  const matched = [...best.entries()]
    .map(([slug, hit]) => ({
      skill: [...must, ...nice].find((s) => s.slug === slug)?.skill ?? slug,
      how: hit.how,
      repo: hit.repo,
    }))
    .sort((a, b) => STRENGTH_WEIGHT[b.how] - STRENGTH_WEIGHT[a.how]);

  const missing = must.filter((s) => !best.has(s.slug)).map((s) => s.skill);
  const skills = dedupeSkills(repos, must, nice, best);

  return {
    score: Math.max(0, Math.min(100, score)),
    matched,
    missing,
    skills,
    summary: buildSummary(repos, matched),
  };
}

function recencyScore(pushedAt: string) {
  const days = (Date.now() - new Date(pushedAt).getTime()) / 86_400_000;
  if (!Number.isFinite(days)) return 0.3;
  if (days <= 60) return 1;
  if (days <= 180) return 0.8;
  if (days <= 365) return 0.55;
  if (days <= 730) return 0.3;
  return 0.1;
}

function substanceScore(repo: RepoEvidence) {
  const stars = Math.min(1, Math.log10(repo.stars + 1) / 2.2);
  const commits = Math.min(1, Math.log10(repo.commits + 1) / 2.2);
  const size = Math.min(1, repo.size / 6_000);
  return 0.4 * stars + 0.4 * commits + 0.2 * size;
}

function dedupeSkills(
  repos: RepoEvidence[],
  must: SkillSignal[],
  nice: SkillSignal[],
  best: Map<string, { how: Strength; repo: string }>,
) {
  const out = new Set<string>();
  for (const signal of [...must, ...nice]) {
    if (best.has(signal.slug)) out.add(signal.skill);
  }
  // Languages and topics the repos actually carry, so post-promotion rule
  // scoring sees real stack terms rather than only the JD's vocabulary.
  for (const repo of repos.slice(0, 4)) {
    for (const language of repo.languages.slice(0, 3)) out.add(language);
    for (const topic of repo.topics.slice(0, 4)) out.add(topic);
  }
  return [...out].slice(0, 24);
}

function buildSummary(
  repos: RepoEvidence[],
  matched: Array<{ skill: string; how: Strength; repo: string }>,
) {
  const lines = repos.slice(0, 3).map((repo) => {
    const share = Math.round(repo.share * 100);
    const proof = repo.deps.length
      ? ` Declared deps include ${repo.deps.slice(0, 6).join(", ")}.`
      : "";
    return `${repo.full_name} — ${repo.commits} of ${repo.total_commits} commits (${share}%), ${repo.stars}★, ${repo.languages.slice(0, 3).join("/") || "unknown stack"}, last push ${shortDate(repo.pushed_at)}.${proof}`;
  });
  const proven = matched
    .filter((m) => m.how === "dependency")
    .map((m) => m.skill)
    .slice(0, 8);
  if (proven.length) {
    lines.push(`Dependency-level proof for: ${proven.join(", ")}.`);
  }
  return lines.join("\n");
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 10);
}
