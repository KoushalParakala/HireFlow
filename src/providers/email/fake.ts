import type { EmailProvider } from "./index";

export const fakeEmail: EmailProvider = {
  async send({ to }) {
    return {
      ok: true,
      data: { id: `fake-${to}` },
      meta: { kind: "email", model: "fake", durationMs: 2 },
    };
  },
  async verify() {
    return {
      ok: true,
      data: { ok: true },
      meta: { kind: "email_verify", model: "fake", durationMs: 1 },
    };
  },
};
