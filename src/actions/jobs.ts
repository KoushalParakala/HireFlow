"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin";
import { llm } from "@/providers/llm";
import { logProviderCall } from "@/providers/log";
import { criteriaSchema, type JobCriteria } from "@/lib/schemas";
import { DEFAULT_EMAIL } from "@/lib/constants";
import { serverEnv } from "@/lib/env";

async function ownerId() {
  const user = await getUser();
  if (!user?.sub) throw new Error("Not signed in");
  return user.sub as string;
}

async function recordJobCall(
  jobId: string | undefined,
  kind: string,
  result: { ok: boolean; meta: { kind: string; model?: string; durationMs: number }; error?: { message: string } },
) {
  await logProviderCall(tryAdminClient(), {
    kind,
    ok: result.ok,
    meta: result.meta,
    error: result.ok ? undefined : result.error?.message,
    refType: jobId ? "job" : undefined,
    refId: jobId,
  });
}

export async function createJob(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const filters = {
    skills: String(formData.get("skills") ?? ""),
    seniority: String(formData.get("seniority") ?? ""),
    location: String(formData.get("location") ?? ""),
    work_mode: String(formData.get("work_mode") ?? ""),
    source_cap: Number(formData.get("source_cap") ?? 20),
  };
  if (!title || !description) {
    redirect("/jobs/new?error=Title%20and%20job%20description%20are%20required.");
  }
  if (description.length < 80) {
    redirect(
      "/jobs/new?error=Paste%20a%20real%20job%20description%20(at%20least%20a%20few%20sentences).%20The%20interview%20is%20generated%20from%20it.",
    );
  }

  const parsed = await llm().analyzeJd({ title, description, filters });
  await recordJobCall(undefined, "analyze_jd", parsed);
  if (!parsed.ok) {
    if (serverEnv().providerMode === "real") {
      redirect(
        `/jobs/new?error=${encodeURIComponent(`JD analysis failed: ${parsed.error.message}`)}`,
      );
    }
  }
  const criteria: JobCriteria = parsed.ok
    ? parsed.data
    : criteriaSchema.parse({
        must_have: filters.skills
          ? filters.skills.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        nice_to_have: [],
        seniority: filters.seniority,
        location: filters.location,
        summary: `Rules-only criteria (${parsed.ok ? "" : parsed.error.message})`,
      });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      owner_id: await ownerId(),
      title,
      description,
      filters,
      criteria,
      email_template: DEFAULT_EMAIL,
    })
    .select("id")
    .single();
  if (error || !data) {
    redirect(`/jobs/new?error=${encodeURIComponent(error?.message ?? "Could not create job")}`);
  }
  revalidatePath("/jobs");
  redirect(`/jobs/${data.id}/questions`);
}

export async function reanalyzeJob(jobId: string) {
  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("jobs")
    .select("title, description, filters")
    .eq("id", jobId)
    .single();
  if (error || !job) return { error: error?.message ?? "Job not found" };
  const parsed = await llm().analyzeJd({
    title: job.title,
    description: job.description,
    filters: (job.filters ?? {}) as Record<string, unknown>,
  });
  await recordJobCall(jobId, "analyze_jd", parsed);
  if (!parsed.ok) return { error: parsed.error.message };
  const { error: updateError } = await supabase
    .from("jobs")
    .update({ criteria: parsed.data })
    .eq("id", jobId);
  if (updateError) return { error: updateError.message };
  revalidatePath(`/jobs/${jobId}/questions`);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function saveEmailTemplate(jobId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      email_template: {
        subject: String(formData.get("subject") ?? ""),
        body: String(formData.get("body") ?? ""),
      },
    })
    .eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}/invite`);
  return { ok: true };
}

export async function rankSelected(jobId: string, candidateIds: string[]) {
  const supabase = await createClient();
  const [{ data: job }, { data: rows }] = await Promise.all([
    supabase.from("jobs").select("title").eq("id", jobId).single(),
    supabase.from("candidate_pipeline").select("*").in("id", candidateIds),
  ]);
  if (!job) return { error: "Job not found" };
  if (!rows?.length) return { error: "Pick people to rank." };
  const ranking = await llm().rankCandidates({
    jobTitle: job.title,
    candidates: rows.map((r) => ({
      id: r.id,
      name: r.name,
      match: r.match_score,
      stage: r.display_stage,
      overall: r.overall,
    })),
  });
  await recordJobCall(jobId, "rank", ranking);
  if (!ranking.ok) return { error: ranking.error.message };
  return { ok: true as const, narrative: ranking.data.narrative };
}
