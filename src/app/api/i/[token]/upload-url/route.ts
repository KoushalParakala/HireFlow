import { STORAGE_BUCKET } from "@/lib/constants";
import { publicEnv } from "@/lib/env";
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
  const { interview, questions, answers, admin } = resolved;
  if (["submitted", "scoring", "complete", "failed"].includes(interview.state)) {
    return Response.json({ error: "This interview is closed." }, { status: 409 });
  }
  const body = (await request.json()) as { questionId?: string; mimeType?: string };
  const questionId = String(body.questionId ?? "");
  const allowed = questions.some((q) => q.id === questionId);
  if (!allowed) return Response.json({ error: "Unknown question." }, { status: 400 });
  const answer = answers.find((a) => a.question_id === questionId);
  if (!answer) return Response.json({ error: "Answer row missing." }, { status: 400 });
  const mime = (body.mimeType ?? "").toLowerCase();
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const path = `${interview.id}/${answer.id}-${Date.now()}.${ext}`;
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    return Response.json({ error: error?.message ?? "Could not mint upload URL" }, { status: 500 });
  }
  if (interview.state === "pending") {
    await admin
      .from("interviews")
      .update({ state: "in_progress", started_at: new Date().toISOString() })
      .eq("id", interview.id);
  }
  return Response.json({
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    answerId: answer.id,
    supabaseUrl: publicEnv().supabaseUrl,
    apikey: publicEnv().supabasePublishableKey,
  });
}
