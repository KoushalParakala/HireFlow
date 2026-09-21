# HireFlow

Recruiter tool for one role: **job → people → interview paper → invite → record → scorecard → compare**. Candidates never log in. They open a private link and answer in the browser.

## Deploy (Vercel)

Production is this Next.js app on Vercel, talking to the existing Supabase project. After GitHub `main` is imported, every push deploys.

1. Open [vercel.com/new](https://vercel.com/new) and import **KoushalParakala/HireFlow** (Framework Preset: Next.js, Root Directory: `.`).
2. Set **Environment Variables** for Production. Copy names from `.env.example`. These must be set:

   | Name | Notes |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret / service role. Never `NEXT_PUBLIC_` |
   | `NEXT_PUBLIC_APP_URL` | The `https://….vercel.app` URL (or custom domain) |
   | `WORKER_SECRET` | Random string (`openssl rand -hex 32`) |
   | `PROVIDER_MODE` | `real` |
   | `GROQ_API_KEY` | Scoring + transcription |
   | `GITHUB_TOKEN` | GitHub sourcing |
   | `APIFY_TOKEN` | LinkedIn sourcing |
   | `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Invite email (copy-link still works without these) |

3. Deploy. After the first URL exists, set `NEXT_PUBLIC_APP_URL` to that URL and redeploy.
4. In the Supabase SQL editor, point `pg_cron` at the live worker (once a minute). This is the scoring queue:

```sql
select vault.create_secret('https://YOUR-APP.vercel.app/api/worker/tick', 'worker_url');
select vault.create_secret('YOUR_WORKER_SECRET', 'worker_secret');
```

Vercel Hobby only allows a daily cron. `vercel.json` hits `/api/cron/keepalive` at 08:00 UTC so the free project does not sleep. Interview scoring still runs from Supabase `pg_cron` plus in-request worker kicks.

## Free stack

- Vercel Hobby (Next.js)
- Supabase Free (Postgres, Auth, Storage, `pg_cron` + `pg_net`)
- Groq free (LLM + Whisper) when `PROVIDER_MODE=real`
- Gmail SMTP with an app password
- GitHub sourcing when `GITHUB_TOKEN` is set
- Apify (LinkedIn people search) when `APIFY_TOKEN` is set

`PROVIDER_MODE=fake` runs the whole loop with no Groq or Gmail calls.

## Local setup

1. Copy `.env.example` → `.env.local`
2. Paste **rotated** keys from Supabase → Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` (server only)
3. Sign in as the Auth user you created (this project already has `koushal.sub@gmail.com` if you used that)
4. For LinkedIn sourcing, paste `APIFY_TOKEN` from [Apify Integrations](https://console.apify.com/settings/integrations). GitHub sourcing uses `GITHUB_TOKEN`.
5. Run:

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000

Schema is already applied to the Hireflow Supabase project. Migrations live in `supabase/migrations/`.

## Smoke (needs the service role key)

```bash
pnpm smoke
```

Creates a throwaway job, queues two answers, runs the worker in fake mode, asserts a scorecard, then deletes the job.

## Product loop

1. Create a job from a JD (criteria extracted; fake mode still produces a usable structure)
2. Confirm the interview paper (invites blocked until then)
3. Source people from LinkedIn, or add a referral / CSV
4. Invite → copy the link even if email is not configured
5. Candidate records in `/i/[token]` (camera check, think, record, upload with IndexedDB retry)
6. Submit queues answers; worker transcribes + scores; profile shows a retry on failures
7. Compare 2–4 people

LinkedIn sourcing discovers public `/in/` URLs with Google, then loads each profile through Apify actor [`apimaestro/linkedin-profile-detail`](https://apify.com/apimaestro/linkedin-profile-detail) (~$0.005 per profile). GitHub project search is still available on the Source page. Paste-a-profile and CSV still work as backups.
