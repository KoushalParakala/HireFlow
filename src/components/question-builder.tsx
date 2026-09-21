"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { generateQuestions, saveQuestions, confirmQuestions } from "@/actions/questions";

type Question = {
  id?: string;
  difficulty: "easy" | "medium" | "hard";
  text: string;
  key_points: string[];
};

export function QuestionBuilder({
  jobId,
  confirmed,
  locked,
  initial,
}: {
  jobId: string;
  confirmed: boolean;
  locked: boolean;
  initial: Question[];
}) {
  const [easy, setEasy] = useState(2);
  const [medium, setMedium] = useState(2);
  const [hard, setHard] = useState(1);
  const [questions, setQuestions] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setQuestions(initial);
  }, [initial]);

  const update = (idx: number, patch: Partial<Question>) => {
    setQuestions((q) => q.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-6">
      {locked && (
        <p className="rounded-2xl border border-line bg-white p-4 text-sm">
          This paper is locked because someone already has an interview link. Generating again
          would break those invites.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        {(["easy", "medium", "hard"] as const).map((d) => (
          <label key={d} className="text-sm capitalize">
            {d}
            <input
              type="number"
              min={0}
              max={6}
              className="ml-2 w-16 rounded border border-line bg-white px-2 py-1"
              value={d === "easy" ? easy : d === "medium" ? medium : hard}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (d === "easy") setEasy(n);
                if (d === "medium") setMedium(n);
                if (d === "hard") setHard(n);
              }}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={pending || locked}
          className="rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const result = await generateQuestions(jobId, { easy, medium, hard });
              setMessage(result.error ?? "Draft generated. Edit, then save and confirm.");
              router.refresh();
            })
          }
        >
          {pending ? "Generating from JD…" : "Generate from JD"}
        </button>
      </div>
      {questions.map((q, idx) => (
        <article key={idx} className="rounded-2xl border border-line bg-white p-4">
          <div className="flex gap-3">
            <select
              value={q.difficulty}
              onChange={(e) =>
                update(idx, { difficulty: e.target.value as Question["difficulty"] })
              }
              className="rounded border border-line px-2 py-1 text-sm"
            >
              <option>easy</option>
              <option>medium</option>
              <option>hard</option>
            </select>
            <button
              type="button"
              className="ml-auto text-sm text-danger"
              onClick={() => setQuestions((list) => list.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          </div>
          <textarea
            value={q.text}
            onChange={(e) => update(idx, { text: e.target.value })}
            rows={3}
            className="mt-3 w-full rounded-lg border border-line px-3 py-2"
          />
          <input
            value={q.key_points.join(" · ")}
            onChange={(e) =>
              update(idx, {
                key_points: e.target.value.split("·").map((s) => s.trim()).filter(Boolean),
              })
            }
            className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm"
            placeholder="Key points (interviewer only, separated by ·)"
          />
        </article>
      ))}
      <button
        type="button"
        className="text-sm text-accent disabled:opacity-50"
        disabled={locked}
        onClick={() =>
          setQuestions((q) => [
            ...q,
            { difficulty: "medium", text: "", key_points: [] },
          ])
        }
      >
        + Add your own
      </button>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending || locked}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const result = await saveQuestions(jobId, questions);
              setMessage(result.error ?? "Draft saved. Confirm to allow invites.");
            })
          }
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={pending || confirmed}
          className="rounded-full bg-ink px-4 py-2 text-sm text-white"
          onClick={() =>
            start(async () => {
              await saveQuestions(jobId, questions);
              const result = await confirmQuestions(jobId);
              setMessage(result.error ?? "Paper confirmed. You can invite now.");
            })
          }
        >
          {confirmed ? "Confirmed" : "Confirm paper"}
        </button>
      </div>
      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  );
}
