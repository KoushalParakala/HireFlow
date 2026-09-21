import { serverEnv } from "@/lib/env";

const API = "https://api.github.com";

/**
 * GitHub splits rate limits across three independent buckets. Search is
 * 30/min authenticated and 10/min anonymous; code search is 10/min and refuses
 * anonymous callers entirely; everything else draws on core (5,000/hour with a
 * token, 60/hour without).
 */
export type Bucket = "core" | "search" | "code_search";

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

/** Thrown when a run runs out of its own allowance, not GitHub's. */
export class BudgetError extends Error {
  constructor(readonly bucket: Bucket | "deadline") {
    super(
      bucket === "deadline"
        ? "Sourcing run hit its time budget"
        : `Sourcing run hit its ${bucket} call budget`,
    );
    this.name = "BudgetError";
  }
}

export type GithubClientOptions = {
  token?: string;
  budget?: Partial<Record<Bucket, number>>;
  deadline?: number;
};

type RepoOwner = { login: string; type: string };

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: RepoOwner;
  html_url: string;
  description: string | null;
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  forks_count: number;
  size: number;
  language: string | null;
  topics?: string[];
  pushed_at: string;
  created_at: string;
  default_branch: string;
};

export type GithubContributor = {
  login?: string;
  type?: string;
  contributions: number;
};

export type GithubUser = {
  login: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  hireable: boolean | null;
  public_repos: number;
  followers: number;
  html_url: string;
  avatar_url: string;
  created_at: string;
};

export class GithubClient {
  readonly authed: boolean;
  readonly calls: Record<Bucket, number> = { core: 0, search: 0, code_search: 0 };
  readonly notes: string[] = [];
  private readonly token: string;
  private readonly budget: Record<Bucket, number>;
  private readonly interval: Record<Bucket, number>;
  private readonly lastAt: Record<Bucket, number> = {
    core: 0,
    search: 0,
    code_search: 0,
  };
  private deadline: number;

  constructor(options: GithubClientOptions = {}) {
    this.token = options.token ?? serverEnv().githubToken;
    this.authed = Boolean(this.token);
    this.deadline = options.deadline ?? Date.now() + 200_000;
    this.interval = {
      core: this.authed ? 0 : 1_100,
      search: this.authed ? 2_100 : 6_200,
      code_search: 6_200,
    };
    this.budget = {
      core: options.budget?.core ?? (this.authed ? 900 : 45),
      search: options.budget?.search ?? (this.authed ? 24 : 6),
      code_search: options.budget?.code_search ?? (this.authed ? 8 : 0),
    };
  }

  get spent() {
    return { ...this.calls };
  }

  timeLeft() {
    return this.deadline - Date.now();
  }

  private async request<T>(
    bucket: Bucket,
    path: string,
    options: { raw?: boolean } = {},
  ): Promise<T | null> {
    if (this.calls[bucket] >= this.budget[bucket]) throw new BudgetError(bucket);
    if (Date.now() > this.deadline) throw new BudgetError("deadline");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const wait = this.lastAt[bucket] + this.interval[bucket] - Date.now();
      if (wait > 0) await sleep(Math.min(wait, Math.max(this.timeLeft() - 1_000, 0)));
      if (Date.now() > this.deadline) throw new BudgetError("deadline");

      this.lastAt[bucket] = Date.now();
      this.calls[bucket] += 1;

      const headers: Record<string, string> = {
        Accept: options.raw
          ? "application/vnd.github.raw"
          : "application/vnd.github+json",
        "User-Agent": "HireFlow-Sourcing",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;

      let response: Response;
      try {
        response = await fetch(`${API}${path}`, { headers });
      } catch (error) {
        if (attempt === 2) {
          throw new GithubError(
            error instanceof Error ? error.message : "GitHub request failed",
            0,
            true,
          );
        }
        await sleep(600 * 2 ** attempt);
        continue;
      }

      if (response.ok) {
        return options.raw
          ? ((await response.text()) as unknown as T)
          : ((await response.json()) as T);
      }
      if (response.status === 404) return null;

      const body = await response.text();
      if (response.status === 401) {
        throw new GithubError(
          "GitHub rejected the token (401). Check GITHUB_TOKEN.",
          401,
          false,
        );
      }
      if (response.status === 422) {
        // Paging past the 1,000-result search ceiling lands here; treat as an end
        // of results rather than a failure.
        return null;
      }
      if (response.status === 403 || response.status === 429) {
        const waitMs = retryAfterMs(response);
        if (waitMs != null && waitMs < this.timeLeft() - 5_000 && attempt < 2) {
          this.notes.push(`Rate limited on ${bucket}, waited ${Math.round(waitMs / 1000)}s`);
          await sleep(waitMs);
          continue;
        }
        throw new GithubError(
          this.authed
            ? `GitHub rate limit reached on ${bucket}. Try again shortly.`
            : `GitHub rate limit reached on ${bucket}. Set GITHUB_TOKEN to raise it.`,
          response.status,
          true,
        );
      }
      if (response.status >= 500 && attempt < 2) {
        await sleep(800 * 2 ** attempt);
        continue;
      }
      throw new GithubError(
        `GitHub ${response.status}: ${body.slice(0, 200)}`,
        response.status,
        response.status >= 500,
      );
    }
    throw new GithubError("GitHub request exhausted retries", 0, true);
  }

