import {
  coerceProfile,
  criteriaSchema,
  questionSchema,
  rankingSchema,
  scorecardSchema,
  type GeneratedQuestion,
} from "@/lib/schemas";
import { linkedinFromText } from "@/lib/social";
import type { LlmProvider } from "./index";

const BANKS: Record<GeneratedQuestion["difficulty"], string[]> = {
  easy: [
    "Walk us through a recent project you owned end to end.",
    "How do you decide what to build first when the brief is fuzzy?",
    "Tell us how you give and receive feedback on a team.",
  ],
  medium: [
    "Describe a time you had to debug a production issue under time pressure.",
    "How would you design a screening pipeline that stays fair as volume grows?",
    "Explain a technical tradeoff you made and what you would change now.",
  ],
  hard: [
    "Design an async interview system that survives process restarts without losing work.",
    "A hiring manager wants speed; legal wants consistency. How do you ship both?",
    "Walk through how you would evaluate whether an AI scorecard is trustworthy.",
  ],
};

export const fakeLlm: LlmProvider = {
  async analyzeJd({ title, description, filters }) {
    const started = Date.now();
    const skills = Array.from(
      (description.match(/\b[A-Z][a-zA-Z+#.]{2,}\b/g) ?? [])
        .slice(0, 8),
    );
    const data = criteriaSchema.parse({
      must_have: skills.slice(0, 4).length ? skills.slice(0, 4) : ["communication"],
      nice_to_have: skills.slice(4),
      seniority: String(filters?.seniority ?? "mid"),
      experience_years: String(filters?.experience_years ?? "3-5"),
      location: String(filters?.location ?? ""),
      summary: `Hiring a ${title} who can own delivery and communicate clearly.`,
    });
    return {
      ok: true,
      data,
      meta: { kind: "analyze_jd", model: "fake", durationMs: Date.now() - started },
    };
  },

  async generateQuestions({ easy, medium, hard }) {
    const started = Date.now();
    const pick = (d: GeneratedQuestion["difficulty"], n: number) =>
      BANKS[d].slice(0, n).map((text) =>
        questionSchema.parse({
          difficulty: d,
          text,
          key_points: ["Specific example", "Tradeoffs", "Impact"],
        }),
      );
    return {
      ok: true,
      data: [
        ...pick("easy", easy),
        ...pick("medium", medium),
        ...pick("hard", hard),
      ],
      meta: {
        kind: "generate_questions",
        model: "fake",
        durationMs: Date.now() - started,
      },
    };
  },

  async scoreAnswer({ transcript }) {
    const started = Date.now();
    const length = transcript.trim().split(/\s+/).length;
    const base = Math.min(5, Math.max(2, Math.round(length / 40)));
    return {
      ok: true,
      data: scorecardSchema.parse({
        relevance: base,
        clarity: Math.min(5, base + 1),
        specificity: base,
        depth: Math.max(1, base - 1),
        summary: "Simulated scorecard from a fake provider — no live model call.",
        communication_notes: "Clear structure; add more concrete numbers in a live run.",
      }),
      meta: { kind: "score_answer", model: "fake", durationMs: Date.now() - started },
    };
  },

  async parseProfile({ text }) {
    const started = Date.now();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return {
      ok: true,
      data: coerceProfile({
        name: lines[0] ?? "",
        email: text.match(/[^\s<>()]+@[^\s<>()]+\.[a-z]{2,}/i)?.[0] ?? "",
        title: lines[1] ?? "",
        linkedin_url: linkedinFromText(text) ?? "",
        skills: (text.match(/\b(?:React|Next\.js|TypeScript|Python|Postgres|Docker)\b/gi) ?? [])
          .map((s) => s.trim()),
        summary: "Parsed by the fake provider — set PROVIDER_MODE=real for Groq.",
      }),
      meta: { kind: "parse_profile", model: "fake", durationMs: Date.now() - started },
    };
  },

  async rankCandidates({ candidates }) {
    const started = Date.now();
    const ranking = candidates.map((c, i) => ({
      candidate_id: String(c.id),
      place: i + 1,
      why: "Ordered by current match and interview averages (fake provider).",
    }));
    return {
      ok: true,
      data: rankingSchema.parse({
        ranking,
        narrative: "Fake ranking for local demos. Switch PROVIDER_MODE=real for Groq.",
      }),
      meta: { kind: "rank", model: "fake", durationMs: Date.now() - started },
    };
  },

  async ping() {
    return {
      ok: true,
      data: { model: "fake" },
      meta: { kind: "ping", model: "fake", durationMs: 1 },
    };
  },
};
