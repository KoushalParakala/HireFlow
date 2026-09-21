/** Whisper often returns "." or commas for silence / 0-second clips. */
export function hasUsableSpeech(text: string) {
  return text.replace(/[\s.,!?;:'"…\-–—]/g, "").length >= 2;
}
