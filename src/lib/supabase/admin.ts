import { createClient } from "@supabase/supabase-js";
import { requireAdminEnv, serverEnv } from "@/lib/env";

export function createAdminClient() {
  const env = requireAdminEnv();
  return createClient(env.supabaseUrl, env.supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function tryAdminClient() {
  const env = serverEnv();
  if (!env.supabaseUrl || !env.supabaseSecret) return null;
  return createClient(env.supabaseUrl, env.supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
