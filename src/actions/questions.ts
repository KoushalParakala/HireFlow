"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin";
import { llm } from "@/providers/llm";
import { logProviderCall } from "@/providers/log";
import { coerceCriteria, questionSchema } from "@/lib/schemas";

async function paperLocked(jobId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  return (count ?? 0) > 0;
}

export async function generateQuestions(
  jobId: string,
  counts: { easy: number; medium: number; hard: number },
) {
  if (await paperLocked(jobId)) {
    return { error: "Paper is locked — candidates already have an interview link." };
  }
  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("jobs")
    .select("title, description, criteria")
    .eq("id", jobId)
    .single();
  if (error || !job) return { error: error?.message ?? "Job not found" };

  const result = await llm().generateQuestions({
    title: job.title,
    description: job.description,
    criteria: coerceCriteria(job.criteria),
    easy: counts.easy,
    medium: counts.medium,
    hard: counts.hard,
  });
  await logProviderCall(tryAdminClient(), {
    kind: "generate_questions",
    ok: result.ok,
    meta: result.meta,
    error: result.ok ? undefined : result.error.message,
    refType: "job",
    refId: jobId,
  });
  if (!result.ok) return { error: result.error.message };

  await supabase.from("job_questions").delete().eq("job_id", jobId);
  const rows = result.data.map((q, idx) => ({
    job_id: jobId,
    idx,
    difficulty: q.difficulty,
    text: q.text,
    key_points: q.key_points,
  }));
  const { error: insertError } = await supabase.from("job_questions").insert(rows);
  if (insertError) return { error: insertError.message };
  await supabase.from("jobs").update({ interview_state: "draft" }).eq("id", jobId);
  revalidatePath(`/jobs/${jobId}/questions`);
  return { ok: true };
}

export async function saveQuestions(
  jobId: string,
  questions: Array<{ id?: string; difficulty: string; text: string; key_points: string[] }>,
) {
  const parsed = questions
    .map((q) => questionSchema.safeParse(q))
    .filter((r) => r.success)
    .map((r) => r.data);
  if (!parsed.length) return { error: "Add at least one question." };
  if (await paperLocked(jobId)) {
    return { error: "Paper is locked — candidates already have an interview link." };
  }
  const supabase = await createClient();
  await supabase.from("job_questions").delete().eq("job_id", jobId);
  const { error } = await supabase.from("job_questions").insert(
    parsed.map((q, idx) => ({
      job_id: jobId,
      idx,
      difficulty: q.difficulty,
      text: q.text,
      key_points: q.key_points,
    })),
  );
  if (error) return { error: error.message };
  await supabase.from("jobs").update({ interview_state: "draft" }).eq("id", jobId);
  revalidatePath(`/jobs/${jobId}/questions`);
  return { ok: true };
}

export async function confirmQuestions(jobId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("job_questions")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (!count) return { error: "Save at least one question before confirming." };
  const { error } = await supabase
    .from("jobs")
    .update({ interview_state: "confirmed" })
    .eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}/questions`);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
