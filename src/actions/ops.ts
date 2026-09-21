"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";
import { kickWorker } from "@/lib/worker";

export async function runScoringNow() {
  const user = await getUser();
  if (!user) return { error: "Not signed in" };
  await kickWorker("ops");
  revalidatePath("/ops");
  return { ok: true as const };
}
