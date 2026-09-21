"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  promoteSourced,
  rejectSourced,
  restoreSourced,
  startSourceRun,
} from "@/actions/sourcing";
import { linkedinSearchUrl } from "@/lib/social";

type EvidenceRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stars: number;
  pushed_at: string;
  languages: string[];
  deps: string[];
  commits: number;
  total_commits: number;
  share: number;
};

type Matched = { skill: string; how: string; repo: string };

export type PersonRow = {
  id: string;
  handle: string | null;
  name: string | null;
  profile_url: string | null;
  linkedin_url: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  company: string | null;
  followers: number | null;
  public_repos: number | null;
  hireable: boolean | null;
  skills: unknown;
  evidence: unknown;
  matched: unknown;
  missing: unknown;
  evidence_score: number | null;
  summary: string | null;
  state: string;
  candidate_id: string | null;
  source?: string | null;
};

export type RunRow = {
  id: string;
  state: string;
  source?: string | null;
  query: unknown;
  stats: unknown;
  found: number;
  kept: number;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
};

export function SourcePanel({
  jobId,
  jobTitle,
  mustHave,
  jobLocation,
  runs,
  people,
}: {
  jobId: string;
  jobTitle: string;
  mustHave: string[];
  jobLocation: string;
  runs: RunRow[];
  people: PersonRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const active = runs.find((run) => run.state === "queued" || run.state === "running");
  const latest = runs[0];
  const defaultSource = latest?.source === "github" ? "github" : "linkedin";
  const activeIsGithub = active?.source === "github";

  // Apify LinkedIn scrapes take a minute or two; refresh while one is in flight.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [active, router]);

  const visible = useMemo(
    () => people.filter((p) => (showRejected ? true : p.state !== "rejected")),
    [people, showRejected],
  );
  const promotable = visible.filter((p) => p.state === "new");

  return (
    <div className="space-y-8">
      <QueryForm
        jobId={jobId}
        jobTitle={jobTitle}
        mustHave={mustHave}
        jobLocation={jobLocation}
        defaultSource={defaultSource}
        disabled={pending || Boolean(active)}
        onDone={(message) => {
          setMsg(message);
          router.refresh();
        }}
      />

      {active && (
        <p className="rounded-2xl border border-accent/30 bg-white p-4 text-sm">
          Run {active.state}.{" "}
          {activeIsGithub
            ? "GitHub search is paced to stay inside the free rate limit, so this takes a few minutes."
            : "Apify is searching LinkedIn and opening full profiles, so this takes a minute or two."}{" "}
          This page refreshes itself.
        </p>
      )}
      {!active && latest?.state === "failed" && (
        <p className="rounded-2xl border border-danger/40 bg-white p-4 text-sm text-danger">
          Last run failed: {latest.last_error ?? "unknown error"}
        </p>
      )}
      {msg && <p className="text-sm text-muted">{msg}</p>}

      {Boolean(runs.length) && <RunStats runs={runs} />}

      {Boolean(visible.length) && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !selected.length}
            className="rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={() =>
              start(async () => {
                const result = await promoteSourced(jobId, selected);
                if ("error" in result && result.error && !("promoted" in result)) {
                  setMsg(result.error);
                  return;
                }
                const promoted = "promoted" in result ? result.promoted : 0;
                const linked = "linked" in result ? result.linked : 0;
                setMsg(
                  `Promoted ${promoted}${linked ? `, linked ${linked} already in the pipeline` : ""}. Run "Score added people" on the pipeline next.${result.error ? ` Problems: ${result.error}` : ""}`,
                );
                setSelected([]);
                router.refresh();
              })
            }
          >
            Promote {selected.length || ""} to pipeline
          </button>
          <button
            type="button"
            disabled={pending || !promotable.length}
            className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
            onClick={() => setSelected(promotable.map((p) => p.id))}
          >
            Select all {promotable.length} new
          </button>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showRejected}
              onChange={(e) => setShowRejected(e.target.checked)}
            />
            Show skipped
          </label>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="p-3" />
              <th className="p-3">Person</th>
              <th className="p-3">Evidence</th>
              <th className="p-3">Proven from JD</th>
              <th className="p-3">Top evidence</th>
              <th className="p-3">Contact</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((person) => {
              const repos = asRepos(person.evidence);
              const matched = asMatched(person.matched);
              const missing = asStrings(person.missing);
              const top = repos[0];
              const expanded = open === person.id;
              const fromGithub = person.source === "github";
              return (
                <tr key={person.id} className="border-b border-line align-top last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      disabled={person.state !== "new"}
                      checked={selected.includes(person.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, person.id]
                            : s.filter((id) => id !== person.id),
                        )
                      }
                    />
                  </td>
                  <td className="p-3">
                    <a
                      href={person.profile_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent"
                    >
                      {person.name || person.handle}
                    </a>
                    <div className="text-xs text-muted">
                      {fromGithub ? `@${person.handle}` : person.bio}
                      {person.location ? ` · ${person.location}` : ""}
                      {person.hireable ? " · open to work" : ""}
                    </div>
                    {person.state !== "new" && (
                      <div className="mt-1 text-xs uppercase tracking-wide text-accent-2">
                        {person.state}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                      {fromGithub ? "GitHub" : "LinkedIn"}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="font-medium">{person.evidence_score ?? "—"}</span>
                    <div className="text-xs text-muted">
                      {repos.length} {fromGithub ? "project" : "role"}
                      {repos.length === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {matched.slice(0, 5).map((m) => (
                        <span
                          key={`${m.skill}-${m.repo}`}
                          title={`${m.how} match in ${m.repo}`}
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            m.how === "dependency"
                              ? "bg-accent/15 text-accent"
                              : "bg-line/60 text-muted"
                          }`}
                        >
                          {m.skill}
                        </span>
                      ))}
                    </div>
                    {Boolean(missing.length) && (
                      <div className="mt-1 text-xs text-muted">
                        unproven: {missing.slice(0, 3).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {top ? (
                      <>
                        <a
                          href={top.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent"
                        >
                          {top.full_name}
                        </a>
                        <div className="text-xs text-muted">
                          {fromGithub
                            ? `${Math.round(top.share * 100)}% of ${top.total_commits} commits by top contributors · ${top.stars}★`
                            : `${top.commits} mo in role`}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {person.email ? (
                      <div>{person.email}</div>
                    ) : (
                      <div className="text-muted">no public email</div>
                    )}
                    <LinkedinCell person={person} />
                  </td>
                  <td className="p-3 text-right text-xs">
                    <button
                      type="button"
                      className="text-muted"
                      onClick={() => setOpen(expanded ? null : person.id)}
                    >
                      {expanded ? "Hide" : "Evidence"}
                    </button>
                    {person.state === "new" && (
                      <button
                        type="button"
                        disabled={pending}
                        className="ml-3 text-muted"
                        onClick={() =>
                          start(async () => {
                            await rejectSourced(jobId, person.id);
                            router.refresh();
                          })
                        }
                      >
                        Skip
                      </button>
                    )}
                    {person.state === "rejected" && (
                      <button
                        type="button"
                        disabled={pending}
                        className="ml-3 text-muted"
                        onClick={() =>
                          start(async () => {
                            await restoreSourced(jobId, person.id);
                            router.refresh();
                          })
                        }
                      >
                        Restore
                      </button>
                    )}
                    {expanded && (
                      <div className="mt-3 max-w-xl text-left">
                        {person.bio && <p className="text-xs text-muted">{person.bio}</p>}
                        <ul className="mt-2 space-y-2">
                          {repos.map((repo) => (
                            <li key={repo.full_name} className="rounded border border-line p-2">
                              <a
                                href={repo.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent"
                              >
                                {repo.full_name}
                              </a>
                              <div className="text-muted">
                                {fromGithub
                                  ? `${repo.commits}/${repo.total_commits} commits · ${repo.languages.slice(0, 3).join("/") || "unknown stack"} · last push ${repo.pushed_at.slice(0, 10)}`
                                  : `${repo.commits} mo · ${repo.pushed_at.slice(0, 10)}`}
                              </div>
                              {repo.description && (
                                <div className="mt-1 text-muted">{repo.description}</div>
                              )}
                              {Boolean(repo.deps.length) && (
                                <div className="mt-1 font-mono text-[11px] text-muted">
                                  {repo.deps.slice(0, 12).join(" · ")}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={7} className="p-6 text-muted">
                  No sourced people yet. Pick LinkedIn or GitHub above and run a
                  search. Referrals and CSV still work for people you already have.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QueryForm({
  jobId,
  jobTitle,
  mustHave,
  jobLocation,
  defaultSource,
  disabled,
  onDone,
}: {
  jobId: string;
  jobTitle: string;
  mustHave: string[];
  jobLocation: string;
  defaultSource: "github" | "linkedin";
  disabled: boolean;
  onDone: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState<"github" | "linkedin">(defaultSource);
  const github = origin === "github";
  return (
    <form
      className="rounded-2xl border border-line bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const skills = String(form.get("skills") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const titles = String(form.get("titles") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        start(async () => {
          const result = await startSourceRun(jobId, {
            source: origin,
            skills,
            titles,
            location: String(form.get("location") ?? ""),
            minStars: Number(form.get("minStars")),
            pushedWithinMonths: Number(form.get("pushedWithinMonths")),
            limit: Number(form.get("limit")),
            minEvidence: Number(form.get("minEvidence")),
            minCommitShare: Number(form.get("minCommitShare")) / 100,
          });
          onDone(
            "error" in result && result.error
              ? result.error
              : "Run queued. The worker picks it up within a minute.",
          );
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-2xl">
          {github ? "Search by project, not by profile" : "Search LinkedIn profiles"}
        </h2>
        <div className="flex rounded-full border border-line p-1 text-sm">
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => setOrigin("linkedin")}
            className={`rounded-full px-4 py-1.5 ${
              !github ? "bg-accent text-white" : "text-muted"
            }`}
          >
            LinkedIn
          </button>
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => setOrigin("github")}
            className={`rounded-full px-4 py-1.5 ${
              github ? "bg-accent text-white" : "text-muted"
            }`}
          >
            GitHub
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        {github
          ? "Skills come from the JD analysis. Each one maps to GitHub topics, languages, and dependency names, and a match only counts when it shows up in a repo the person actually committed to."
          : "Skills come from the JD analysis. Apify searches LinkedIn people with the role title and those keywords, then we score each full profile against the same skill list."}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {!github && (
          <label className="text-sm">
            Current titles
            <input
              name="titles"
              defaultValue={jobTitle}
              placeholder="Software Engineer, Backend Engineer"
              className="mt-1 w-full rounded border border-line px-2 py-1.5"
            />
            <span className="text-xs text-muted">Comma separated. Filters current role.</span>
          </label>
        )}
        <label className={`text-sm ${github ? "md:col-span-1" : ""}`}>
          {github ? "Skills to prove" : "Skills to match"}
          <input
            name="skills"
            defaultValue={mustHave.join(", ")}
            placeholder="langchain, fastapi, postgres"
            className="mt-1 w-full rounded border border-line px-2 py-1.5"
          />
          <span className="text-xs text-muted">Comma separated.</span>
        </label>
        <label className={`text-sm ${github ? "" : "md:col-span-2"}`}>
          Location contains
          <input
            name="location"
            placeholder={jobLocation ? `${jobLocation} — blank searches everywhere` : "India"}
            className="mt-1 w-full rounded border border-line px-2 py-1.5"
          />
          <span className="text-xs text-muted">
            {github
              ? "Blank by default on purpose. GitHub profile location is free text, so a city name cuts most of the funnel; a country is the safer filter."
              : "Sent to LinkedIn search. Use a country or city LinkedIn understands (United Kingdom, not UK)."}
          </span>
        </label>
      </div>
      {github ? (
        <div className="mt-4 grid gap-4 md:grid-cols-5">
          <Num name="minStars" label="Min stars" value={3} />
          <Num name="pushedWithinMonths" label="Pushed within (months)" value={18} />
          <Num name="minCommitShare" label="Min commit share %" value={20} />
          <Num name="minEvidence" label="Min evidence score" value={45} />
          <Num name="limit" label="Max people" value={25} />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Num name="minEvidence" label="Min evidence score" value={40} />
          <Num name="limit" label="Max people" value={20} />
        </div>
      )}
      <button
        type="submit"
        disabled={disabled || pending}
        className="mt-5 rounded-full bg-accent px-5 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Queueing…" : github ? "Run GitHub sourcing" : "Run LinkedIn sourcing"}
      </button>
    </form>
  );
}

function Num({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="text-sm">
      {label}
      <input
        type="number"
        name={name}
        defaultValue={value}
        className="mt-1 w-full rounded border border-line px-2 py-1.5"
      />
    </label>
  );
}

function RunStats({ runs }: { runs: RunRow[] }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-sm">
      <h3 className="font-medium">Recent runs</h3>
      <ul className="mt-2 space-y-2">
        {runs.map((run) => {
          const stats = asStats(run.stats);
          // stats is an empty object until the worker finishes, so rendering it
          // mid-run would report zeros for work that is still happening.
          const done = Boolean(stats?.queries?.length);
          return (
            <li key={run.id} className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted">
              <span className="capitalize text-ink">{run.state}</span>
              <span className="uppercase tracking-wide">{run.source === "github" ? "GitHub" : "LinkedIn"}</span>
              <span>{new Date(run.created_at).toLocaleString()}</span>
              {done && stats ? (
                <span>
                  {run.source === "github" ? (
                    <>
                      {stats.queries?.length ?? 0} queries · {stats.reposFound ?? 0} repos found ·{" "}
                      {stats.reposInspected ?? 0} inspected · {stats.peopleConsidered ?? 0} people
                      considered · {run.kept} kept
                      {stats.withLinkedin ? ` · ${stats.withLinkedin} with LinkedIn` : ""}
                      {stats.authed === false ? " · anonymous rate limit" : ""}
                    </>
                  ) : (
                    <>
                      {stats.queries?.length ?? 0} queries · {stats.peopleFound ?? stats.reposFound ?? 0}{" "}
                      profiles · {stats.peopleConsidered ?? 0} considered · {run.kept} kept
                    </>
                  )}
                  {stats.partial ? " · partial" : ""}
                </span>
              ) : (
                <span>working…</span>
              )}
              {done && <DropReason run={run} stats={stats} />}
              {run.last_error && <span className="text-danger">{run.last_error}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A declared link is the person's own; a search link is a guess the recruiter
 * resolves themselves. Those must not look alike, or a guess gets treated as a
 * confirmed profile.
 */
function LinkedinCell({ person }: { person: PersonRow }) {
  if (person.linkedin_url) {
    return (
      <a
        href={person.linkedin_url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block text-accent"
        title={person.source === "github" ? "Listed on their own GitHub profile" : "LinkedIn profile from Apify"}
      >
        LinkedIn ✓
      </a>
    );
  }
  const search = linkedinSearchUrl(person.name || person.handle, person.company);
  if (!search) return null;
  return (
    <a
      href={search}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-block text-muted underline decoration-dotted"
      title="Not declared — this searches LinkedIn in your own browser"
    >
      search LinkedIn
    </a>
  );
}

/**
 * A run that keeps nobody is the confusing case, so say which filter did it
 * rather than leaving the recruiter to guess at a row of zeros.
 */
function DropReason({
  run,
  stats,
}: {
  run: RunRow;
  stats: ReturnType<typeof asStats>;
}) {
  if (!stats) return null;
  const byLocation = stats.droppedLocation ?? 0;
  const byScore = stats.droppedScore ?? 0;
  const unknown = stats.locationUnknown ?? 0;
  const query = (run.query ?? {}) as { location?: string; minEvidence?: number };

  if (!run.kept && byLocation) {
    return (
      <span className="text-danger">
        every match dropped by location &ldquo;{query.location}&rdquo; — clear that field
        and re-run
      </span>
    );
  }
  const parts: string[] = [];
  if (byLocation) parts.push(`${byLocation} cut by location`);
  if (byScore) parts.push(`${byScore} below score ${query.minEvidence ?? (run.source === "github" ? 45 : 40)}`);
  if (unknown) parts.push(`${unknown} with no public location`);
  if (!run.kept && !parts.length) {
    return <span className="text-danger">no evidence strong enough — lower min evidence score</span>;
  }
  return parts.length ? <span>{parts.join(" · ")}</span> : null;
}

function asRepos(value: unknown): EvidenceRepo[] {
  return Array.isArray(value) ? (value as EvidenceRepo[]) : [];
}

function asMatched(value: unknown): Matched[] {
  return Array.isArray(value) ? (value as Matched[]) : [];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function asStats(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as {
    authed?: boolean;
    queries?: string[];
    peopleFound?: number;
    reposFound?: number;
    reposInspected?: number;
    peopleConsidered?: number;
    droppedLocation?: number;
    droppedScore?: number;
    locationUnknown?: number;
    withLinkedin?: number;
    partial?: boolean;
  };
}
