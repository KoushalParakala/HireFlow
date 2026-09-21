import type { JobCriteria } from "./schemas";

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").trim();
}

function overlap(needles: string[], haystack: string) {
  if (!needles.length) return 1;
  const hay = norm(haystack);
  const hits = needles.filter((n) => hay.includes(norm(n))).length;
  return hits / needles.length;
}

export function ruleScore(input: {
  criteria: JobCriteria;
  skills: string[];
  title?: string | null;
  location?: string | null;
  experience?: string | null;
}) {
  const blob = [input.title, input.experience, input.skills.join(" ")]
    .filter(Boolean)
    .join(" ");
  const must = overlap(input.criteria.must_have, blob);
  const nice = overlap(input.criteria.nice_to_have, blob);
  const seniority = input.criteria.seniority
    ? overlap([input.criteria.seniority], blob)
    : 1;
  const location =
    !input.criteria.location ||
    overlap([input.criteria.location], input.location ?? "");
  const score = Math.round(
    (must * 0.5 + nice * 0.2 + seniority * 0.2 + (location ? 1 : 0) * 0.1) *
      100,
  );
  return Math.max(0, Math.min(100, score));
}

/** Interview scorecard average is 0–5. Match and fit scores are 0–100. */
export function interviewFit(averageOutOfFive: number | null | undefined) {
  if (averageOutOfFive == null || !Number.isFinite(averageOutOfFive)) return null;
  return Math.round((averageOutOfFive / 5) * 1000) / 10;
}

export function combinedScore(rule: number | null, fit: number | null) {
  if (fit == null) return rule;
  if (rule == null) return Math.round(fit * 10) / 10;
  return Math.round((0.4 * rule + 0.6 * fit) * 10) / 10;
}
