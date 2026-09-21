import type { SttProvider } from "./index";

export const fakeStt: SttProvider = {
  async transcribe() {
    return {
      ok: true,
      data: {
        text: "I owned a similar problem at my last role. I scoped the work, shipped an MVP in two weeks, measured drop-off, then iterated on the slowest step. The result was a 30% faster cycle time.",
      },
      meta: { kind: "stt", model: "fake", durationMs: 8 },
    };
  },
};
