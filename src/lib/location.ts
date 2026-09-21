import { normalize } from "@/lib/skills";

/**
 * Profiles that name the same place differently should still match, which for
 * Indian cities matters a lot: a recruiter types the official name while the
 * profile almost always carries the old one.
 */
const CITY_ALIASES = [
  ["bengaluru", "bangalore", "blr"],
  ["mumbai", "bombay"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
  ["pune", "poona"],
  ["gurugram", "gurgaon"],
  ["delhi", "new delhi", "ncr", "noida"],
  ["hyderabad", "secunderabad"],
  ["thiruvananthapuram", "trivandrum"],
  ["kochi", "cochin"],
  ["vadodara", "baroda"],
  ["san francisco", "bay area", "sf"],
  ["new york", "nyc", "brooklyn"],
  ["bengaluru urban", "bangalore urban"],
] as const;

/** Every term a location string should be allowed to match on. */
function locationTerms(value: string) {
  const text = normalize(value);
  const terms = new Set<string>();
  const parts = text.split(/[,/|·-]/).map((part) => part.trim());
  for (const part of [text, ...parts]) {
    if (!part) continue;
    terms.add(part);
    for (const group of CITY_ALIASES) {
      if (group.some((alias) => part === alias || part.includes(alias))) {
        for (const alias of group) terms.add(alias);
      }
    }
  }
  return [...terms];
}

/**
 * Unknown is a third answer, not a miss. An empty profile location is no
 * evidence the person is somewhere else, and dropping them silently is how a
 * run ends up keeping nobody.
 */
export function locationVerdict(
  profileLocation: string | null,
  filter: string,
): "match" | "miss" | "unknown" {
  if (!normalize(filter)) return "match";
  if (!profileLocation || !normalize(profileLocation)) return "unknown";
  const have = locationTerms(profileLocation);
  const want = locationTerms(filter);
  const hit = want.some((w) =>
    have.some((h) => h === w || (w.length >= 3 && h.length >= 3 && (h.includes(w) || w.includes(h)))),
  );
  return hit ? "match" : "miss";
}
