import { NewJobForm } from "@/components/new-job-form";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="max-w-2xl">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Create</p>
      <h1 className="display text-5xl">Define the role</h1>
      <p className="mt-3 text-muted">
        Groq reads the JD, extracts must-haves, and the interview paper is generated from that — not a generic question bank.
      </p>
      <NewJobForm error={error} />
    </div>
  );
}
