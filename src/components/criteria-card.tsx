"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reanalyzeJob } from "@/actions/jobs";
import type { JobCriteria } from "@/lib/schemas";

export function CriteriaCard({
  jobId,
  criteria,
}: {
  jobId: string;
  criteria: JobCriteria;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <aside className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">From the JD</p>
          <h2 className="mt-1 text-lg font-medium">Hiring criteria</h2>
        </div>
        <button
          type="button"
          disabled={pending}
          className="rounded-full border border-line px-3 py-1.5 text-xs disabled:opacity-60"
          onClick={() =>
            start(async () => {
              const result = await reanalyzeJob(jobId);
              setMsg(result.error ?? "Re-analyzed from the current JD.");
              router.refresh();
            })
          }
        >
          {pending ? "Analyzing…" : "Re-analyze JD"}
        </button>
      </div>
      <p className="mt-3 text-sm text-muted">{criteria.summary || "No summary yet."}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Must-have</dt>
          <dd>{criteria.must_have.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Nice-to-have</dt>
          <dd>{criteria.nice_to_have.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Seniority</dt>
          <dd>
            {[criteria.seniority, criteria.experience_years].filter(Boolean).join(" · ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Location</dt>
          <dd>{criteria.location || "—"}</dd>
        </div>
      </dl>
      {criteria.implicit?.length ? (
        <p className="mt-3 text-sm text-muted">Implicit: {criteria.implicit.join(" · ")}</p>
      ) : null}
      {msg && <p className="mt-3 text-xs text-muted">{msg}</p>}
    </aside>
  );
}
