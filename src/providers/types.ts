export type CallMeta = {
  kind: string;
  model?: string;
  durationMs: number;
};

export type ProviderError = {
  code: "missing_key" | "quota" | "timeout" | "invalid" | "upstream";
  message: string;
  retryable: boolean;
};

export type ProviderResult<T> =
  | { ok: true; data: T; meta: CallMeta }
  | { ok: false; error: ProviderError; meta: CallMeta };

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const status = (error as { status?: number }).status;
      if (status && status < 500 && status !== 429) throw error;
      const retryAfter = Number(
        (error as { headers?: { get?: (k: string) => string } }).headers?.get?.(
          "retry-after",
        ) ?? 0,
      );
      const wait = retryAfter
        ? retryAfter * 1000
        : 400 * 2 ** i + Math.random() * 200;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

export function fail(
  kind: string,
  error: ProviderError,
  extra?: Partial<CallMeta>,
): ProviderResult<never> {
  return { ok: false, error, meta: { kind, durationMs: 0, ...extra } };
}
