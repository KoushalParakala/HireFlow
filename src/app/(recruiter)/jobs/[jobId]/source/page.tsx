import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SourcePanel } from "@/components/source-panel";
import { criteriaSchema } from "@/lib/schemas";

export default async function SourcePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, criteria")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) notFound();

  const criteria = criteriaSchema.parse(job.criteria ?? {});
  const [{ data: runs }, { data: people }] = await Promise.all([
    supabase
      .from("source_runs")
      .select("id, state, source, query, stats, found, kept, last_error, created_at, finished_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("sourced_people")
      .select(
        "id, handle, name, profile_url, linkedin_url, location, email, bio, company, followers, public_repos, hireable, skills, evidence, matched, missing, evidence_score, summary, state, candidate_id, source",
      )
      .eq("job_id", jobId)
      .order("evidence_score", { ascending: false, nullsFirst: false })
      .limit(120),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Source</p>
          <h1 className="display text-5xl">{job.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Choose LinkedIn or GitHub, then run a search. Nothing reaches the
            pipeline until you promote it.
          </p>
        </div>
        <Link
          href={`/jobs/${jobId}`}
          className="rounded-full border border-line px-4 py-2 text-sm"
        >
          Back to pipeline
        </Link>
      </div>
      <div className="mt-8">
        <SourcePanel
          jobId={jobId}
          jobTitle={job.title}
          mustHave={criteria.must_have}
          jobLocation={criteria.location}
          runs={runs ?? []}
          people={people ?? []}
        />
      </div>
    </div>
  );
}
