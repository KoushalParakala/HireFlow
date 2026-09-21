"use server";

import { email } from "@/providers/email";
import { getUser } from "@/lib/supabase/server";

export async function sendTestEmail(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  const to = typeof user?.email === "string" ? user.email : null;
  if (!to) return { ok: false, error: "No email on this session." };
  const result = await email().send({
    to,
    subject: "HireFlow test email",
    text: "If you can read this, Gmail SMTP (or the fake provider) is working.",
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
