import { deriveSignals } from "../src/lib/skills";
import { criteriaSchema } from "../src/lib/schemas";

/**
 * Dry-run a skill list against the catalog before spending a sourcing run on it.
 * usage: pnpm tsx scripts/check-signals.ts "React,Next.js,Postgres"
 */
const skills = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const nice = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const signals = deriveSignals(
  criteriaSchema.parse({ must_have: skills, nice_to_have: nice }),
);

console.log("must_have:");
for (const signal of signals.must) {
  console.log(
    `  ${signal.known ? "OK  " : "GUESS"} ${signal.skill.padEnd(16)} topics=[${signal.topics}] languages=[${signal.languages}] deps=[${signal.deps.slice(0, 5)}]`,
  );
}
if (signals.nice.length) {
  console.log("nice_to_have:");
  for (const signal of signals.nice) {
    console.log(`  ${signal.known ? "OK  " : "GUESS"} ${signal.skill}`);
  }
}
console.log("\ntopics in query order:", signals.topics.join(", "));
console.log("languages:", signals.languages.join(", ") || "(none)");

const guessed = [...signals.must, ...signals.nice].filter((s) => !s.known);
console.log(
  guessed.length
    ? `\n${guessed.length} skill(s) not in the catalog: ${guessed.map((s) => s.skill).join(", ")} — these only match via README text or manifest substring.`
    : "\nEvery skill resolved to real GitHub topics or languages.",
);
