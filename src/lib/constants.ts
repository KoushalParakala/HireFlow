export const THINK_SECONDS = 30;
export const RECORD_SECONDS = 150;
export const MIN_RECORD_SECONDS = 5;
export const MIN_RECORD_BYTES = 120_000;
/** Peak mic meter (0–1) a take must reach or we treat it as silence. */
export const MIN_AUDIO_LEVEL = 0.08;
export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 360;
export const VIDEO_FPS = 24;
export const STORAGE_BUCKET = "interviews";
/** Matches storage.buckets.file_size_limit on interviews (50 MB). */
export const STORAGE_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
export const STORAGE_CAP_BYTES = STORAGE_FILE_LIMIT_BYTES;
export const AUTO_SHORTLIST_CAP = 15;
export const AUTO_SHORTLIST_MIN_SCORE = 55;
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export const STAGES = [
  "added",
  "scored",
  "shortlisted",
  "invited",
  "processing",
  "interviewed",
  "failed",
] as const;

export type DisplayStage = (typeof STAGES)[number];

export const DEFAULT_EMAIL = {
  subject: "Video interview for {{role}}",
  body: `Hi {{name}},

Please record your interview for {{role}}:
{{link}}

You can open this on any laptop with a camera. Thank you.`,
};
