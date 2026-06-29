# HireFlow

AI-Powered Talent Screening and Interview Intelligence Platform.

## Patch Notes (latest pass)

- **Fixed the broken chunked video upload.** The mobile app was slicing the
  base64-encoded video string at a chunk size that wasn't a multiple of 4
  characters. Base64 decodes 4 characters → 3 bytes; a chunk boundary that
  isn't 4-aligned produces an invalid/unpaddable string, so the backend's
  `base64.b64decode()` threw on almost every chunk after the first. This is
  why uploads silently failed. Fixed in `mobile/App.js` (`uploadVideo`) and
  hardened in `backend/api/interviews.py` so a bad chunk now returns a clear
  `400` instead of a bare `500`.
- **Added real resume-on-failure.** `GET /api/interviews/{token}/upload-status`
  reports how many bytes of a question's video the server already has, so
  the app resumes from the correct chunk instead of restarting a question's
  upload from byte 0 after a dropped connection or app restart.
- **Faster candidate scoring.** `score_candidates_batch()` in
  `services/scorer.py` embeds the JD once and all candidates in a single
  batched call (previously re-embedded the JD for every candidate), and
  runs the Groq qualitative calls concurrently (4 at a time) instead of one
  after another. `api/jobs.py` now calls this instead of looping.
- **Manual "Add Candidate" flow.** `POST /api/candidates/manual` + a modal
  on the pipeline page, for referrals/direct applicants who didn't come
  from the scraper. They're added straight to the shortlist.
- **Resend HTTP API support for invite emails**, tried before SMTP — one
  POST, no SMTP port/handshake concerns on Railway. Falls back to SMTP
  (Resend's relay or any STARTTLS provider), then to logging the link if
  neither is configured. Set `RESEND_API_KEY` to use it.
- Swapped the one stock Unsplash photo on the dashboard for an inline SVG
  so the UI has no external stock-photo dependency.

## Architecture Overview

HireFlow is an end-to-end talent screening platform composed of three main layers:

1. **Backend (FastAPI, Python)**: Handles database operations (PostgreSQL), candidate scraping, semantic scoring, background interview processing (chunk merging, Whisper transcription), and scorecard generation using `sentence-transformers` and Groq (Llama 3.1).
2. **Frontend (React, Vite)**: A web dashboard for recruiters to post jobs, view scraped candidate pipelines, auto-shortlist, compare candidates, and read detailed video interview scorecards.
3. **Mobile App (Expo / React Native)**: An Android app for shortlisted candidates to complete asynchronous video interviews. Features chunked uploads with resume-on-failure capabilities.

## Scraping Sources & Rate Limiting Strategy

We use two primary sources for candidate scraping, managed concurrently with exponential backoff:
1. **LinkedIn (Primary)**: Uses the Apify `curious_coder/linkedin-profile-scraper` actor. We fetch 2 pages to get up to 20 profiles.
2. **GitHub (Secondary)**: Uses the GitHub REST API (`/search/users`). We extract candidate skills by analyzing the languages of their most recently pushed repositories.

**Rate Limiting**: Both scrapers implement an exponential backoff strategy (`wait = (2 ** attempt) + 1.0`) on `429` (Rate Limit) or `503` (Service Unavailable) responses. The results are unified and deduplicated locally to provide a clean candidate list.

## Semantic Scoring Approach

Candidates are scored using a two-step semantic approach to meet the assignment criteria of avoiding simple keyword matching:
1. **Vector Embeddings (Quantitative)**: We use the `all-MiniLM-L6-v2` `sentence-transformers` model (running locally/CPU-bound) to encode job criteria (technical skills, seniority, domain) and candidate profiles into vectors. We then compute pure cosine similarity.
2. **Groq Llama 3.1 (Qualitative)**: We pass the vector scores and profile data to Groq to generate a plain-English recommendation and extract red flags (e.g., job hopping, title inflation) without relying on the LLM to invent the quantitative scores.

## Chunked Upload Implementation

To gracefully handle poor connectivity on the mobile app, the video is chunked locally into 1MB pieces before uploading:
- The React Native `FileSystem` API reads the local video in 1MB chunks using base64 encoding.
- The chunks are sent sequentially via `POST /api/interviews/{token}/upload-chunk`.
- The backend appends each chunk (using `"wb"` for the first chunk and `"ab"` for subsequent chunks) to a temporary file in the persistent `/data/uploads` volume.
- If a chunk upload fails, the app retries it up to 3 times before pausing, ensuring resume-on-failure without losing the entire video.

## Whisper Benchmarks on Railway CPU

We run transcription CPU-bound on the free Railway tier using `faster-whisper`.
- **Model**: `tiny` (int8 compute type)
- **Environment**: Railway Basic CPU (1 vCPU, 2GB RAM)
- **Benchmark Command**:
  ```bash
  time python -c "from faster_whisper import WhisperModel; m=WhisperModel('tiny',device='cpu',compute_type='int8'); list(m.transcribe('3min_sample.mp3', beam_size=5)[0])"
  ```
- **Result**: Transcribing a 3-minute audio clip takes approximately **~45 seconds**. This falls well within the "doesn't feel broken" requirement (< 10 minutes).

## Deployment Instructions

1. **Database**: Set up a PostgreSQL database on Railway.
2. **Backend**:
   - Add your API keys (`GROQ_API_KEY`, `APIFY_TOKEN`, `GITHUB_TOKEN`, `SMTP_*`) to the Railway environment variables.
   - Set `DATABASE_URL` to the Railway PostgreSQL URL.
   - Create a Volume in Railway and mount it to `/data` so that `/data/uploads` persists between redeploys.
3. **Frontend**:
   - Set `VITE_API_URL` to your backend's Railway URL.
   - Build using `npm run build` and deploy the `dist` folder to Vercel, Railway, or similar.
4. **Mobile**:
   - Set `EXPO_PUBLIC_API_URL` to the backend URL in a `.env` file.
   - Build the APK using `eas build --platform android --profile preview`.

## Android APK

[Download the APK here] <Replace with EAS build link>
