import { serverEnv } from "@/lib/env";

const API = "https://api.apify.com/v2";

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

export type ApifyRun = {
  id: string;
  status: string;
  statusMessage?: string | null;
  defaultDatasetId?: string | null;
};

export class ApifyClient {
  readonly token: string;
  readonly authed: boolean;
  private readonly deadline: number;
  spent = { runs: 0, polls: 0, items: 0 };

  constructor(options: { token?: string; deadline?: number } = {}) {
    this.token = options.token ?? serverEnv().apifyToken;
    this.authed = Boolean(this.token);
    this.deadline = options.deadline ?? Date.now() + 200_000;
  }

  async startRun(actorId: string, input: Record<string, unknown>): Promise<ApifyRun> {
    this.spent.runs += 1;
    const data = await this.request<{ data: ApifyRun }>(
      "POST",
      `/acts/${actorPath(actorId)}/runs`,
      input,
    );
    if (!data.data?.id) {
      throw new ApifyError("Apify started a run but returned no id", 502, true);
    }
    return data.data;
  }

  async getRun(runId: string, waitForFinish = 0): Promise<ApifyRun> {
    this.spent.polls += 1;
    const wait = Math.max(0, Math.min(60, Math.floor(waitForFinish)));
    const qs = wait ? `?waitForFinish=${wait}` : "";
    const data = await this.request<{ data: ApifyRun }>("GET", `/actor-runs/${runId}${qs}`);
    if (!data.data?.id) {
      throw new ApifyError(`Apify run ${runId} was not found`, 404, false);
    }
    return data.data;
  }

  /**
   * Wait until the actor finishes or this sourcing run runs out of time.
   * A timeout does not abort Apify — the next worker tick resumes the same run.
   */
  async waitForRun(runId: string): Promise<ApifyRun> {
    let run = await this.getRun(runId);
    while (!isTerminal(run.status)) {
      const remainingMs = this.deadline - Date.now() - 8_000;
      if (remainingMs < 3_000) {
        throw new ApifyError(
          "Apify is still scraping LinkedIn; the next worker tick will resume this run.",
          408,
          true,
        );
      }
      run = await this.getRun(runId, Math.min(55, remainingMs / 1000));
    }
    if (run.status !== "SUCCEEDED") {
      throw new ApifyError(
        run.statusMessage?.trim() || `Apify run ${run.status.toLowerCase()}`,
        run.status === "TIMED-OUT" ? 408 : 502,
        run.status === "TIMED-OUT" || run.status === "FAILED",
      );
    }
    return run;
  }

  async datasetItems(datasetId: string): Promise<unknown[]> {
    this.spent.items += 1;
    const items = await this.request<unknown[]>(
      "GET",
      `/datasets/${datasetId}/items?clean=true&limit=250`,
    );
    return Array.isArray(items) ? items : [];
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.token) {
      throw new ApifyError("Missing APIFY_TOKEN", 401, false);
    }
    const remaining = this.deadline - Date.now();
    if (remaining < 1_000) {
      throw new ApifyError(
        "Apify is still scraping LinkedIn; the next worker tick will resume this run.",
        408,
        true,
      );
    }

    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(Math.min(70_000, remaining)),
    });

    if (response.status === 401 || response.status === 403) {
      throw new ApifyError(
        "Apify rejected the token. Check APIFY_TOKEN in .env.local.",
        response.status,
        false,
      );
    }
    if (response.status === 402) {
      throw new ApifyError(
        "Apify is out of credits for this account. Top up at console.apify.com.",
        402,
        false,
      );
    }
    if (response.status === 429) {
      throw new ApifyError("Apify rate limit reached. Try again shortly.", 429, true);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ApifyError(
        `Apify ${response.status}: ${text.slice(0, 200) || response.statusText}`,
        response.status,
        response.status >= 500,
      );
    }
    return (await response.json()) as T;
  }
}

function actorPath(actorId: string) {
  return actorId.trim().replace("/", "~");
}

function isTerminal(status: string) {
  return (
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "ABORTED" ||
    status === "TIMED-OUT"
  );
}
