import type { JobCriteria } from "@/lib/schemas";
import type { RepoEvidence } from "@/lib/evidence";
import { serverEnv } from "@/lib/env";
import type { ProviderResult } from "../types";
import { fakeSource } from "./fake";
import { githubSource } from "./github";
import { linkedinSource } from "./linkedin";

export type SourceKind = "github" | "linkedin";

export type SourceOptions = {
  /** Skills the recruiter typed, which replace the JD's must_have list. */
  skills?: string[];
  /** Current-role titles sent to LinkedIn people search. */
  titles?: string[];
  location?: string;
  minStars?: number;
  pushedWithinMonths?: number;
  /** Max people returned. */
  limit?: number;
  /** Drop anyone scoring below this out of 100. */
  minEvidence?: number;
  /** Max repos to inspect in depth; the main cost knob. */
  repoBudget?: number;
  /** Minimum share of a repo's commits before we credit the project to them. */
  minCommitShare?: number;
  deadline?: number;
  /** Resume an Apify actor run across worker ticks instead of paying twice. */
  apifyRunId?: string;
  onRunStarted?: (runId: string) => Promise<void>;
};

export type SourcedPerson = {
  externalId: string;
  handle: string;
  name: string | null;
  profileUrl: string;
  avatarUrl: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  company: string | null;
  blog: string | null;
  followers: number | null;
  publicRepos: number | null;
  hireable: boolean | null;
  /** Links the person published on their own profile. */
  socials: Array<{ provider: string; url: string }>;
  linkedinUrl: string | null;
  skills: string[];
  evidence: RepoEvidence[];
  matched: Array<{ skill: string; how: string; repo: string }>;
  missing: string[];
  evidenceScore: number;
  summary: string;
};

export type SourceStats = {
  authed: boolean;
  queries: string[];
  reposFound: number;
  reposKept: number;
  reposInspected: number;
  peopleFound?: number;
  peopleConsidered: number;
  /** Cut by the location filter; the usual reason a run keeps nobody. */
  droppedLocation: number;
  /** Cut by minEvidence. */
  droppedScore: number;
  /** Kept despite an empty profile location. */
  locationUnknown: number;
  /** Kept people with a canonical LinkedIn profile URL. */
  withLinkedin: number;
  calls: Record<string, number>;
  notes: string[];
  partial: boolean;
};

export type SourceProvider = {
  key: SourceKind;
  search: (input: {
    criteria: JobCriteria;
    options: SourceOptions;
  }) => Promise<ProviderResult<{ people: SourcedPerson[]; stats: SourceStats }>>;
};

export function asSourceKind(value: unknown): SourceKind {
  return value === "github" ? "github" : "linkedin";
}

export function source(kind: SourceKind): SourceProvider {
  if (serverEnv().providerMode !== "real") return fakeSource(kind);
  return kind === "github" ? githubSource : linkedinSource;
}
