import { serverEnv } from "@/lib/env";
import { fail, type ProviderResult } from "../types";
import { fakeStt } from "./fake";
import { groqStt } from "./groq";

export type SttProvider = {
  transcribe: (input: {
    file?: Blob;
    mimeType?: string;
  }) => Promise<ProviderResult<{ text: string }>>;
};

export function stt(): SttProvider {
  return serverEnv().providerMode === "real" ? groqStt : fakeStt;
}

export { fail };
