import { InterviewSession } from "@/components/interview-session";
import { resolveInterview } from "@/lib/interview-access";

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveInterview(token);
  if ("error" in resolved) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <h1 className="display text-4xl">This link doesn&apos;t work</h1>
        <p className="mt-3 text-muted">{resolved.error}</p>
      </main>
    );
  }
  const { interview, questions, answers } = resolved;
  const readonly = ["submitted", "scoring", "complete", "failed"].includes(
    interview.state,
  );
  return (
    <InterviewSession
      token={token}
      jobTitle={interview.jobs?.title ?? "Interview"}
      candidateName={interview.candidates?.name ?? "there"}
      readonly={readonly}
      questions={questions.map((q) => ({
        id: q.id,
        text: q.text ?? "",
        uploaded: answers.some(
          (a) =>
            a.question_id === q.id &&
            ["uploaded", "queued", "processing", "complete"].includes(a.state),
        ),
      }))}
    />
  );
}
