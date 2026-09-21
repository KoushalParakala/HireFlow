"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeOptions } from "@/lib/sourcing";
import { kickWorker } from "@/lib/worker";
import { asSourceKind, type SourceKind } from "@/providers/source";

export type SourceFormInput = {
  source?: SourceKind;
  skills?: string[];
  titles?: string[];
  location?: string;
  minStars?: number;
  pushedWithinMonths?: number;
  limit?: number;
  minEvidence?: number;
  repoBudget?: number;
  minCommitShare?: number;
};

export async function startSourceRun(jobId: string, input: SourceFormInput) {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, criteria")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "Job not found" };

  const kind = asSourceKind(input.source);
  const criteria = (job.criteria ?? {}) as { must_have?: unknown };
  const mustHave = Array.isArray(criteria.must_have) ? criteria.must_have : [];
  const options = normalizeOptions(
    {
      ...input,
      titles:
        kind === "linkedin"
          ? input.titles?.length
            ? input.titles
            : job.title
              ? [job.title]
              : []
          : input.titles ?? [],
    },
    kind,
  );
  if (!mustHave.length && !options.skills?.length) {
    return {
      error: "Analyse the JD or type at least one skill before sourcing.",
    };
  }

  const { data: running } = await supabase
    .from("source_runs")
    .select("id")
    .eq("job_id", jobId)
    .in("state", ["queued", "running"])
    .limit(1);
  if (running?.length) {
    return { error: "A sourcing run is already in flight for this job." };
  }

  const { data, error } = await supabase
    .from("source_runs")
    .insert({ job_id: jobId, source: kind, query: options })
    .select("id")
    .single();
  if (error) return { error: error.message };

  after(() => kickWorker("source"));
  revalidatePath(`/jobs/${jobId}/source`);
  return { ok: true as const, runId: data.id };
}

export async function rejectSourced(jobId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sourced_people")
    .update({ state: "rejected" })
    .eq("id", id)
    .eq("job_id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}/source`);
  return { ok: true as const };
}

export async function restoreSourced(jobId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sourced_people")
    .update({ state: "new" })
    .eq("id", id)
    .eq("job_id", jobId)
    .is("candidate_id", null);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}/source`);
  return { ok: true as const };
}

/**
 * Promotion is the gate: nothing enters the pipeline until a human picks it,
 * and the dossier travels with the person so scoring has real evidence.
 */
export async function promoteSourced(jobId: string, ids: string[]) {
  if (!ids.length) return { error: "Select someone to promote." };
  const supabase = await createClient();

  const { data: people, error: readError } = await supabase
    .from("sourced_people")
    .select("*")
    .eq("job_id", jobId)
    .in("id", ids);
  if (readError) return { error: readError.message };
  if (!people?.length) return { error: "Nothing to promote." };

  const { data: existing } = await supabase
    .from("candidates")
    .select("id, email, profile_url, linkedin_url")
    .eq("job_id", jobId);

  const byUrl = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const row of existing ?? []) {
    if (row.profile_url) byUrl.set(String(row.profile_url).toLowerCase(), row.id);
    if (row.linkedin_url) byUrl.set(String(row.linkedin_url).toLowerCase(), row.id);
    if (row.email) byEmail.set(String(row.email).toLowerCase(), row.id);
  }

  let promoted = 0;
  let linked = 0;
  const problems: string[] = [];

  for (const person of people) {
    if (person.state === "promoted" && person.candidate_id) continue;
    const fromGithub = person.source === "github";
    const profileUrl = person.profile_url ? String(person.profile_url).toLowerCase() : "";
    const linkedinUrl = person.linkedin_url ? String(person.linkedin_url).toLowerCase() : "";
    const email = person.email ? String(person.email).toLowerCase() : "";
    const duplicate =
      (linkedinUrl && byUrl.get(linkedinUrl)) ||
      (profileUrl && byUrl.get(profileUrl)) ||
      (email && byEmail.get(email)) ||
      null;

    if (duplicate) {
      await supabase
        .from("sourced_people")
        .update({ state: "promoted", candidate_id: duplicate })
        .eq("id", person.id);
      linked += 1;
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("candidates")
      .insert({
        job_id: jobId,
        name: person.name || person.handle || (fromGithub ? "GitHub profile" : "LinkedIn profile"),
        email: email || null,
        title: person.bio ? String(person.bio).slice(0, 120) : null,
        company: person.company,
        location: person.location,
        source: fromGithub ? "github" : "linkedin",
        skills: person.skills ?? [],
        experience_summary: dossier(person),
        profile_url: fromGithub ? person.profile_url : person.linkedin_url || person.profile_url,
        linkedin_url: person.linkedin_url,
        stage: "added",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      problems.push(`${person.handle}: ${error?.message ?? "insert failed"}`);
      continue;
    }
    if (profileUrl) byUrl.set(profileUrl, inserted.id);
    if (linkedinUrl) byUrl.set(linkedinUrl, inserted.id);
    if (email) byEmail.set(email, inserted.id);
    await supabase
      .from("sourced_people")
      .update({ state: "promoted", candidate_id: inserted.id })
      .eq("id", person.id);
    promoted += 1;
  }

  revalidatePath(`/jobs/${jobId}/source`);
  revalidatePath(`/jobs/${jobId}`);
  return {
    ok: true as const,
    promoted,
    linked,
    error: problems.length ? problems.join("; ") : undefined,
  };
}

function dossier(person: Record<string, unknown>) {
  const fromGithub = person.source === "github";
  const matched = Array.isArray(person.matched)
    ? (person.matched as Array<{ skill?: string; how?: string }>)
    : [];
  const missing = Array.isArray(person.missing) ? (person.missing as string[]) : [];
  const parts = [
    person.bio ? String(person.bio) : "",
    person.summary
      ? `${fromGithub ? "Project evidence" : "Profile evidence"}:\n${String(person.summary)}`
      : "",
    matched.length
      ? `Matched from the JD: ${matched.map((m) => `${m.skill} (${m.how})`).join(", ")}`
      : "",
    missing.length
      ? fromGithub
        ? `Not proven on GitHub: ${missing.join(", ")}`
        : `Not found on the LinkedIn profile: ${missing.join(", ")}`
      : "",
    person.profile_url
      ? `${fromGithub ? "GitHub" : "LinkedIn"}: ${String(person.profile_url)}`
      : "",
    fromGithub && person.linkedin_url ? `LinkedIn: ${String(person.linkedin_url)}` : "",
  ];
  return parts.filter(Boolean).join("\n\n").slice(0, 8_000);
}
