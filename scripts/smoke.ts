import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runWorkerTick } from "../src/lib/worker";
import { createInterviewToken } from "../src/lib/tokens";
import { DEFAULT_EMAIL } from "../src/lib/constants";

function loadEnvLocal() {
  const file = resolve(process.cwd(), ".env.local");
  const text = readFileSync(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    console.error(
      "Smoke needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }
  process.env.PROVIDER_MODE = "fake";
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .limit(1)
    .single();
  if (profileError || !profile) {
    const key = secret;
    const looksLegacyJwt = key.startsWith("eyJ");
    const looksSecret = key.startsWith("sb_secret_");
    const hint = looksLegacyJwt
      ? "SUPABASE_SERVICE_ROLE_KEY is a legacy JWT and this project rejected it (rotated or disabled). In the dashboard open Settings → API Keys → “Publishable and secret API keys”, copy the Secret key that starts with sb_secret_, paste it over that line, save the file, then run pnpm smoke again."
      : looksSecret
        ? "The sb_secret_ key was rejected. Copy it again from Settings → API Keys (reveal, no spaces)."
        : "Use the Secret key that starts with sb_secret_, not the anon/publishable key.";
    throw new Error(`${profileError?.message ?? "No profile"}. ${hint}`);
  }

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .insert({
      owner_id: profile.id,
      title: "Smoke Backend Engineer",
      description: "Build queues, TypeScript, Postgres. Senior.",
      criteria: {
        must_have: ["TypeScript", "Postgres"],
        nice_to_have: ["Next.js"],
        seniority: "senior",
        summary: "Smoke job",
      },
      interview_state: "confirmed",
      email_template: DEFAULT_EMAIL,
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "job");

  const questions = [
    {
      job_id: job.id,
      idx: 0,
      difficulty: "easy",
      text: "Tell us about a queue you built.",
      key_points: ["durability"],
    },
    {
      job_id: job.id,
      idx: 1,
      difficulty: "medium",
      text: "How do you handle retries?",
      key_points: ["backoff"],
    },
  ];
  const { data: qs, error: qError } = await admin
    .from("job_questions")
    .insert(questions)
    .select("id");
  if (qError || !qs) throw new Error(qError?.message ?? "questions");

  const { data: candidate, error: cError } = await admin
    .from("candidates")
    .insert({
      job_id: job.id,
      name: "Smoke Candidate",
      email: "smoke@example.com",
      source: "referral",
      stage: "shortlisted",
    })
    .select("id")
    .single();
  if (cError || !candidate) throw new Error(cError?.message ?? "candidate");

  const token = createInterviewToken();
  const order = qs.map((q) => q.id);
  const { data: interview, error: iError } = await admin
    .from("interviews")
    .insert({
      candidate_id: candidate.id,
      job_id: job.id,
      token_hash: token.hash,
      token_prefix: token.prefix,
      question_order: order,
      state: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (iError || !interview) throw new Error(iError?.message ?? "interview");

  const { error: aError } = await admin.from("interview_answers").insert(
    order.map((question_id, idx) => ({
      interview_id: interview.id,
      question_id,
      idx,
      state: "queued",
      uploaded_at: new Date().toISOString(),
    })),
  );
  if (aError) throw new Error(aError.message);

  const tick = await runWorkerTick("smoke");
  if (!tick.ok) throw new Error(tick.error);

  const { data: scored } = await admin
    .from("interviews")
    .select("state, overall")
    .eq("id", interview.id)
    .single();
  const { data: answers } = await admin
    .from("interview_answers")
    .select("state, scores, last_error")
    .eq("interview_id", interview.id);

  const failed = answers?.filter((a) => a.state === "failed") ?? [];
  if (failed.length) {
    throw new Error(`Answers failed: ${failed.map((f) => f.last_error).join("; ")}`);
  }
  if (scored?.state !== "complete") {
    throw new Error(`Interview state ${scored?.state}, expected complete`);
  }
  if (!scored.overall) throw new Error("Missing overall scorecard");

  await admin.from("jobs").delete().eq("id", job.id);
  console.log("smoke ok", {
    tick,
    overall: scored.overall,
    answers: answers?.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
