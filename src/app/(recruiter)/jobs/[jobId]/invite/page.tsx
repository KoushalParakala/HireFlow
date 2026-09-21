import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteClient } from "@/components/invite-client";
import { DEFAULT_EMAIL } from "@/lib/constants";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title, interview_state, email_template")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) notFound();
  const { data: people } = await supabase
    .from("candidates")
    .select("id, name, email")
    .eq("job_id", jobId)
    .eq("stage", "shortlisted");
  const template = (job.email_template ?? DEFAULT_EMAIL) as {
    subject?: string;
    body?: string;
  };
  return (
    <div>
      <Link href={`/jobs/${jobId}`} className="text-sm text-muted">
        ← Pipeline
      </Link>
      <h1 className="display mt-3 text-5xl">Invite</h1>
      <p className="mt-2 text-muted">{job.title}</p>
      <div className="mt-8">
        <InviteClient
          jobId={jobId}
          people={people ?? []}
          subject={template.subject ?? DEFAULT_EMAIL.subject}
          body={template.body ?? DEFAULT_EMAIL.body}
          confirmed={job.interview_state === "confirmed"}
        />
      </div>
    </div>
  );
}
