"use client";

import { useState, useTransition } from "react";
import { rankSelected } from "@/actions/jobs";

export function RankNotes({
  jobId,
  candidateIds,
}: {
  jobId: string;
  candidateIds: string[];
}) {
  const [pending, start] = useTransition();
  const [narrative, setNarrative] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-2xl">AI ranking</h2>
        <button
          type="button"
          disabled={pending || candidateIds.length < 2}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const result = await rankSelected(jobId, candidateIds);
              if ("error" in result && result.error) {
                setError(result.error);
                setNarrative(null);
                return;
              }
              setError(null);
              setNarrative("ok" in result && result.ok ? result.narrative : null);
            })
          }
        >
          {pending ? "Ranking…" : "Rank with AI"}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        Uses stored match + interview averages. Not called until you click.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {narrative && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{narrative}</p>}
    </section>
  );
}
