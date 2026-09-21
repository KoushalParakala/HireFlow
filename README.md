# HireFlow

Recruiter tool for one role: **job → people → interview paper → invite → record → scorecard → compare**. Candidates never log in. They open a private link and answer in the browser.

This is the v2 rewrite (Next.js + Supabase). The old Python app in `HireFlow-main` is reference only.

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
cd hireflow
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

## After deploy

1. Set the same env vars on Vercel, including `APIFY_TOKEN`, with `NEXT_PUBLIC_APP_URL` = your `*.vercel.app` URL
2. `WORKER_SECRET` must match
3. In the Supabase SQL editor, store vault secrets so `pg_cron` can hit the worker every minute:

```sql
select vault.create_secret('https://YOUR-APP.vercel.app/api/worker/tick', 'worker_url');
select vault.create_secret('YOUR_WORKER_SECRET', 'worker_secret');
```

The daily Vercel cron at `/api/cron/keepalive` stops the free project from pausing after 7 idle days (which would also stop `pg_cron`).

## Product loop

1. Create a job from a JD (criteria extracted; fake mode still produces a usable structure)
2. Confirm the interview paper (invites blocked until then)
3. Source people from LinkedIn, or add a referral / CSV
4. Invite → copy the link even if email is not configured
5. Candidate records in `/i/[token]` (camera check, think, record, upload with IndexedDB retry)
6. Submit queues answers; worker transcribes + scores; profile shows a retry on failures
7. Compare 2–4 people

LinkedIn sourcing discovers public `/in/` URLs with Google, then loads each profile through Apify actor [`apimaestro/linkedin-profile-detail`](https://apify.com/apimaestro/linkedin-profile-detail) (~$0.005 per profile). GitHub project search is still available on the Source page. Paste-a-profile and CSV still work as backups.
