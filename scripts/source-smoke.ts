import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { linkedinSource } from "../src/providers/source/linkedin";
import { deriveSignals } from "../src/lib/skills";
import { criteriaSchema } from "../src/lib/schemas";

function loadEnvLocal() {
  try {
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
  } catch {
    // .env.local is optional for this script
  }
}

async function main() {
  loadEnvLocal();
  process.env.PROVIDER_MODE = "real";

  const mustHave = (process.argv[2] ?? "LangChain,FastAPI,Postgres").split(",");
  const location = process.argv[3] ?? "";
  const titles = (process.argv[4] ?? "Software Engineer").split(",");

  const criteria = criteriaSchema.parse({
    must_have: mustHave,
    nice_to_have: ["Docker"],
    seniority: "mid",
    location,
  });

  const signals = deriveSignals(criteria);
  console.log("Apify token present:", Boolean(process.env.APIFY_TOKEN));
  console.log("\n--- signals ---");
  for (const signal of signals.must) {
    console.log(
      `  ${signal.skill} -> topics=[${signal.topics}] languages=[${signal.languages}] deps=[${signal.deps}] known=${signal.known}`,
    );
  }

  const started = Date.now();
  const result = await linkedinSource.search({
    criteria,
    options: {
      location,
      titles,
      limit: 10,
      minEvidence: 30,
      deadline: Date.now() + 170_000,
    },
  });

  if (!result.ok) {
    console.error("\nFAILED:", result.error.code, result.error.message);
    process.exit(1);
  }

  const { people, stats } = result.data;
  console.log("\n--- queries ---");
  stats.queries.forEach((q) => console.log(`  ${q}`));
  console.log("\n--- stats ---");
  console.log(
    `  authed=${stats.authed} found=${stats.peopleFound ?? stats.reposFound} considered=${stats.peopleConsidered} kept=${people.length} partial=${stats.partial}`,
  );
  console.log(`  calls=${JSON.stringify(stats.calls)} notes=${JSON.stringify(stats.notes)}`);
  console.log(`  elapsed=${Math.round((Date.now() - started) / 1000)}s`);

  console.log(`\n--- ${people.length} people ---`);
  for (const person of people) {
    console.log(
      `\n[${person.evidenceScore}] ${person.name ?? person.handle} (${person.location ?? "location unknown"}) ${person.linkedinUrl ?? ""}`,
    );
    console.log(`  headline: ${person.bio ?? ""}`);
    console.log(`  proven: ${person.matched.map((m) => `${m.skill}:${m.how}`).join(", ")}`);
    if (person.missing.length) console.log(`  unproven: ${person.missing.join(", ")}`);
    for (const role of person.evidence.slice(0, 2)) {
      console.log(`  ${role.full_name} ${role.commits} mo`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