  async searchRepos(
    q: string,
    options: { perPage?: number; page?: number; sort?: "stars" | "updated" } = {},
  ) {
    const params = new URLSearchParams({
      q,
      per_page: String(options.perPage ?? 50),
      page: String(options.page ?? 1),
    });
    if (options.sort) params.set("sort", options.sort);
    const data = await this.request<{ items: GithubRepo[]; total_count: number }>(
      "search",
      `/search/repositories?${params}`,
    );
    return data ?? { items: [], total_count: 0 };
  }

  /**
   * Code search proves a dependency is really imported. It needs a token, at
   * least one free-text term alongside any qualifiers, and only sees default
   * branches, so treat a miss as "unproven" rather than "absent".
   */
  async searchCode(q: string, options: { perPage?: number } = {}) {
    if (!this.authed) return { items: [], total_count: 0 };
    const params = new URLSearchParams({
      q,
      per_page: String(options.perPage ?? 30),
    });
    const data = await this.request<{
      items: Array<{ path: string; repository: GithubRepo }>;
      total_count: number;
    }>("code_search", `/search/code?${params}`);
    return data ?? { items: [], total_count: 0 };
  }

  languages(owner: string, repo: string) {
    return this.request<Record<string, number>>(
      "core",
      `/repos/${owner}/${repo}/languages`,
    );
  }

  async contributors(owner: string, repo: string, perPage = 25) {
    const data = await this.request<GithubContributor[]>(
      "core",
      `/repos/${owner}/${repo}/contributors?per_page=${perPage}&anon=0`,
    );
    return Array.isArray(data) ? data : [];
  }

  user(login: string) {
    return this.request<GithubUser>("core", `/users/${login}`);
  }

  /**
   * Links the person chose to publish on their own profile. This is how we get
   * a LinkedIn URL without touching LinkedIn.
   */
  async socialAccounts(login: string) {
    const data = await this.request<Array<{ provider: string; url: string }>>(
      "core",
      `/users/${login}/social_accounts`,
    );
    return Array.isArray(data) ? data : [];
  }

  /** Raw file text, or null when the path does not exist on the default branch. */
  file(owner: string, repo: string, path: string) {
    return this.request<string>(
      "core",
      `/repos/${owner}/${repo}/contents/${path}`,
      { raw: true },
    );
  }

  async readme(owner: string, repo: string) {
    const text = await this.request<string>(
      "core",
      `/repos/${owner}/${repo}/readme`,
      { raw: true },
    );
    return text ? text.slice(0, 6_000) : null;
  }
}

function retryAfterMs(response: Response) {
  const retryAfter = Number(response.headers.get("retry-after") ?? 0);
  if (retryAfter > 0) return retryAfter * 1000;
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0);
    if (reset > 0) return Math.max(reset * 1000 - Date.now(), 1_000);
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}
