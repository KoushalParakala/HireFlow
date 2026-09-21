import { after } from "next/server";
import { resolveInterview } from "@/lib/interview-access";
import { kickWorker } from "@/lib/worker";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const resolved = await resolveInterview(token);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 404 });
  }
  const { interview, answers, admin } = resolved;
  if (["submitted", "scoring", "complete"].includes(interview.state)) {
    return Response.json({ ok: true, already: true });
  }
  const ready = answers.filter((a) =>
    ["uploaded", "queued", "processing", "complete"].includes(a.state),
  );
  if (!ready.length) {
    return Response.json({ error: "Upload at least one answer before submitting." }, { status: 400 });
  }
  await admin
    .from("interview_answers")
    .update({ state: "queued" })
    .eq("interview_id", interview.id)
    .eq("state", "uploaded");
  await admin
    .from("interviews")
    .update({ state: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", interview.id);
  after(() => kickWorker());
  return Response.json({ ok: true });
}
