import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { GithubClient } from "../src/lib/github";
import { linkedinFrom } from "../src/lib/social";

/**
 * People sourced before social links existed have empty socials columns.
 * One core call each, safe to re-run: it only touches rows with no socials yet.
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
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: people, error } = await admin
    .from("sourced_people")
    .select("id, handle, blog, socials")
    .eq("source", "github");
  if (error) throw new Error(error.message);

  const todo = (people ?? []).filter(
    (person) => person.handle && !(person.socials as unknown[])?.length,
  );
  console.log(`${people?.length ?? 0} sourced people, ${todo.length} need socials`);

  const client = new GithubClient({ deadline: Date.now() + 600_000 });
  let linkedin = 0;
  let failures = 0;

  for (const person of todo) {
    try {
      const socials = await client.socialAccounts(person.handle!);
      const linkedinUrl = linkedinFrom(socials, person.blog);
      if (linkedinUrl) linkedin += 1;
      const { error: writeError } = await admin
        .from("sourced_people")
        .update({ socials, linkedin_url: linkedinUrl })
        .eq("id", person.id);
      if (writeError) throw new Error(writeError.message);
      console.log(
        `  @${person.handle!.padEnd(22)} ${linkedinUrl ?? `${socials.length} other link(s)`}`,
      );
    } catch (err) {
      failures += 1;
      console.log(`  @${person.handle} failed: ${(err as Error).message}`);
    }
  }

  console.log(
    `\nbackfilled ${todo.length - failures}, LinkedIn found for ${linkedin}, failures ${failures}`,
  );
  console.log("calls:", JSON.stringify(client.spent));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
