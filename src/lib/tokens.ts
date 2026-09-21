import { createHash, randomBytes } from "crypto";

export function createInterviewToken() {
  const raw = randomBytes(32).toString("hex");
  return {
    raw,
    hash: hashToken(raw),
    prefix: raw.slice(0, 8),
  };
}

export function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}
