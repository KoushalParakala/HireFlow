import { resolveInterview } from "@/lib/interview-access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const resolved = await resolveInterview(token);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 404 });
  }
  const { interview, questions, answers } = resolved;
  const readonly = ["submitted", "scoring", "complete", "failed"].includes(
    interview.state,
  );
  return Response.json({
    jobTitle: interview.jobs?.title,
    candidateName: interview.candidates?.name,
    state: interview.state,
    readonly,
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      difficulty: q.difficulty,
      uploaded: answers.some(
        (a) =>
          a.question_id === q.id &&
          ["uploaded", "queued", "processing", "complete"].includes(a.state),
      ),
    })),
  });
}
