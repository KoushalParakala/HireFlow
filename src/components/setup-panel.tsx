"use client";

import { useEffect, useState } from "react";

type Status = {
  database: boolean;
  groq: boolean;
  groqError: string | null;
  email: boolean;
  emailConfigured: boolean;
  emailError: string | null;
  storage: boolean;
  queue: { answers: number; invites: number; sources?: number };
  providerMode: string;
  appUrl: string;
  workerArmed: boolean;
  sourcingArmed?: boolean;
  linkedinSourcingArmed?: boolean;
};

export function SetupPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  const rows = status
    ? [
        ["Database", status.database, ""],
        ["Storage bucket", status.storage, ""],
        ["AI (Groq)", status.groq, status.groqError],
        ["Email",
          status.emailConfigured && status.email,
          status.emailConfigured
            ? status.emailError
            : "Copy-link until Gmail is set",
        ],
        [
          "Scoring worker",
          status.workerArmed,
          status.queue.answers
            ? `${status.queue.answers} waiting — open Ops to run now`
            : "Drains on submit and when you open recruiter pages",
        ],
        [
          "GitHub sourcing",
          status.sourcingArmed,
          status.sourcingArmed ? "" : "Set GITHUB_TOKEN to search GitHub",
        ],
        [
          "LinkedIn sourcing (Apify)",
          status.linkedinSourcingArmed,
          status.linkedinSourcingArmed ? "" : "Set APIFY_TOKEN to search LinkedIn",
        ],
      ]
    : [];
  return (
    <aside className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Setup</p>
      <h2 className="display mt-1 text-2xl">Live checks</h2>
      <p className="mt-1 text-sm text-muted">
        Mode: {status?.providerMode ?? "…"}. Queue {status?.queue.answers ?? 0}{" "}
        answers / {status?.queue.invites ?? 0} invites.
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map(([label, ok, err]) => (
          <li key={String(label)} className="flex items-start justify-between gap-4">
            <span>{label}</span>
            <span
              className={
                ok
                  ? "text-ok"
                  : String(err).includes("Copy-link")
                    ? "text-accent-2"
                    : "text-danger"
              }
            >
              {ok ? "Ready" : err || "Not ready"}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
