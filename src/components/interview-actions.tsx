"use client";

import { useState, useTransition } from "react";
import { reinviteCandidate, retakeFailedAnswers } from "@/actions/invites";

export function InterviewActions({
  jobId,
  candidateId,
  failedCount,
  interviewState,
}: {
  jobId: string;
  candidateId: string;
  failedCount: number;
  interviewState: string | null;
}) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const submitted = ["submitted", "scoring", "complete", "failed"].includes(
    interviewState ?? "",
  );

  return (
    <div className="text-right">
      <div className="flex flex-wrap justify-end gap-2">
        {failedCount > 0 && (
          <button
            type="button"
            disabled={pending}
            className="rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-60"
            onClick={() =>
              start(async () => {
                const result = await retakeFailedAnswers(jobId, candidateId);
                if ("error" in result && result.error) {
                  setMsg(result.error);
                  setUrl(null);
                  return;
                }
                const link = "links" in result ? result.links?.[0]?.url ?? null : null;
                setUrl(link);
                setMsg(
                  link
                    ? `Retake link for ${result.failed} failed question${result.failed === 1 ? "" : "s"}. Scored answers stay locked.`
                    : "Retake opened.",
                );
              })
            }
          >
            {pending ? "Opening…" : `Retake ${failedCount} failed`}
          </button>
        )}
        <button
          type="button"
          disabled={pending || submitted}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
          onClick={() =>
            start(async () => {
              const result = await reinviteCandidate(jobId, candidateId);
              if ("error" in result && result.error) {
                setMsg(result.error);
                setUrl(null);
                return;
              }
              const link = "links" in result ? result.links?.[0]?.url ?? null : null;
              setUrl(link);
              setMsg(link ? "New link ready. Email will send if Gmail is on." : "Invite created.");
            })
          }
        >
          {pending ? "Creating link…" : "Resend invite"}
        </button>
      </div>
      {msg && <p className="mt-2 max-w-sm text-xs text-muted">{msg}</p>}
      {url && (
        <p className="mt-2 max-w-sm break-all text-xs text-accent">
          {url}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => navigator.clipboard.writeText(url)}
          >
            Copy
          </button>
        </p>
      )}
    </div>
  );
}
