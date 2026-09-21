import Groq, { toFile } from "groq-sdk";
import { serverEnv } from "@/lib/env";
import { hasUsableSpeech } from "@/lib/transcript";
import { fail, withRetry } from "../types";
import type { SttProvider } from "./index";

export const groqStt: SttProvider = {
  async transcribe({ file, mimeType }) {
    const started = Date.now();
    const key = serverEnv().groqApiKey;
    if (!key) {
      return fail("stt", {
        code: "missing_key",
        message: "GROQ_API_KEY is not set",
        retryable: false,
      });
    }
    if (!file?.size) {
      return fail("stt", {
        code: "invalid",
        message: "No interview video to transcribe",
        retryable: false,
      });
    }
    try {
      const groq = new Groq({ apiKey: key });
      const upload = await toFile(
        file,
        `answer.${(mimeType ?? "video/webm").includes("mp4") ? "mp4" : "webm"}`,
        { type: mimeType ?? "video/webm" },
      );
      const result = await withRetry(() =>
        groq.audio.transcriptions.create({
          model: "whisper-large-v3-turbo",
          file: upload,
          response_format: "json",
        }),
      );
      const text = result.text?.trim() ?? "";
      if (!hasUsableSpeech(text)) {
        return fail("stt", {
          code: "invalid",
          message: "Empty transcript — the clip may have no usable audio",
          retryable: false,
        }, { model: "whisper-large-v3-turbo", durationMs: Date.now() - started });
      }
      return {
        ok: true,
        data: { text },
        meta: {
          kind: "stt",
          model: "whisper-large-v3-turbo",
          durationMs: Date.now() - started,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "STT failed";
      const quota = /rate|quota|429/i.test(message);
      return fail("stt", {
        code: quota ? "quota" : "upstream",
        message,
        retryable: true,
      }, { model: "whisper-large-v3-turbo", durationMs: Date.now() - started });
    }
  },
};
