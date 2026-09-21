import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RankNotes } from "@/components/rank-notes";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { jobId } = await params;
  const { ids } = await searchParams;
  const selected = (ids ?? "").split(",").filter(Boolean).slice(0, 4);
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("title").eq("id", jobId).single();
  const { data: rows } = selected.length
    ? await supabase.from("candidate_pipeline").select("*").in("id", selected)
    : { data: [] };

  const people = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: answers } = row.latest_interview_id
        ? await supabase
            .from("interview_answers")
            .select("idx, state, scores, summary")
            .eq("interview_id", row.latest_interview_id)
            .order("idx")
        : { data: [] };
      return { row, answers: answers ?? [] };
    }),
  );

  return (
    <div>
      <Link href={`/jobs/${jobId}`} className="text-sm text-muted">
        ← Pipeline
      </Link>
      <h1 className="display mt-3 text-5xl">Compare</h1>
      <p className="mt-2 text-muted">
        Stored scores only. Use Rank with AI when you want a Groq narrative.
      </p>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Match</th>
              <th className="p-3">Interview avg</th>
              <th className="p-3">Answered</th>
              <th className="p-3">Stage</th>
            </tr>
          </thead>
          <tbody>
            {people.map(({ row }) => {
              const overall = (row.overall ?? {}) as {
                average?: number;
                answered?: number;
                total?: number;
                failed?: number;
              };
              return (
                <tr key={row.id} className="border-b border-line">
                  <td className="p-3">
                    <Link className="text-accent" href={`/jobs/${jobId}/candidates/${row.id}`}>
                      {row.name}
                    </Link>
                  </td>
                  <td className="p-3">{row.match_score ?? "—"}</td>
                  <td className="p-3">{overall.average ?? "—"}</td>
                  <td className="p-3">
                    {overall.answered != null
                      ? `${overall.answered}/${overall.total ?? "—"}`
                      : "—"}
                    {overall.failed ? ` · ${overall.failed} failed` : ""}
                  </td>
                  <td className="p-3 capitalize">{row.display_stage}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {people.some((p) => p.answers.length) && (
        <section className="mt-8 space-y-4">
          <h2 className="display text-2xl">Per question</h2>
          {people.map(({ row, answers }) => (
            <article key={row.id} className="rounded-2xl border border-line bg-white p-5">
              <h3 className="font-medium">{row.name}</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {answers.map((answer) => {
                  const scores = (answer.scores ?? {}) as Record<string, number>;
                  const avg = ["relevance", "clarity", "specificity", "depth"]
                    .map((k) => Number(scores[k] ?? 0))
                    .reduce((a, b) => a + b, 0);
                  const shown =
                    answer.state === "complete" && Object.keys(scores).length
                      ? (avg / 4).toFixed(1)
                      : answer.state;
                  return (
                    <li key={`${row.id}-${answer.idx}`}>
                      Q{answer.idx + 1}: {shown}
                      {answer.summary ? ` — ${answer.summary}` : ""}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </section>
      )}
      <RankNotes jobId={jobId} candidateIds={selected} />
    </div>
  );
}
