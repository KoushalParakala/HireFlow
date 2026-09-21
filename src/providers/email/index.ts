import { serverEnv } from "@/lib/env";
import type { ProviderResult } from "../types";
import { fakeEmail } from "./fake";
import { gmailEmail } from "./gmail";

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export type EmailProvider = {
  send: (payload: EmailPayload) => Promise<ProviderResult<{ id: string }>>;
  verify: () => Promise<ProviderResult<{ ok: true }>>;
};

export function email(): EmailProvider {
  const env = serverEnv();
  if (env.gmailUser && env.gmailAppPassword) return gmailEmail;
  // Real mode must not pretend mail went out (that wipes the copy-link token).
  return env.providerMode === "real" ? gmailEmail : fakeEmail;
}
