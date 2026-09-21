import { hashToken } from "@/lib/tokens";
import { tryAdminClient } from "@/lib/supabase/admin";

export type PublicQuestion = {
  id: string;
  idx: number | null;
  difficulty: string | null;
  text: string | null;
};

export async function resolveInterview(token: string) {
  const admin = tryAdminClient();
  if (!admin) return { error: "Server is missing the Supabase secret key." as const };
  const { data: interview } = await admin
    .from("interviews")
    .select("*, candidates(name, email), jobs(title, interview_state)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!interview) return { error: "This link is invalid." as const };
  const ids = interview.question_order as string[];
  const { data: questions } = await admin
    .from("candidate_questions")
    .select("id, idx, difficulty, text")
    .in("id", ids);
  const ordered = ids
    .map((id) => (questions ?? []).find((q) => q.id === id))
    .filter((q): q is PublicQuestion => Boolean(q));
  const { data: answers } = await admin
    .from("interview_answers")
    .select("id, question_id, state, storage_path")
    .eq("interview_id", interview.id);
  return { interview, questions: ordered, answers: answers ?? [], admin };
}
