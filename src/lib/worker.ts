import { STORAGE_BUCKET, MIN_RECORD_BYTES, MIN_RECORD_SECONDS } from "@/lib/constants";
import { createAdminClient, tryAdminClient } from "@/lib/supabase/admin";
import { scorecardSchema, type AnswerScores } from "@/lib/schemas";
import { interviewFit } from "@/lib/scoring";
import { hasUsableSpeech } from "@/lib/transcript";
import { email } from "@/providers/email";
import { llm } from "@/providers/llm";
import { stt } from "@/providers/stt";
import { logProviderCall } from "@/providers/log";
import { applyTemplate } from "@/lib/template";
import { serverEnv } from "@/lib/env";
import { processSourceRun } from "@/lib/sourcing";

type QueueRow = {
  answers: number;
  invites: number;
  sources: number;
};

export async function runWorkerTick(workerId = "tick") {
  const started = Date.now();
  const deadline = started + 280_000;
  const admin = tryAdminClient();
  if (!admin) {
    return { ok: false as const, error: "Missing service role key" };
  }

  const depth = await admin.rpc("queue_depth");
  const row = Array.isArray(depth.data)
    ? (depth.data[0] as QueueRow | undefined)
    : ((depth.data as QueueRow | null) ?? undefined);
  const answersWaiting = Number(row?.answers ?? 0);
  const invitesWaiting = Number(row?.invites ?? 0);
  const sourcesWaiting = Number(row?.sources ?? 0);
  if (!answersWaiting && !invitesWaiting && !sourcesWaiting) {
    await finalizeInterviews(admin);
    return { ok: true as const, claimed: 0, completed: 0, failed: 0, emails: 0, ms: Date.now() - started };
  }

  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let emailsSent = 0;

  if (answersWaiting) {
    while (Date.now() < deadline) {
      const { data: jobs, error } = await admin.rpc("claim_answer_jobs", {
        p_limit: 5,
        p_worker: workerId,
      });
      if (error) {
        await admin.from("worker_runs").insert({
          worker_id: workerId,
          claimed,
          failed: failed + 1,
          notes: error.message,
          duration_ms: Date.now() - started,
        });
        return { ok: false as const, error: error.message };
      }
      const batch = jobs ?? [];
      if (!batch.length) break;
      claimed += batch.length;
      for (const answer of batch) {
        if (Date.now() > deadline) break;
        const result = await processAnswer(admin, answer);
        if (result === "complete") completed += 1;
        else failed += 1;
      }
    }
    await finalizeInterviews(admin);
  }

  if (invitesWaiting && Date.now() < deadline) {
    const { data: invites } = await admin.rpc("claim_invite_jobs", { p_limit: 5 });
    for (const interview of invites ?? []) {
      const sent = await sendQueuedInvite(admin, interview);
      if (sent) emailsSent += 1;
    }
  }

  // Sourcing runs last and only with real time left: GitHub paces against
  // rate limits, LinkedIn waits on Apify, and candidate answers come first.
  let notes: string | null = null;
  if (sourcesWaiting && deadline - Date.now() > 45_000) {
    const { data: runs, error } = await admin.rpc("claim_source_runs", {
      p_limit: 1,
      p_worker: workerId,
    });
    if (error) {
      failed += 1;
      notes = `claim_source_runs: ${error.message}`;
    }
    for (const run of runs ?? []) {
      claimed += 1;
      try {
        const outcome = await processSourceRun(admin, run, deadline - 5_000);
        if (outcome === "complete") completed += 1;
        else failed += 1;
      } catch (sourceError) {
        failed += 1;
        await admin
          .from("source_runs")
          .update({
            state: "failed",
            last_error:
              sourceError instanceof Error ? sourceError.message : "Sourcing crashed",
            locked_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      }
    }
  }

  await admin.from("worker_runs").insert({
    worker_id: workerId,
    claimed,
    completed,
    failed,
    emails_sent: emailsSent,
    notes,
    duration_ms: Date.now() - started,
  });

  return {
    ok: true as const,
    claimed,
    completed,
    failed,
    emails: emailsSent,
    ms: Date.now() - started,
  };
}

async function processAnswer(
  admin: ReturnType<typeof createAdminClient>,
  answer: {
    id: string;
    interview_id: string;
    question_id: string;
    storage_path: string | null;
    duration_seconds?: number | string | null;
    bytes?: number | string | null;
  },
) {
  const markFail = async (message: string, terminal = false) => {
    await admin
      .from("interview_answers")
      .update({
        state: "failed",
        last_error: message,
        locked_at: new Date().toISOString(),
        ...(terminal ? { attempts: 4 } : {}),
      })
      .eq("id", answer.id);
    return "failed" as const;
  };

  const duration = asNumber(answer.duration_seconds);
  const listedBytes = asNumber(answer.bytes);
  if (
    (duration != null && duration < MIN_RECORD_SECONDS) ||
    (listedBytes != null && listedBytes < MIN_RECORD_BYTES)
  ) {
    return markFail(
      `Recording too short to transcribe (${duration ?? 0}s, ${listedBytes ?? 0} bytes). Retake for at least ${MIN_RECORD_SECONDS}s.`,
      true,
    );
  }

  const { data: question } = await admin
    .from("job_questions")
    .select("text, key_points")
    .eq("id", answer.question_id)
    .single();
  if (!question) return markFail("Question missing", true);

  let media: Blob | undefined;
  if (answer.storage_path) {
    const downloaded = await admin.storage
      .from(STORAGE_BUCKET)
      .download(answer.storage_path);
    if (downloaded.error || !downloaded.data) {
      return markFail(downloaded.error?.message ?? "Could not download interview video");
    }
    media = downloaded.data;
  }

  if (!media || media.size < MIN_RECORD_BYTES) {
    return markFail(
      `Recording too short to transcribe (${media?.size ?? 0} bytes). Retake for at least ${MIN_RECORD_SECONDS}s.`,
      true,
    );
  }

  const transcriptResult = await stt().transcribe({
    file: media,
    mimeType: media.type || "video/webm",
  });
  await logProviderCall(admin, {
    kind: "stt",
    ok: transcriptResult.ok,
    meta: transcriptResult.meta,
    error: transcriptResult.ok ? undefined : transcriptResult.error.message,
    refType: "interview_answer",
    refId: answer.id,
  });
  if (!transcriptResult.ok) {
    return markFail(transcriptResult.error.message, !transcriptResult.error.retryable);
  }
  if (!hasUsableSpeech(transcriptResult.data.text)) {
    return markFail("Empty transcript — the clip may have no usable audio", true);
  }

  const scoreResult = await llm().scoreAnswer({
    question: question.text,
    keyPoints: Array.isArray(question.key_points)
      ? (question.key_points as string[])
      : [],
    transcript: transcriptResult.data.text,
  });
  await logProviderCall(admin, {
    kind: "score_answer",
    ok: scoreResult.ok,
    meta: scoreResult.meta,
    error: scoreResult.ok ? undefined : scoreResult.error.message,
    refType: "interview_answer",
    refId: answer.id,
  });
  if (!scoreResult.ok) return markFail(scoreResult.error.message, !scoreResult.error.retryable);

  let scores: AnswerScores;
  try {
    scores = scorecardSchema.parse(scoreResult.data);
  } catch {
    return markFail("Scorecard failed validation");
  }

  const { error } = await admin
    .from("interview_answers")
    .update({
      transcript: transcriptResult.data.text,
      scores,
      summary: scores.summary,
      communication_notes: scores.communication_notes,
      state: "complete",
      last_error: null,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", answer.id);
  if (error) return markFail(error.message);
  return "complete" as const;
}

async function finalizeInterviews(admin: ReturnType<typeof createAdminClient>) {
  const { data: scoring } = await admin
    .from("interviews")
    .select("id, candidate_id")
    .in("state", ["submitted", "scoring"]);
  for (const interview of scoring ?? []) {
    const { data: answers } = await admin
      .from("interview_answers")
      .select("id, state, scores, transcript, duration_seconds, bytes")
      .eq("interview_id", interview.id);
    if (!answers?.length) continue;

    for (const row of answers) {
      if (row.state !== "complete" || !isUnusableComplete(row)) continue;
      await admin
        .from("interview_answers")
        .update({
          state: "failed",
          last_error: `Recording too short or no usable audio (${asNumber(row.duration_seconds) ?? 0}s).`,
          attempts: 4,
          locked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      row.state = "failed";
    }

    const pending = answers.some((a) =>
      ["pending", "uploaded", "queued", "processing"].includes(a.state),
    );
    if (pending) {
      await admin.from("interviews").update({ state: "scoring" }).eq("id", interview.id);
      continue;
    }
    const failed = answers.filter((a) => a.state === "failed");
    const complete = answers.filter((a) => a.state === "complete");
    if (!complete.length) {
      await admin
        .from("interviews")
        .update({ state: "failed", completed_at: new Date().toISOString() })
        .eq("id", interview.id);
      await admin
        .from("candidates")
        .update({ stage: "invited" })
        .eq("id", interview.candidate_id);
      continue;
    }
    const avgs = averageScores(complete.map((a) => a.scores));
    const fit = interviewFit(avgs.average);
    await admin
      .from("interviews")
      .update({
        state: "complete",
        overall: {
          ...avgs,
          answered: complete.length,
          total: answers.length,
          failed: failed.length,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", interview.id);
    await admin
      .from("candidates")
      .update({
        fit_score: fit,
        score_state: "complete",
        match_summary: `Interview ${avgs.average}/5 across ${complete.length} scored answers.`,
      })
      .eq("id", interview.candidate_id);
  }
}

function asNumber(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUnusableComplete(row: {
  transcript?: string | null;
  duration_seconds?: number | string | null;
  bytes?: number | string | null;
}) {
  const duration = asNumber(row.duration_seconds);
  const bytes = asNumber(row.bytes);
  if (duration != null && duration < MIN_RECORD_SECONDS) return true;
  if (bytes != null && bytes < MIN_RECORD_BYTES) return true;
  return !hasUsableSpeech(row.transcript ?? "");
}

function averageScores(list: unknown[]) {
  const keys = ["relevance", "clarity", "specificity", "depth"] as const;
  const acc = { relevance: 0, clarity: 0, specificity: 0, depth: 0 };
  let n = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, number>;
    n += 1;
    for (const key of keys) acc[key] += Number(row[key] ?? 0);
  }
  if (!n) return { ...acc, average: 0 };
  const out = {
    relevance: round(acc.relevance / n),
    clarity: round(acc.clarity / n),
    specificity: round(acc.specificity / n),
    depth: round(acc.depth / n),
  };
  return {
    ...out,
    average: round((out.relevance + out.clarity + out.specificity + out.depth) / 4),
  };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

async function sendQueuedInvite(
  admin: ReturnType<typeof createAdminClient>,
  interview: {
    id: string;
    candidate_id: string;
    job_id: string;
    pending_email_token?: string | null;
  },
) {
  const { data: full } = await admin
    .from("interviews")
    .select("pending_email_token")
    .eq("id", interview.id)
    .single();
  const rawToken = full?.pending_email_token as string | null;
  const [{ data: candidate }, { data: job }] = await Promise.all([
    admin.from("candidates").select("name, email").eq("id", interview.candidate_id).single(),
    admin.from("jobs").select("title, email_template").eq("id", interview.job_id).single(),
  ]);
  if (!candidate?.email || !job) {
    await admin
      .from("interviews")
      .update({ email_state: "failed", email_error: "Missing email or job" })
      .eq("id", interview.id);
    return false;
  }
  const template = (job.email_template ?? {}) as { subject?: string; body?: string };
  if (!rawToken) {
    await admin
      .from("interviews")
      .update({
        email_state: "failed",
        email_error: "Copy the interview link from the pipeline; this row has no token to email.",
      })
      .eq("id", interview.id);
    return false;
  }
  const link = `${serverEnv().appUrl}/i/`;
  const vars = {
    name: candidate.name,
    role: job.title,
    link: `${link}${rawToken}`,
  };
  const result = await email().send({
    to: candidate.email,
    subject: applyTemplate(template.subject ?? "Interview", vars),
    text: applyTemplate(template.body ?? "{{link}}", vars),
  });
  await logProviderCall(admin, {
    kind: "email",
    ok: result.ok,
    meta: result.meta,
    error: result.ok ? undefined : result.error.message,
    refType: "interview",
    refId: interview.id,
  });
  if (!result.ok) {
    await admin
      .from("interviews")
      .update({ email_state: "failed", email_error: result.error.message })
      .eq("id", interview.id);
    return false;
  }
  await admin
    .from("interviews")
    .update({ email_state: "sent", email_error: null, pending_email_token: null })
    .eq("id", interview.id);
  return true;
}

export async function kickWorker(workerId = "submit") {
  if (!tryAdminClient()) return;
  await runWorkerTick(workerId);
}

export async function kickWorkerIfQueued() {
  const admin = tryAdminClient();
  if (!admin) return;
  const depth = await admin.rpc("queue_depth");
  const row = Array.isArray(depth.data)
    ? (depth.data[0] as Partial<QueueRow> | undefined)
    : ((depth.data as Partial<QueueRow> | null) ?? undefined);
  if (
    !Number(row?.answers ?? 0) &&
    !Number(row?.invites ?? 0) &&
    !Number(row?.sources ?? 0)
  ) {
    return;
  }
  await runWorkerTick("layout");
}
