import { serverEnv } from "@/lib/env";
import { tryAdminClient } from "@/lib/supabase/admin";
import { llm } from "@/providers/llm";
import { email } from "@/providers/email";
import { STORAGE_BUCKET, STORAGE_CAP_BYTES } from "@/lib/constants";

export async function GET() {
  const env = serverEnv();
  const admin = tryAdminClient();
  const groq = await llm().ping();
  const mail = await email().verify();
  let storageBytes = 0;
  let bucket = false;
  let queue = { answers: 0, invites: 0, sources: 0 };
  if (admin) {
    const listed = await admin.storage.from(STORAGE_BUCKET).list();
    bucket = !listed.error;
    const depth = await admin.rpc("queue_depth");
    const row = Array.isArray(depth.data) ? depth.data[0] : depth.data;
    queue = {
      answers: Number(row?.answers ?? 0),
      invites: Number(row?.invites ?? 0),
      sources: Number(row?.sources ?? 0),
    };
  }
  return Response.json({
    database: Boolean(admin),
    groq: groq.ok,
    groqError: groq.ok ? null : groq.error.message,
    email: mail.ok,
    emailConfigured: Boolean(env.gmailUser && env.gmailAppPassword),
    emailError: mail.ok
      ? null
      : env.gmailUser && env.gmailAppPassword
        ? mail.error.message
        : "Copy-link until Gmail is set",
    storage: bucket,
    queue,
    storageCapBytes: STORAGE_CAP_BYTES,
    storageBytes,
    providerMode: env.providerMode,
    appUrl: env.appUrl,
    workerArmed: Boolean(env.workerSecret),
    sourcingArmed: Boolean(env.githubToken),
    linkedinSourcingArmed: Boolean(env.apifyToken),
  });
}
