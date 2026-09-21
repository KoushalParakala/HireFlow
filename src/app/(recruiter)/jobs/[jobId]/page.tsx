import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PipelineBoard } from "@/components/pipeline-board";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, interview_state")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) notFound();
  const { data: rows } = await supabase
    .from("candidate_pipeline")
    .select(
      "id, name, email, title, company, location, display_stage, match_score, score_state, latest_interview_state, email_state, overall, match_summary",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Pipeline</p>
          <h1 className="display text-5xl">{job.title}</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href={`/jobs/${jobId}/source`} className="rounded-full border border-line px-4 py-2">
            Source
          </Link>
          <Link href={`/jobs/${jobId}/questions`} className="rounded-full border border-line px-4 py-2">
            Interview paper {job.interview_state === "confirmed" ? "✓" : "(draft)"}
          </Link>
          <Link href={`/jobs/${jobId}/invite`} className="rounded-full bg-accent px-4 py-2 text-white">
            Invite
          </Link>
        </div>
      </div>
      <div className="mt-8">
        <PipelineBoard
          jobId={jobId}
          paperConfirmed={job.interview_state === "confirmed"}
          rows={rows ?? []}
        />
      </div>
    </div>
  );
}
