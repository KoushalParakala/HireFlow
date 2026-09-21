"use client";

import { useState, useTransition } from "react";
import { inviteCandidates } from "@/actions/invites";
import { saveEmailTemplate } from "@/actions/jobs";

type Person = {
  id: string;
  name: string | null;
  email: string | null;
};

export function InviteClient({
  jobId,
  people,
  subject,
  body,
  confirmed,
}: {
  jobId: string;
  people: Person[];
  subject: string;
  body: string;
  confirmed: boolean;
}) {
  const [selected, setSelected] = useState(people.map((p) => p.id));
  const [links, setLinks] = useState<Array<{ name: string; email: string | null; url: string }>>(
    [],
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => {
            const result = await saveEmailTemplate(jobId, form);
            setMsg(result.error ?? "Template saved.");
          });
        }}
      >
        <label className="block text-sm">
          Subject
          <input
            name="subject"
            defaultValue={subject}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Body
          <textarea
            name="body"
            defaultValue={body}
            rows={10}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>
        <p className="text-xs text-muted">Placeholders: {"{{name}} {{role}} {{link}}"}</p>
        <button className="rounded-full border border-line px-4 py-2 text-sm">Save template</button>
      </form>
      <div>
        <p className="text-sm text-muted">
          Only shortlisted people with email can be mailed. The link is created either way.
        </p>
        <ul className="mt-4 space-y-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id),
                  )
                }
              />
              <span>
                {p.name} · {p.email ?? "no email"}
              </span>
            </li>
          ))}
          {!people.length && <li className="text-muted">No shortlisted people yet.</li>}
        </ul>
        <button
          type="button"
          disabled={!confirmed || pending || !selected.length}
          className="mt-4 rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const result = await inviteCandidates(jobId, selected);
              if (result.error) setMsg(result.error);
              else {
                setLinks(result.links ?? []);
                setMsg("Invites created. Copy a link if email is still queued or failed.");
              }
            })
          }
        >
          Send invites
        </button>
        {!confirmed && (
          <p className="mt-2 text-sm text-accent-2">Confirm the paper first.</p>
        )}
        {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
        <ul className="mt-4 space-y-3">
          {links.map((link) => (
            <li key={link.url} className="rounded-xl border border-line bg-white p-3 text-sm">
              <p className="font-medium">{link.name}</p>
              <p className="break-all text-accent">{link.url}</p>
              <button
                type="button"
                className="mt-2 text-xs uppercase tracking-wide"
                onClick={() => navigator.clipboard.writeText(link.url)}
              >
                Copy link
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
