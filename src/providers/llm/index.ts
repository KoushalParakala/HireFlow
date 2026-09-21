import {
  criteriaSchema,
  profileSchema,
  questionSchema,
  rankingSchema,
  scorecardSchema,
  type AnswerScores,
  type GeneratedQuestion,
  type JobCriteria,
  type ParsedProfile,
} from "@/lib/schemas";
import { serverEnv } from "@/lib/env";
import type { ProviderResult } from "../types";
import { fakeLlm } from "./fake";
import { groqLlm } from "./groq";

export type LlmProvider = {
  analyzeJd: (input: {
    title: string;
    description: string;
    filters?: Record<string, unknown>;
  }) => Promise<ProviderResult<JobCriteria>>;
  generateQuestions: (input: {
    title: string;
    description: string;
    criteria: JobCriteria;
    easy: number;
    medium: number;
    hard: number;
  }) => Promise<ProviderResult<GeneratedQuestion[]>>;
  scoreAnswer: (input: {
    question: string;
    keyPoints: string[];
    transcript: string;
  }) => Promise<ProviderResult<AnswerScores>>;
  /** Pull structured fields out of a profile or resume a recruiter pasted in. */
  parseProfile: (input: { text: string }) => Promise<ProviderResult<ParsedProfile>>;
  rankCandidates: (input: {
    jobTitle: string;
    candidates: Array<Record<string, unknown>>;
  }) => Promise<
    ProviderResult<{ narrative: string; ranking: Array<{ candidate_id: string; place: number; why: string }> }>
  >;
  ping: () => Promise<ProviderResult<{ model: string }>>;
};

export function llm(): LlmProvider {
  return serverEnv().providerMode === "real" ? groqLlm : fakeLlm;
}

export { criteriaSchema, profileSchema, questionSchema, rankingSchema, scorecardSchema };
