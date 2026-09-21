"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addReferral, importCsv, pasteProfile, scoreJobCandidates, setShortlist } from "@/actions/candidates";

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  display_stage: string | null;
  match_score: number | null;
  score_state: string | null;
  latest_interview_state: string | null;
  email_state: string | null;
  match_summary?: string | null;
  overall?: { average?: number; answered?: number; total?: number; failed?: number } | null;
};

export function PipelineBoard({
  jobId,
  paperConfirmed,
  rows,
}: {
  jobId: string;
  paperConfirmed: boolean;
  rows: Row[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const compareHref = useMemo(() => {
    if (selected.length < 2) return null;
    return `/jobs/${jobId}/compare?ids=${selected.slice(0, 4).join(",")}`;
  }, [jobId, selected]);

  return (
    <div className="space-y-8">
      {paperConfirmed && !rows.length && (
        <p className="rounded-2xl border border-accent/30 bg-white p-4 text-sm">
          Paper is confirmed. Add yourself as a referral (name + email), then open{" "}
          <span className="font-medium">Invite shortlist</span>.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <ReferralForm
          pending={pending}
          onSubmit={(data) =>
            start(async () => {
              const result = await addReferral(jobId, data);
              setMsg(result.error ?? "Referral added to shortlist.");
              router.refresh();
            })
          }
        />
        <CsvForm
          pending={pending}
          onSubmit={(csv) =>
            start(async () => {
              const result = await importCsv(jobId, csv);
              setMsg(result.error ?? `Imported ${result.inserted} people.`);
              router.refresh();
            })
          }
        />
        <PasteForm
          pending={pending}
          onSubmit={(text) =>
            start(async () => {
              const result = await pasteProfile(jobId, { text });
              setMsg("error" in result && result.error ? result.error : describePaste(result));
              router.refresh();
            })
          }
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          className="rounded-full border border-line px-4 py-2 text-sm"
          onClick={() =>
            start(async () => {
              const result = await scoreJobCandidates(jobId);
              setMsg(result.error ?? `Scored. Auto-shortlisted ${result.autoShortlisted}.`);
              router.refresh();
            })
          }
        >
          Score added people
        </button>
        <Link href={`/jobs/${jobId}/invite`} className="rounded-full bg-accent px-4 py-2 text-sm text-white">
          Invite shortlist
        </Link>
        {compareHref && (
          <Link href={compareHref} className="rounded-full border border-line px-4 py-2 text-sm">
            Compare {Math.min(selected.length, 4)}
          </Link>
        )}
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="p-3" />
              <th className="p-3">Name</th>
              <th className="p-3">Title</th>
              <th className="p-3">Email</th>
              <th className="p-3">Stage</th>
              <th className="p-3">Interview</th>
              <th className="p-3">Mail</th>
              <th className="p-3">Match</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id),
                      )
                    }
                  />
                </td>
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3 text-muted">
                  {[row.title, row.company].filter(Boolean).join(" · ")}
                </td>
                <td className="p-3">{row.email ?? "—"}</td>
                <td className="p-3 capitalize">{row.display_stage}</td>
                <td className="p-3 capitalize">{interviewCell(row)}</td>
                <td className="p-3 capitalize">{row.email_state ?? "—"}</td>
                <td className="p-3">
                  {row.match_score ?? "—"}
                  {row.score_state === "rules_only" && (
                    <span className="ml-1 text-xs text-accent-2">rules only</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <Link className="text-accent" href={`/jobs/${jobId}/candidates/${row.id}`}>
                    Profile
                  </Link>
                  <button
                    type="button"
                    className="ml-3 text-muted"
                    onClick={() =>
                      start(async () => {
                        await setShortlist(jobId, row.id, row.display_stage !== "shortlisted");
                        router.refresh();
                      })
                    }
                  >
                    {row.display_stage === "shortlisted" ? "Unshortlist" : "Shortlist"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="p-6 text-muted">
                  Add a referral to run the core loop without LinkedIn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!paperConfirmed && (
        <p className="text-sm text-accent-2">Confirm the interview paper before sending invites.</p>
      )}
    </div>
  );
}

function interviewCell(row: Row) {
  if (row.overall?.average != null && row.latest_interview_state === "complete") {
    return `${row.overall.average} / 5`;
  }
  return row.latest_interview_state ?? "—";
}

function ReferralForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (data: { name: string; email: string; title?: string; company?: string }) => void;
}) {
  return (
    <form
      className="rounded-2xl border border-line bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onSubmit({
          name: String(form.get("name")),
          email: String(form.get("email")),
          title: String(form.get("title")),
          company: String(form.get("company")),
        });
        e.currentTarget.reset();
      }}
    >
      <h3 className="font-medium">1. Add referral</h3>
      <p className="mt-1 text-xs text-muted">Use your own name and email for this first pass.</p>
      <input name="name" required placeholder="Name" className="mt-3 w-full rounded border border-line px-2 py-1.5" />
      <input name="email" type="email" required placeholder="Email" className="mt-2 w-full rounded border border-line px-2 py-1.5" />
      <input name="title" placeholder="Title" className="mt-2 w-full rounded border border-line px-2 py-1.5" />
      <input name="company" placeholder="Company" className="mt-2 w-full rounded border border-line px-2 py-1.5" />
      <button disabled={pending} className="mt-3 rounded-full bg-ink px-3 py-1.5 text-xs text-white">
        Add to shortlist
      </button>
    </form>
  );
}

function CsvForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (csv: string) => void;
}) {
  return (
    <form
      className="rounded-2xl border border-line bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(String(new FormData(e.currentTarget).get("csv")));
      }}
    >
      <h3 className="font-medium">Import CSV</h3>
      <p className="mt-1 text-xs text-muted">Header: name,email,title,company,location</p>
      <textarea name="csv" rows={6} className="mt-3 w-full rounded border border-line px-2 py-1.5 font-mono text-xs" />
      <button disabled={pending} className="mt-3 rounded-full border border-line px-3 py-1.5 text-xs">
        Import
      </button>
    </form>
  );
}

/** Show what the extraction actually found, so a bad paste is obvious at once. */
function describePaste(result: {
  parsed?: boolean;
  updated?: boolean;
  name?: string;
  skills?: number;
  linkedinUrl?: string | null;
  note?: string;
}) {
  if (result.note) return result.note;
  const bits = [
    `${result.updated ? "Updated" : "Added"} ${result.name ?? "profile"}`,
    result.skills ? `${result.skills} skills` : "no skills found",
    result.linkedinUrl ? "LinkedIn captured" : "",
  ].filter(Boolean);
  return `${bits.join(" · ")}. Run "Score added people" next.`;
}

function PasteForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (text: string) => void;
}) {
  return (
    <form
      className="rounded-2xl border border-line bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(String(new FormData(e.currentTarget).get("text")));
        e.currentTarget.reset();
      }}
    >
      <h3 className="font-medium">Paste a profile</h3>
      <p className="mt-1 text-xs text-muted">
        Copy a LinkedIn profile or resume from your own browser. Groq pulls out the
        name, role, skills, and contact details.
      </p>
      <textarea name="text" rows={6} className="mt-3 w-full rounded border border-line px-2 py-1.5 text-sm" />
      <button disabled={pending} className="mt-3 rounded-full border border-line px-3 py-1.5 text-xs">
        {pending ? "Reading…" : "Add to pool"}
      </button>
    </form>
  );
}
