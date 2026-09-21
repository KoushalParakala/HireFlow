"use client";

import { useState } from "react";
import { sendTestEmail } from "@/actions/email";

export function TestEmailButton() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <button
        type="button"
        className="rounded-full border border-line px-4 py-2 text-sm"
        onClick={async () => {
          const result = await sendTestEmail();
          setMsg(result.ok ? "Sent. Check your inbox." : result.error ?? "Could not send");
        }}
      >
        Send me a test email
      </button>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}
