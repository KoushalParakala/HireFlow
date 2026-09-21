import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallMeta } from "./types";

export async function logProviderCall(
  admin: SupabaseClient | null,
  input: {
    kind: string;
    ok: boolean;
    meta: CallMeta;
    error?: string;
    refType?: string;
    refId?: string;
  },
) {
  if (!admin) return;
  await admin.from("provider_calls").insert({
    kind: input.kind,
    model: input.meta.model ?? null,
    duration_ms: input.meta.durationMs,
    ok: input.ok,
    error: input.error ?? null,
    ref_type: input.refType ?? null,
    ref_id: input.refId ?? null,
  });
}
