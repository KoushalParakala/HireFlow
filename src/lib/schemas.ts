import { z } from "zod";

function stringList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export const criteriaSchema = z.object({
  must_have: z.array(z.string()).default([]),
  nice_to_have: z.array(z.string()).default([]),
  seniority: z.string().default(""),
  experience_years: z.string().default(""),
  location: z.string().default(""),
  summary: z.string().default(""),
  implicit: z.array(z.string()).default([]),
});

export function coerceCriteria(raw: unknown) {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return criteriaSchema.parse({
    must_have: stringList(obj.must_have ?? obj.required_skills),
    nice_to_have: stringList(obj.nice_to_have ?? obj.preferred_skills),
    seniority: String(obj.seniority ?? obj.role_level ?? ""),
    experience_years: String(obj.experience_years ?? obj.experience_range ?? ""),
    location: String(obj.location ?? ""),
    summary: String(obj.summary ?? ""),
    implicit: stringList(obj.implicit ?? obj.implicit_requirements),
  });
}

export const questionSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  text: z.string().min(8),
  key_points: z.array(z.string()).default([]),
});

export function coerceQuestion(raw: unknown) {
  if (typeof raw === "string") {
    return questionSchema.parse({
      difficulty: "medium",
      text: raw,
      key_points: [],
    });
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  const difficultyRaw = String(obj.difficulty ?? "medium").toLowerCase();
  const difficulty =
    difficultyRaw === "easy" || difficultyRaw === "hard" ? difficultyRaw : "medium";
  const points = obj.key_points ?? obj.keypoints ?? [];
  return questionSchema.parse({
    difficulty,
    text: String(obj.text ?? obj.question ?? "").trim(),
    key_points: stringList(points),
  });
}

export const profileSchema = z.object({
  name: z.string().default(""),
  email: z.string().default(""),
  title: z.string().default(""),
  company: z.string().default(""),
  location: z.string().default(""),
  linkedin_url: z.string().default(""),
  years_experience: z.number().nullable().default(null),
  skills: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

/**
 * Extraction from a pasted profile, where the model is reading someone else's
 * free-form text rather than a JD, so every field can legitimately be empty.
 */
export function coerceProfile(raw: unknown) {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const email = String(obj.email ?? "").trim().toLowerCase();
  const years = Number(obj.years_experience ?? obj.experience_years);
  return profileSchema.parse({
    name: String(obj.name ?? obj.full_name ?? "").trim().slice(0, 120),
    email: /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email) ? email : "",
    title: String(obj.title ?? obj.headline ?? obj.current_title ?? "").trim().slice(0, 160),
    company: String(obj.company ?? obj.current_company ?? "").trim().slice(0, 120),
    location: String(obj.location ?? "").trim().slice(0, 120),
    linkedin_url: String(obj.linkedin_url ?? obj.profile_url ?? "").trim(),
    years_experience:
      Number.isFinite(years) && years >= 0 ? Math.min(Math.round(years), 60) : null,
    skills: stringList(obj.skills).slice(0, 40),
    summary: String(obj.summary ?? obj.experience_summary ?? "").trim().slice(0, 4_000),
  });
}

export const scorecardSchema = z.object({
  relevance: z.number().min(0).max(5),
  clarity: z.number().min(0).max(5),
  specificity: z.number().min(0).max(5),
  depth: z.number().min(0).max(5),
  summary: z.string(),
  communication_notes: z.string(),
});

export const rankingSchema = z.object({
  ranking: z.array(
    z.object({
      candidate_id: z.string(),
      place: z.number(),
      why: z.string(),
    }),
  ),
  narrative: z.string(),
});

export type JobCriteria = z.infer<typeof criteriaSchema>;
export type GeneratedQuestion = z.infer<typeof questionSchema>;
export type AnswerScores = z.infer<typeof scorecardSchema>;
export type ParsedProfile = z.infer<typeof profileSchema>;
