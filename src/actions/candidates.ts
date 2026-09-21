"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { llm } from "@/providers/llm";
import { ruleScore, combinedScore } from "@/lib/scoring";
import { criteriaSchema } from "@/lib/schemas";
import { canonicalLinkedin, linkedinFromText } from "@/lib/social";
import { AUTO_SHORTLIST_CAP, AUTO_SHORTLIST_MIN_SCORE } from "@/lib/constants";

export async function addReferral(
  jobId: string,
  input: { name: string; email: string; title?: string; company?: string },
) {
  if (!input.name.trim() || !input.email.trim()) {
    return { error: "Name and email are required." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("candidates").insert({
    job_id: jobId,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    title: input.title?.trim() || null,
    company: input.company?.trim() || null,
    source: "referral",
    stage: "shortlisted",
  });
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function importCsv(jobId: string, csv: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "CSV needs a header row and at least one person." };
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = idx("email") >= 0 ? cols[idx("email")] : "";
    const name = (idx("name") >= 0 ? cols[idx("name")] : "") || email || "Unknown";
    rows.push({
      job_id: jobId,
      name,
      email: email ? email.toLowerCase() : null,
      title: idx("title") >= 0 ? cols[idx("title")] : null,
      company: idx("company") >= 0 ? cols[idx("company")] : null,
      location: idx("location") >= 0 ? cols[idx("location")] : null,
      source: "csv" as const,
      stage: email ? "shortlisted" : "added",
    });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("candidates").insert(rows);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, inserted: rows.length };
}

export async function setShortlist(jobId: string, candidateId: string, on: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ stage: on ? "shortlisted" : "scored" })
    .eq("id", candidateId);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function scoreJobCandidates(jobId: string) {
  const supabase = await createClient();
  const [{ data: job }, { data: candidates }] = await Promise.all([
    supabase.from("jobs").select("criteria").eq("id", jobId).single(),
    supabase.from("candidates").select("*").eq("job_id", jobId).in("stage", ["added", "scored"]),
  ]);
  if (!job) return { error: "Job not found" };
  const criteria = criteriaSchema.parse(job.criteria ?? {});
  let auto = 0;
  for (const candidate of candidates ?? []) {
    const skills = Array.isArray(candidate.skills)
      ? (candidate.skills as string[])
      : [];
    const rule = ruleScore({
      criteria,
      skills,
      title: candidate.title,
      location: candidate.location,
      experience: candidate.experience_summary,
    });
    const fit = await llm().scoreAnswer({
      question: `Does this profile fit: ${JSON.stringify(criteria)}`,
      keyPoints: criteria.must_have,
      transcript: `${candidate.name} ${candidate.title} ${candidate.company} ${skills.join(" ")} ${candidate.experience_summary ?? ""}`,
    });
    const fitScore = fit.ok
      ? Math.round(
          ((fit.data.relevance + fit.data.depth + fit.data.specificity + fit.data.clarity) /
            20) *
            100,
        )
      : null;
    const match = combinedScore(rule, fitScore);
    const shouldShortlist =
      match != null &&
      match >= AUTO_SHORTLIST_MIN_SCORE &&
      auto < AUTO_SHORTLIST_CAP &&
      candidate.stage === "added";
    if (shouldShortlist) auto += 1;
    await supabase
      .from("candidates")
      .update({
        rule_score: rule,
        fit_score: fitScore,
        score_state: fit.ok ? "complete" : "rules_only",
        match_summary: fit.ok ? fit.data.summary : `Rules only: ${fit.error.message}`,
        stage: shouldShortlist ? "shortlisted" : "scored",
      })
      .eq("id", candidate.id);
  }
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, autoShortlisted: auto };
}

/**
 * The recruiter views a profile in their own browser and pastes the text, so
 * the only automated step is reading what they already have. Extraction is
 * best-effort: if it fails the paste still lands as raw text, because losing
 * what someone copied is worse than storing it unparsed.
 */
export async function pasteProfile(
  jobId: string,
  input: { text: string; name?: string; email?: string },
) {
  const text = input.text.trim();
  if (!text) return { error: "Paste a profile first." };
  const supabase = await createClient();

  const parsed = await llm().parseProfile({ text });
  const profile = parsed.ok ? parsed.data : null;

  const name = input.name?.trim() || profile?.name || "Pasted profile";
  const email = (input.email?.trim() || profile?.email || "").toLowerCase() || null;
  const linkedinUrl = canonicalLinkedin(profile?.linkedin_url) ?? linkedinFromText(text);
  const skills = profile?.skills ?? [];

  const row = {
    job_id: jobId,
    name,
    email,
    title: profile?.title || null,
    company: profile?.company || null,
    location: profile?.location || null,
    linkedin_url: linkedinUrl,
    skills,
    experience_summary: summarize(profile?.summary, text),
    source: linkedinUrl ? ("linkedin" as const) : ("paste" as const),
    stage: email ? ("shortlisted" as const) : ("added" as const),
  };

  // Pasting the same person twice should refresh them, not duplicate them.
  const existing = await findCandidate(supabase, jobId, email, linkedinUrl);
  const { error } = existing
    ? await supabase.from("candidates").update(row).eq("id", existing)
    : await supabase.from("candidates").insert(row);
  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {
    ok: true as const,
    parsed: parsed.ok,
    updated: Boolean(existing),
    name,
    skills: skills.length,
    linkedinUrl,
    note: parsed.ok
      ? undefined
      : `Saved the text but could not parse it: ${parsed.error.message}`,
  };
}

/** Keep the raw paste alongside the summary so nothing the recruiter copied is lost. */
function summarize(summary: string | undefined, text: string) {
  const parts = [summary?.trim(), `Pasted profile:\n${text}`].filter(Boolean);
  return parts.join("\n\n").slice(0, 8_000);
}

async function findCandidate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  email: string | null,
  linkedinUrl: string | null,
) {
  if (!email && !linkedinUrl) return null;
  const filters = [
    email ? `email.eq.${email}` : "",
    linkedinUrl ? `linkedin_url.eq.${linkedinUrl}` : "",
  ].filter(Boolean);
  const { data } = await supabase
    .from("candidates")
    .select("id")
    .eq("job_id", jobId)
    .or(filters.join(","))
    .limit(1);
  return data?.[0]?.id ?? null;
}
