import type { createAdminClient } from "@/lib/supabase/admin";
import { criteriaSchema } from "@/lib/schemas";
import { logProviderCall } from "@/providers/log";
import {
  asSourceKind,
  source,
  type SourceKind,
  type SourceOptions,
  type SourcedPerson,
} from "@/providers/source";

export type SourceRunRow = {
  id: string;
  job_id: string;
  query: unknown;
  source?: string | null;
  attempts?: number;
};

type Admin = ReturnType<typeof createAdminClient>;

export async function processSourceRun(
  admin: Admin,
  run: SourceRunRow,
  deadline: number,
) {
  const finishFailed = async (message: string, terminal = false) => {
    await admin
      .from("source_runs")
      .update({
        state: "failed",
        last_error: message,
        locked_at: new Date().toISOString(),
        ...(terminal ? { attempts: 3 } : {}),
      })
      .eq("id", run.id);
    return "failed" as const;
  };

  const { data: job } = await admin
    .from("jobs")
    .select("criteria, title")
    .eq("id", run.job_id)
    .single();
  if (!job) return finishFailed("Job not found", true);

  const kind = asSourceKind(run.source);
  const criteria = criteriaSchema.parse(job.criteria ?? {});
  const options = normalizeOptions(run.query, kind);
  if (kind === "linkedin" && !options.titles?.length && job.title) {
    options.titles = [job.title];
  }

  const persistRunId = async (apifyRunId: string) => {
    await admin
      .from("source_runs")
      .update({ query: { ...options, apifyRunId } })
      .eq("id", run.id);
  };

  const result = await source(kind).search({
    criteria,
    options: {
      ...options,
      deadline,
      onRunStarted: kind === "linkedin" ? persistRunId : undefined,
    },
  });

  await logProviderCall(admin, {
    kind: result.meta.kind || `source_${kind}`,
    ok: result.ok,
    meta: result.meta,
    error: result.ok ? undefined : result.error.message,
    refType: "source_run",
    refId: run.id,
  });

  if (!result.ok) {
    return finishFailed(result.error.message, !result.error.retryable);
  }

  const { people, stats } = result.data;
  const kept = await savePeople(admin, run, kind, people);

  await admin
    .from("source_runs")
    .update({
      state: "complete",
      stats,
      found: stats.peopleConsidered,
      kept,
      last_error: stats.partial
        ? `Partial run: ${stats.notes.join("; ") || "budget reached"}`
        : null,
      locked_at: null,
      locked_by: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return "complete" as const;
}

/**
 * Re-running a query refreshes evidence but must not undo a recruiter's
 * promote or reject decision, so existing rows get a field-level update.
 */
async function savePeople(
  admin: Admin,
  run: SourceRunRow,
  kind: SourceKind,
  people: SourcedPerson[],
) {
  if (!people.length) return 0;

  const { data: existing } = await admin
    .from("sourced_people")
    .select("id, external_id")
    .eq("job_id", run.job_id)
    .eq("source", kind);
  const byExternal = new Map(
    (existing ?? []).map((row) => [String(row.external_id).toLowerCase(), row.id]),
  );

  const inserts: Record<string, unknown>[] = [];
  for (const person of people) {
    const row = toRow(person);
    const existingId = byExternal.get(person.externalId.toLowerCase());
    if (existingId) {
      await admin
        .from("sourced_people")
        .update({ ...row, source_run_id: run.id })
        .eq("id", existingId);
    } else {
      inserts.push({
        ...row,
        job_id: run.job_id,
        source_run_id: run.id,
        source: kind,
        external_id: person.externalId,
      });
    }
  }
  if (inserts.length) {
    const { error } = await admin.from("sourced_people").insert(inserts);
    if (error) throw new Error(`Could not save sourced people: ${error.message}`);
  }
  return people.length;
}

function toRow(person: SourcedPerson) {
  return {
    handle: person.handle,
    name: person.name,
    profile_url: person.profileUrl,
    avatar_url: person.avatarUrl,
    location: person.location,
    email: person.email,
    bio: person.bio?.slice(0, 600) ?? null,
    company: person.company,
    blog: person.blog,
    followers: person.followers,
    public_repos: person.publicRepos,
    hireable: person.hireable,
    socials: person.socials ?? [],
    linkedin_url: person.linkedinUrl,
    skills: person.skills,
    evidence: person.evidence,
    matched: person.matched,
    missing: person.missing,
    evidence_score: person.evidenceScore,
    summary: person.summary,
  };
}

export function normalizeOptions(raw: unknown, kind: SourceKind = "linkedin"): SourceOptions {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const skills = Array.isArray(obj.skills)
    ? obj.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
    : [];
  const titles = Array.isArray(obj.titles)
    ? obj.titles.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
    : typeof obj.titles === "string"
      ? obj.titles.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5)
      : [];
  const github = kind === "github";
  return {
    skills,
    titles,
    location: obj.location ? String(obj.location).slice(0, 80) : "",
    minStars: clamp(obj.minStars, 0, 5_000, 3),
    pushedWithinMonths: clamp(obj.pushedWithinMonths, 1, 60, 18),
    limit: clamp(obj.limit, 1, github ? 60 : 40, github ? 25 : 20),
    minEvidence: clamp(obj.minEvidence, 0, 100, github ? 45 : 40),
    repoBudget: clamp(obj.repoBudget, 1, 60, 24),
    minCommitShare: clamp(obj.minCommitShare, 0.05, 1, 0.2),
    apifyRunId: obj.apifyRunId ? String(obj.apifyRunId).slice(0, 80) : undefined,
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
