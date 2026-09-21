"use client";

import { useFormStatus } from "react-dom";
import { createJob } from "@/actions/jobs";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create and extract criteria"}
    </button>
  );
}

export function NewJobForm({ error }: { error?: string }) {
  return (
    <>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <form action={createJob} className="mt-8 space-y-5">
        <Field name="title" label="Title" required />
        <label className="block text-sm">
          Job description
          <textarea
            name="description"
            required
            minLength={80}
            rows={12}
            placeholder="Paste the full JD: stack, responsibilities, seniority, and what success looks like. Groq extracts criteria and writes the interview from this text."
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="skills" label="Skills (comma separated)" />
          <Field name="seniority" label="Seniority" />
          <Field name="location" label="Location" />
          <label className="block text-sm">
            Work mode
            <select name="work_mode" className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2">
              <option value="">Any</option>
              <option>remote</option>
              <option>hybrid</option>
              <option>onsite</option>
            </select>
          </label>
        </div>
        <Submit />
      </form>
    </>
  );
}

function Field({
  name,
  label,
  required,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        name={name}
        required={required}
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
      />
    </label>
  );
}
