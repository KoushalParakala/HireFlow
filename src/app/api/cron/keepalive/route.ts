import { tryAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const admin = tryAdminClient();
  if (!admin) return Response.json({ ok: false, reason: "no-admin" }, { status: 503 });
  await admin.from("profiles").select("id").limit(1);
  return Response.json({ ok: true, at: new Date().toISOString() });
}
