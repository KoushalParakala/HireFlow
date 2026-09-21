import { locationVerdict } from "../src/lib/location";

/** Locations taken from real profiles the funnel returned, plus the aliases. */
const cases: Array<[string | null, string, "match" | "miss" | "unknown"]> = [
  // The bug: a recruiter types the official name, the profile says the old one.
  ["Bangalore", "Bengaluru", "match"],
  ["Bengaluru, India", "Bangalore", "match"],
  ["BLR", "Bengaluru", "match"],
  ["Bombay", "Mumbai", "match"],
  ["Gurgaon, Haryana", "Gurugram", "match"],
  ["Trivandrum", "Thiruvananthapuram", "match"],
  // Country filters are the safe default and must still work.
  ["Indore, India ", "India", "match"],
  ["India", "India", "match"],
  ["Bengaluru, India", "india", "match"],
  ["Bengaluru, Karnataka, India", "India", "match"],
  // Real misses stay misses.
  ["San Francisco, CA", "India", "miss"],
  ["Sydney, Australia", "Bengaluru", "miss"],
  ["Indore, India", "Bengaluru", "miss"],
  ["London, UK", "India", "miss"],
  // Unknown is its own answer, not a miss.
  [null, "India", "unknown"],
  ["", "India", "unknown"],
  ["   ", "Bengaluru", "unknown"],
  // No filter keeps everyone, including the blank profiles.
  [null, "", "match"],
  ["Sydney, Australia", "", "match"],
  ["Sydney, Australia", "  ", "match"],
];

let failed = 0;
for (const [profile, filter, want] of cases) {
  const got = locationVerdict(profile, filter);
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "pass" : "FAIL"}  profile=${JSON.stringify(profile).padEnd(30)} filter=${JSON.stringify(filter).padEnd(14)} want=${want.padEnd(7)} got=${got}`,
  );
}
console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
