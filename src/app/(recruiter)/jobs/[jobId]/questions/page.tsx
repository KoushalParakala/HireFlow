import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QuestionBuilder } from "@/components/question-builder";
import { CriteriaCard } from "@/components/criteria-card";
import { coerceCriteria } from "@/lib/schemas";

export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await createClient();
  const [{ data: job }, { data: questions }, invites] = await Promise.all([
    supabase.from("jobs").select("title, interview_state, criteria").eq("id", jobId).single(),
    supabase.from("job_questions").select("*").eq("job_id", jobId).order("idx"),
    supabase.from("interviews").select("id", { count: "exact", head: true }).eq("job_id", jobId),
  ]);
  if (!job) return <p>Job not found.</p>;
  const criteria = coerceCriteria(job.criteria);
  return (
    <div>
      <Link href={`/jobs/${jobId}`} className="text-sm text-muted">
        ← Pipeline
      </Link>
      <h1 className="display mt-3 text-5xl">Interview paper</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Groq writes this paper from the JD and criteria. Edit anything, then confirm before invites.
      </p>
      <div className="mt-6">
        <CriteriaCard jobId={jobId} criteria={criteria} />
      </div>
      <div className="mt-8">
        <QuestionBuilder
          jobId={jobId}
          confirmed={job.interview_state === "confirmed"}
          locked={Boolean(invites.count)}
          initial={(questions ?? []).map((q) => ({
            id: q.id,
            difficulty: q.difficulty as "easy" | "medium" | "hard",
            text: q.text,
            key_points: Array.isArray(q.key_points) ? (q.key_points as string[]) : [],
          }))}
        />
      </div>
    </div>
  );
}
