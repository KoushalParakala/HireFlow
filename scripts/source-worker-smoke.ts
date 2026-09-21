import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runWorkerTick } from "../src/lib/worker";

function loadEnvLocal() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
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
  const jobId = process.argv[2];
  if (!jobId) {
    console.error(
      "usage: pnpm tsx scripts/source-worker-smoke.ts <jobId> [limit] [skills,comma,separated]",
    );
    process.exit(1);
  }
  const limit = Number(process.argv[3] ?? 10);
  const skillsArg = process.argv[4] ?? "";

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("title, criteria")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "Job not found");

  const criteria = (job.criteria ?? {}) as { must_have?: unknown; location?: unknown };
  const fromJd = Array.isArray(criteria.must_have)
    ? criteria.must_have.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const skills = (skillsArg || fromJd.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const location = String(criteria.location ?? "").trim();
  const query = {
    skills,
    titles: job.title ? [job.title] : [],
    location,
    limit,
    minEvidence: 30,
  };
  console.log("job:", job.title);
  console.log("filters:", JSON.stringify(query));

  const { data: run, error } = await admin
    .from("source_runs")
    .insert({
      job_id: jobId,
      source: "linkedin",
      query,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  console.log("queued run", run.id);

  const depth = await admin.rpc("queue_depth");
  console.log("queue depth:", JSON.stringify(depth.data));

  const tick = await runWorkerTick("source-smoke");
  console.log("tick:", JSON.stringify(tick));

  const { data: after } = await admin
    .from("source_runs")
    .select("state, found, kept, last_error, stats")
    .eq("id", run.id)
    .single();
  console.log("\nrun state:", after?.state, "found:", after?.found, "kept:", after?.kept);
  if (after?.last_error) console.log("last_error:", after.last_error);
  console.log("stats:", JSON.stringify(after?.stats));

  const { data: people } = await admin
    .from("sourced_people")
    .select("handle, name, location, company, linkedin_url, evidence_score, matched, missing, state, source")
    .eq("job_id", jobId)
    .order("evidence_score", { ascending: false });
  console.log(`\n${people?.length ?? 0} sourced people stored:`);
  for (const person of people ?? []) {
    const matched = Array.isArray(person.matched)
      ? (person.matched as Array<{ skill: string; how: string }>)
      : [];
    console.log(
      `  [${person.evidence_score}] ${person.source} ${person.name ?? person.handle} (${person.location ?? "?"}) ${person.company ?? ""} ${person.state} ${person.linkedin_url ?? ""} proven=${matched.map((m) => `${m.skill}:${m.how}`).join(",")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
