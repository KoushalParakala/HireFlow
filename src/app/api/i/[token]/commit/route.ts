import { MIN_RECORD_BYTES, MIN_RECORD_SECONDS, STORAGE_FILE_LIMIT_BYTES } from "@/lib/constants";
import { resolveInterview } from "@/lib/interview-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const resolved = await resolveInterview(token);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 404 });
  }
  const { interview, answers, admin } = resolved;
  if (["submitted", "scoring", "complete", "failed"].includes(interview.state)) {
    return Response.json({ error: "This interview is closed." }, { status: 409 });
  }
  const body = (await request.json()) as {
    questionId: string;
    path: string;
    mimeType: string;
    bytes: number;
    durationSeconds: number;
  };
  const answer = answers.find((a) => a.question_id === body.questionId);
  if (!answer) return Response.json({ error: "Unknown question." }, { status: 400 });
  if (
    !Number.isFinite(body.bytes) ||
    body.bytes < MIN_RECORD_BYTES ||
    body.bytes > STORAGE_FILE_LIMIT_BYTES ||
    body.durationSeconds < MIN_RECORD_SECONDS
  ) {
    return Response.json(
      {
        error:
          body.bytes > STORAGE_FILE_LIMIT_BYTES
            ? "That take is over the 50 MB upload limit. Keep the answer shorter."
            : `That take was too short (${Math.round(body.durationSeconds)}s). Record at least ${MIN_RECORD_SECONDS} seconds, then use this take.`,
      },
      { status: 400 },
    );
  }
  const { error } = await admin
    .from("interview_answers")
    .update({
      storage_path: body.path,
      mime_type: body.mimeType,
      bytes: body.bytes,
      duration_seconds: body.durationSeconds,
      state: "uploaded",
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", answer.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
