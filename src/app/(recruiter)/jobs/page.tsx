import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SetupPanel } from "@/components/setup-panel";
import { TestEmailButton } from "@/components/test-email-button";

export default async function JobsPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, interview_state, created_at")
    .order("created_at", { ascending: false });

  const withCounts = await Promise.all(
    (jobs ?? []).map(async (job) => {
      const { count } = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("job_id", job.id);
      return { ...job, people: count ?? 0 };
    }),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Roles</p>
            <h1 className="display text-5xl">Open jobs</h1>
          </div>
          <Link
            href="/jobs/new"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            New job
          </Link>
        </div>
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {withCounts.length === 0 && (
            <li className="p-6">
              <p className="font-medium">Start with one role</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Create a job from a description</li>
                <li>Generate and confirm the interview paper</li>
                <li>Add a referral (name + email)</li>
                <li>Invite and copy the link</li>
                <li>Candidate records in the browser</li>
                <li>Read the scorecard on their profile</li>
              </ol>
              <Link
                href="/jobs/new"
                className="mt-5 inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
              >
                Create the first job
              </Link>
            </li>
          )}
          {withCounts.map((job) => (
            <li key={job.id}>
              <Link href={`/jobs/${job.id}`} className="flex items-center justify-between p-5 hover:bg-paper">
                <div>
                  <p className="text-lg font-medium">{job.title}</p>
                  <p className="text-sm text-muted">
                    {job.people} people · paper {job.interview_state}
                  </p>
                </div>
                <span className="text-sm text-accent">Open pipeline →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div>
        <SetupPanel />
        <TestEmailButton />
      </div>
    </div>
  );
}
