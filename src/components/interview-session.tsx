"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MIN_AUDIO_LEVEL,
  MIN_RECORD_SECONDS,
  RECORD_SECONDS,
  STORAGE_FILE_LIMIT_BYTES,
  THINK_SECONDS,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "@/lib/constants";
import { uploadInterviewClip, videoFile } from "@/lib/media";

type Question = { id: string; text: string; uploaded: boolean };
type Phase = "preflight" | "think" | "record" | "review" | "upload" | "done";

const DB = "hireflow";
const STORE = "clips";

async function idb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveClip(key: string, blob: Blob) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadClip(key: string) {
  const db = await idb();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function clearClip(key: string) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function pickMime() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/mp4",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function firstOpen(flags: boolean[]) {
  const idx = flags.findIndex((done) => !done);
  return idx < 0 ? flags.length : idx;
}

export function InterviewSession({
  token,
  jobTitle,
  candidateName,
  readonly,
  questions,
}: {
  token: string;
  jobTitle: string;
  candidateName: string;
  readonly: boolean;
  questions: Question[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const ignoreStopRef = useRef(false);
  const startedAtRef = useRef(0);
  const durationRef = useRef(RECORD_SECONDS);
  const previewUrlRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("preflight");
  const peakRef = useRef(0);

  const initialFlags = useMemo(() => questions.map((q) => q.uploaded), [questions]);
  const [doneUploads, setDoneUploads] = useState(initialFlags);
  const [ready, setReady] = useState(false);
  const [level, setLevel] = useState(0);
  const [index, setIndex] = useState(() => firstOpen(initialFlags));
  const [phase, setPhase] = useState<Phase>(readonly ? "done" : "preflight");
  const [remaining, setRemaining] = useState(THINK_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [takeSeconds, setTakeSeconds] = useState(0);
  const [takePeak, setTakePeak] = useState(0);
  const [submitted, setSubmitted] = useState(readonly);

  phaseRef.current = phase;

  const question = questions[index];
  const clipKey = `${token}:${question?.id ?? ""}`;
  const finished = questions.length > 0 && doneUploads.every(Boolean);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (previewUrl && (phase === "review" || phase === "upload")) {
      el.srcObject = null;
      el.src = previewUrl;
      el.muted = false;
      el.controls = true;
      el.play().catch(() => undefined);
      return;
    }
    el.controls = false;
    el.removeAttribute("src");
    el.srcObject = streamRef.current;
    el.muted = true;
  }, [phase, previewUrl]);

  async function enableMedia() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: {
        width: { ideal: VIDEO_WIDTH },
        height: { ideal: VIDEO_HEIGHT },
        frameRate: { ideal: VIDEO_FPS },
      },
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);
      const norm = Math.min(1, rms / 20);
      setLevel(norm);
      if (phaseRef.current === "record" && norm > peakRef.current) peakRef.current = norm;
      requestAnimationFrame(tick);
    };
    tick();
    setReady(true);
  }

  function begin() {
    if (finished) {
      setPhase("done");
      return;
    }
    const next = firstOpen(doneUploads);
    setIndex(next);
    setRemaining(THINK_SECONDS);
    setPhase("think");
  }

  useEffect(() => {
    if (phase !== "think" && phase !== "record") return;
    const cap = phase === "think" ? THINK_SECONDS : RECORD_SECONDS;
    const started = Date.now();
    setRemaining(cap);
    const id = window.setInterval(() => {
      const left = cap - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) {
        window.clearInterval(id);
        if (phase === "think") {
          setRemaining(RECORD_SECONDS);
          setPhase("record");
        } else {
          setRemaining(0);
          recorderRef.current?.stop();
        }
        return;
      }
      setRemaining(left);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, index]);

  useEffect(() => {
    if (phase !== "record" || !streamRef.current) return;
    ignoreStopRef.current = false;
    const mime = pickMime();
    const recorder = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;
    const chunks: BlobPart[] = [];
    startedAtRef.current = Date.now();
    peakRef.current = 0;
    setTakePeak(0);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      if (ignoreStopRef.current) return;
      const elapsed = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
      durationRef.current = elapsed;
      setTakeSeconds(elapsed);
      setTakePeak(peakRef.current);
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      await saveClip(clipKey, blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPhase("review");
    };
    recorder.start(250);
    return () => {
      ignoreStopRef.current = true;
      if (recorder.state === "recording") recorder.stop();
      if (recorderRef.current === recorder) recorderRef.current = null;
    };
  }, [phase, clipKey]);

  function retake() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setRemaining(RECORD_SECONDS);
    setPhase("record");
  }

  async function submitInterview() {
    const res = await fetch(`/api/i/${token}/submit`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      setPhase("done");
      return;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setSubmitted(true);
  }

  async function push(blob?: Blob) {
    setError(null);
    setPhase("upload");
    const clip = blob ?? (await loadClip(clipKey));
    if (!clip || !question) {
      setError("Nothing to upload for this question.");
      setPhase("review");
      return;
    }
    if (clip.size > STORAGE_FILE_LIMIT_BYTES) {
      setError(
        `That take is ${(clip.size / 1024 / 1024).toFixed(1)} MB. Max is 50 MB at 640×360.`,
      );
      setPhase("review");
      return;
    }
    let lastError = "Upload failed";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        setProgress(0);
        const minted = await fetch(`/api/i/${token}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            mimeType: clip.type,
          }),
        });
        const payload = await minted.json();
        if (!minted.ok) throw new Error(payload.error);
        const file = videoFile(clip, `${question.id}.webm`);
        await uploadInterviewClip({
          signedUrl: payload.signedUrl,
          token: payload.token,
          path: payload.path,
          supabaseUrl: payload.supabaseUrl,
          apikey: payload.apikey,
          file,
          onProgress: setProgress,
        });
        const commit = await fetch(`/api/i/${token}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            path: payload.path,
            mimeType: file.type,
            bytes: file.size,
            durationSeconds: durationRef.current,
          }),
        });
        const committed = await commit.json();
        if (!commit.ok) throw new Error(committed.error);
        await clearClip(clipKey);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
        setPreviewUrl(null);
        const nextFlags = doneUploads.map((flag, i) => (i === index ? true : flag));
        setDoneUploads(nextFlags);
        const next = firstOpen(nextFlags);
        setProgress(0);
        if (next >= questions.length) {
          setPhase("done");
          await submitInterview();
          return;
        }
        setIndex(next);
        setRemaining(THINK_SECONDS);
        setPhase("think");
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Upload failed";
        setError(lastError);
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      }
    }
    setError(lastError);
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">HireFlow</p>
        <h1 className="display mt-4 text-5xl">Submitted</h1>
        <p className="mt-4 text-muted">You can close this tab. This link will not let you record again.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-accent">HireFlow</p>
      <h1 className="display mt-3 text-4xl">{jobTitle}</h1>
      <p className="mt-2 text-muted">
        Hi {candidateName}. {questions.length} questions · about {Math.round((THINK_SECONDS + RECORD_SECONDS) / 60)} min
        each. Stay on this page until every answer is uploaded.
      </p>
      <ol className="mt-4 flex flex-wrap gap-2 text-xs">
        {questions.map((q, i) => (
          <li
            key={q.id}
            className={`rounded-full px-2 py-1 ${
              doneUploads[i] ? "bg-ok text-white" : i === index ? "bg-accent text-white" : "bg-paper-2 text-muted"
            }`}
          >
            {i + 1}
          </li>
        ))}
      </ol>
      <video
        ref={videoRef}
        muted={phase !== "review"}
        autoPlay
        playsInline
        className="mt-8 aspect-video w-full rounded-2xl bg-ink"
      />
      {phase === "preflight" && (
        <section className="mt-6 rounded-2xl border border-line bg-white p-5">
          <h2 className="display text-2xl">Camera and microphone</h2>
          <p className="mt-2 text-sm text-muted">
            We&apos;ll record 640×360 (max 50 MB). Speak so the meter moves before you begin.
            {doneUploads.some(Boolean) ? " Already uploaded answers will be skipped." : ""}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-2">
            <div className="h-full bg-ok" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => enableMedia().catch((e) => setError(String(e)))}
              className="rounded-full border border-line px-4 py-2 text-sm"
            >
              Allow camera
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={begin}
              className="rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {finished ? "Submit uploaded answers" : "Begin interview"}
            </button>
          </div>
        </section>
      )}
      {phase !== "preflight" && question && (
        <section className="mt-6 rounded-2xl border border-line bg-white p-5">
          <p className="text-xs uppercase text-muted">
            Question {index + 1} of {questions.length}
          </p>
          <h2 className="mt-2 text-2xl">{question.text}</h2>
          {phase === "think" && (
            <p className="mt-4 text-sm">
              Think for {remaining}s.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setRemaining(RECORD_SECONDS);
                  setPhase("record");
                }}
              >
                Skip
              </button>
            </p>
          )}
          {phase === "record" && (
            <div className="mt-4 space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full bg-ok" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <p>Recording · {remaining}s left</p>
                <button
                  type="button"
                  disabled={RECORD_SECONDS - remaining < MIN_RECORD_SECONDS}
                  className="rounded-full bg-ink px-4 py-1.5 text-white disabled:opacity-40"
                  onClick={() => recorderRef.current?.stop()}
                >
                  I&apos;m done — stop
                </button>
                {RECORD_SECONDS - remaining < MIN_RECORD_SECONDS && (
                  <span className="text-muted">Keep going ({MIN_RECORD_SECONDS}s min)</span>
                )}
              </div>
            </div>
          )}
          {phase === "review" && (
            <div className="mt-4 space-y-3">
              {takeSeconds < MIN_RECORD_SECONDS && (
                <p className="text-sm text-danger">
                  That take was {takeSeconds}s. Record at least {MIN_RECORD_SECONDS}s or scoring will skip it.
                </p>
              )}
              {takePeak < MIN_AUDIO_LEVEL && (
                <p className="text-sm text-danger">
                  Almost no microphone signal. Speak closer to the mic, then retake.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button type="button" className="rounded-full border border-line px-4 py-2 text-sm" onClick={retake}>
                  Retake
                </button>
                <button
                  type="button"
                  disabled={takeSeconds < MIN_RECORD_SECONDS || takePeak < MIN_AUDIO_LEVEL}
                  className="rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-40"
                  onClick={() => push()}
                >
                  Use this take
                </button>
              </div>
            </div>
          )}
          {phase === "upload" && (
            <div className="mt-4">
              <p className="text-sm">Uploading… {Math.round(progress * 100)}%</p>
              <div className="mt-2 h-2 rounded-full bg-paper-2">
                <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              {error && (
                <button type="button" className="mt-3 text-sm underline" onClick={() => push()}>
                  Retry upload
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {phase === "done" && !submitted && (
        <div className="mt-6">
          <button
            type="button"
            onClick={submitInterview}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white"
          >
            Submit interview
          </button>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </main>
  );
}
