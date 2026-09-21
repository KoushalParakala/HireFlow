import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Does GitHub hand us self-declared LinkedIn links? Measures the hit rate over
 * the people already sourced, to decide whether discovery needs a search engine.
 */
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
  const token = process.env.GITHUB_TOKEN;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: people } = await admin
    .from("sourced_people")
    .select("handle, name, company, blog, email")
    .order("evidence_score", { ascending: false });

  const rows = people ?? [];
  let linkedin = 0;
  let anySocial = 0;
  let blogIsLinkedIn = 0;

  for (const person of rows) {
    const res = await fetch(
      `https://api.github.com/users/${person.handle}/social_accounts`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "HireFlow-Probe",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!res.ok) {
      console.log(`  ${res.status} for @${person.handle}`);
      continue;
    }
    const accounts = (await res.json()) as Array<{ provider: string; url: string }>;
    if (accounts.length) anySocial += 1;
    const li = accounts.find(
      (a) => a.provider === "linkedin" || a.url.includes("linkedin.com"),
    );
    if (li) linkedin += 1;
    if (person.blog?.includes("linkedin.com")) blogIsLinkedIn += 1;
    const providers = accounts.map((a) => a.provider).join(",") || "none";
    console.log(
      `@${(person.handle ?? "").padEnd(22)} socials=${providers.padEnd(26)} ${li ? li.url : ""}`,
    );
  }

  console.log(`\n--- ${rows.length} people ---`);
  console.log(`  declared LinkedIn via social_accounts: ${linkedin}`);
  console.log(`  LinkedIn in the blog/website field:    ${blogIsLinkedIn}`);
  console.log(`  any social account declared:           ${anySocial}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
