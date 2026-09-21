import { STORAGE_BUCKET } from "@/lib/constants";
import { createClient, getUser } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ answerId: string }> },
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { answerId } = await context.params;
  const supabase = await createClient();
  const { data: answer } = await supabase
    .from("interview_answers")
    .select("id, storage_path, mime_type")
    .eq("id", answerId)
    .maybeSingle();
  if (!answer?.storage_path) return new Response("Not found", { status: 404 });
  const admin = tryAdminClient();
  if (!admin) return new Response("Missing secret key", { status: 503 });
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(answer.storage_path, 120);
  if (error || !data?.signedUrl) return new Response("Not found", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
