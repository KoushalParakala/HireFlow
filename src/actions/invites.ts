"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInterviewToken } from "@/lib/tokens";
import { serverEnv } from "@/lib/env";
import { kickWorker } from "@/lib/worker";

function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function inviteCandidates(jobId: string, candidateIds: string[]) {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("interview_state, title")
    .eq("id", jobId)
    .single();
  if (!job) return { error: "Job not found" };
  if (job.interview_state !== "confirmed") {
    return { error: "Confirm the interview paper before inviting anyone." };
  }
  const { data: questions } = await supabase
    .from("job_questions")
    .select("id")
    .eq("job_id", jobId)
    .order("idx");
  if (!questions?.length) return { error: "No questions on this job." };

  const { data: people } = await supabase
    .from("candidates")
    .select("id, name, email, stage")
    .eq("job_id", jobId)
    .in("id", candidateIds);

  const links: Array<{ candidateId: string; name: string; email: string | null; url: string }> = [];
  for (const person of people ?? []) {
    if (person.stage !== "shortlisted") continue;
    const token = createInterviewToken();
    const order = shuffle(questions.map((q) => q.id));
    const { data: interview, error } = await supabase
      .from("interviews")
      .insert({
        candidate_id: person.id,
        job_id: jobId,
        token_hash: token.hash,
        token_prefix: token.prefix,
        question_order: order,
        state: "pending",
        email_state: person.email ? "queued" : "not_sent",
        pending_email_token: person.email ? token.raw : null,
      })
      .select("id")
      .single();
    if (error || !interview) return { error: error?.message ?? "Could not create invite" };
    const answers = order.map((questionId, idx) => ({
      interview_id: interview.id,
      question_id: questionId,
      idx,
    }));
    const { error: answerError } = await supabase.from("interview_answers").insert(answers);
    if (answerError) return { error: answerError.message };
    await supabase.from("candidates").update({ stage: "invited" }).eq("id", person.id);
    links.push({
      candidateId: person.id,
      name: person.name,
      email: person.email,
      url: `${serverEnv().appUrl}/i/${token.raw}`,
    });
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invite`);
  after(() => kickWorker());
  return { ok: true, links };
}

export async function reinviteCandidate(jobId: string, candidateId: string) {
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("candidates")
    .select("id, name, email, stage")
    .eq("id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (!person) return { error: "Candidate not found" };

  const { data: interview } = await supabase
    .from("interviews")
    .select("id, state")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!interview) {
    if (person.stage !== "shortlisted") {
      await supabase.from("candidates").update({ stage: "shortlisted" }).eq("id", candidateId);
    }
    return inviteCandidates(jobId, [candidateId]);
  }
  if (["submitted", "scoring", "complete"].includes(interview.state)) {
    return {
      error:
        "This interview is already submitted. Use “Retake failed questions” to reopen only the failed answers.",
    };
  }

  const token = createInterviewToken();
  const { error } = await supabase
    .from("interviews")
    .update({
      token_hash: token.hash,
      token_prefix: token.prefix,
      pending_email_token: person.email ? token.raw : null,
      email_state: person.email ? "queued" : "not_sent",
      email_error: null,
    })
    .eq("id", interview.id);
  if (error) return { error: error.message };

  const url = `${serverEnv().appUrl}/i/${token.raw}`;
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/candidates/${candidateId}`);
  revalidatePath(`/jobs/${jobId}/invite`);
  after(() => kickWorker());
  return {
    ok: true as const,
    links: [{ candidateId, name: person.name, email: person.email, url }],
  };
}

export async function retakeFailedAnswers(jobId: string, candidateId: string) {
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("candidates")
    .select("id, name, email")
    .eq("id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (!person) return { error: "Candidate not found" };

  const { data: interview } = await supabase
    .from("interviews")
    .select("id, state")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!interview) return { error: "No interview to retake." };
  if (["submitted", "scoring"].includes(interview.state)) {
    return { error: "Wait until scoring finishes, then send a retake for failed answers." };
  }

  const { data: answers } = await supabase
    .from("interview_answers")
    .select("id, state")
    .eq("interview_id", interview.id);
  const failed = (answers ?? []).filter((a) => a.state === "failed");
  if (!failed.length) {
    return { error: "Nothing failed — scored answers stay locked." };
  }

  const { error: resetError } = await supabase
    .from("interview_answers")
    .update({
      state: "pending",
      attempts: 0,
      last_error: null,
      locked_at: null,
      locked_by: null,
      transcript: null,
      scores: null,
      summary: null,
      communication_notes: null,
    })
    .eq("interview_id", interview.id)
    .eq("state", "failed");
  if (resetError) return { error: resetError.message };

  const token = createInterviewToken();
  const { error } = await supabase
    .from("interviews")
    .update({
      state: "in_progress",
      submitted_at: null,
      completed_at: null,
      overall: null,
      token_hash: token.hash,
      token_prefix: token.prefix,
      pending_email_token: person.email ? token.raw : null,
      email_state: person.email ? "queued" : "not_sent",
      email_error: null,
    })
    .eq("id", interview.id);
  if (error) return { error: error.message };

  const url = `${serverEnv().appUrl}/i/${token.raw}`;
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/candidates/${candidateId}`);
  revalidatePath(`/jobs/${jobId}/invite`);
  after(() => kickWorker());
  return {
    ok: true as const,
    failed: failed.length,
    links: [{ candidateId, name: person.name, email: person.email, url }],
  };
}

export async function retryAnswer(jobId: string, answerId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("interview_answers")
    .update({
      state: "queued",
      attempts: 0,
      last_error: null,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", answerId);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${jobId}`);
  after(() => kickWorker());
  return { ok: true };
}
