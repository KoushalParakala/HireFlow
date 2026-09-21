import { STORAGE_FILE_LIMIT_BYTES } from "@/lib/constants";

export function normalizeVideoType(type: string) {
  const lower = (type || "").toLowerCase();
  if (lower.includes("mp4") || lower.includes("quicktime") || lower.includes("avc1")) {
    return "video/mp4";
  }
  return "video/webm";
}

export function videoFile(blob: Blob, name: string) {
  return new File([blob], name, { type: normalizeVideoType(blob.type) });
}

function failMessage(status: number, body: string) {
  const trimmed = body.replace(/\s+/g, " ").slice(0, 240);
  return trimmed ? `Upload failed (${status}): ${trimmed}` : `Upload failed (${status})`;
}

export async function uploadInterviewClip(input: {
  signedUrl: string;
  token: string;
  path: string;
  supabaseUrl: string;
  apikey?: string;
  file: File;
  onProgress: (n: number) => void;
}) {
  if (input.file.size > STORAGE_FILE_LIMIT_BYTES) {
    throw new Error(
      `File is over the 50 MB Storage limit (${(input.file.size / 1024 / 1024).toFixed(1)} MB).`,
    );
  }
  const url = new URL(input.signedUrl);
  if (input.token && !url.searchParams.get("token")) {
    url.searchParams.set("token", input.token);
  }
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", input.file);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url.toString());
    xhr.setRequestHeader("x-upsert", "true");
    if (input.apikey) xhr.setRequestHeader("apikey", input.apikey);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) input.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(failMessage(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
