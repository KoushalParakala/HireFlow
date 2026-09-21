"use client";

import { useState, useTransition } from "react";
import { runScoringNow } from "@/actions/ops";

export function RunScoringButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-60"
        onClick={() =>
          start(async () => {
            const result = await runScoringNow();
            setMsg(result.error ?? "Worker tick finished.");
          })
        }
      >
        {pending ? "Running…" : "Run scoring now"}
      </button>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}
