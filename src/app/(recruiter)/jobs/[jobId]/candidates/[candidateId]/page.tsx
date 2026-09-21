import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { retryAnswer } from "@/actions/invites";
import { InterviewActions } from "@/components/interview-actions";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ jobId: string; candidateId: string }>;
}) {
  const { jobId, candidateId } = await params;
  const supabase = await createClient();
  const { data: candidate } = await supabase
    .from("candidate_pipeline")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) notFound();
  const { data: interview } = candidate.latest_interview_id
    ? await supabase
        .from("interviews")
        .select("*")
        .eq("id", candidate.latest_interview_id)
        .single()
    : { data: null };
  const { data: answers } = interview
    ? await supabase
        .from("interview_answers")
        .select("*, job_questions(text, difficulty)")
        .eq("interview_id", interview.id)
        .order("idx")
    : { data: [] };

  return (
    <div>
      <Link href={`/jobs/${jobId}`} className="text-sm text-muted">
        ← Pipeline
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl">{candidate.name}</h1>
          <p className="text-muted">
            {[candidate.title, candidate.company, candidate.location].filter(Boolean).join(" · ")}
          </p>
        </div>
        <InterviewActions
          jobId={jobId}
          candidateId={candidateId}
          failedCount={(answers ?? []).filter((a) => a.state === "failed").length}
          interviewState={interview?.state ?? null}
        />
      </div>
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Match"
          value={candidate.match_score ?? "—"}
          note={
            candidate.match_summary
            ?? (candidate.score_state === "rules_only" ? "rules only" : null)
          }
        />
        <Stat label="Stage" value={candidate.display_stage ?? candidate.stage} />
        <Stat
          label="Interview"
          value={interviewScoreLabel(interview)}
          note={interviewScoreNote(interview)}
        />
      </section>
      <section className="mt-10 space-y-6">
        <h2 className="display text-3xl">Scorecard</h2>
        {!answers?.length && <p className="text-muted">No answers yet.</p>}
        {answers?.map((answer) => {
          const q = answer.job_questions as { text?: string; difficulty?: string } | null;
          const scores = (answer.scores ?? {}) as Record<string, number>;
          return (
            <article key={answer.id} className="rounded-2xl border border-line bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-muted">{q?.difficulty}</p>
              <h3 className="mt-1 text-lg">{q?.text}</h3>
              {answer.state === "failed" && (
                <div className="mt-3 rounded-lg bg-paper-2 p-3 text-sm text-danger">
                  Unscored: {answer.last_error}
                  <form
                    action={async () => {
                      "use server";
                      await retryAnswer(jobId, answer.id);
                    }}
                  >
                    <button className="mt-2 text-ink underline">Retry scoring</button>
                  </form>
                </div>
              )}
              {answer.storage_path && (
                <video
                  className="mt-4 w-full rounded-lg bg-ink"
                  controls
                  src={`/api/media/${answer.id}`}
                />
              )}
              {answer.transcript && (
                <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{answer.transcript}</p>
              )}
              {answer.scores && (
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                  {["clarity", "relevance", "specificity", "depth"].map((k) => (
                    <div key={k} className="rounded-lg bg-paper p-2">
                      <dt className="capitalize text-muted">{k}</dt>
                      <dd className="text-xl">{scores[k] ?? "—"}<span className="text-sm text-muted">/5</span></dd>
                    </div>
                  ))}
                </dl>
              )}
              {answer.summary && <p className="mt-3 text-sm">{answer.summary}</p>}
              {answer.communication_notes && (
                <p className="mt-1 text-sm text-muted">{answer.communication_notes}</p>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function interviewScoreLabel(interview: {
  state?: string | null;
  overall?: unknown;
} | null) {
  if (!interview) return "Not invited";
  if (interview.state === "scoring" || interview.state === "submitted") {
    return "Scoring in progress";
  }
  const overall = (interview.overall ?? {}) as { average?: number };
  if (interview.state === "complete" && overall.average != null) {
    return `${overall.average} / 5`;
  }
  return interview.state ?? "Not invited";
}

function interviewScoreNote(interview: { overall?: unknown } | null) {
  const overall = (interview?.overall ?? {}) as {
    answered?: number;
    total?: number;
    failed?: number;
  };
  if (overall.answered == null) return null;
  const bits = [`${overall.answered}/${overall.total ?? overall.answered} answers scored`];
  if (overall.failed) bits.push(`${overall.failed} failed`);
  return bits.join(" · ");
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="display mt-1 text-3xl capitalize">{value}</p>
      {note && <p className="mt-2 line-clamp-3 text-xs text-muted">{note}</p>}
    </div>
  );
}
