-- People publish their own social links on their GitHub profile, so LinkedIn
-- arrives as self-declared data rather than anything scraped. LinkedIn gets its
-- own column because it is the link recruiters open and the key we dedupe
-- pasted profiles against.

alter table public.sourced_people
  add column if not exists socials jsonb not null default '[]'::jsonb,
  add column if not exists linkedin_url text;

alter table public.candidates
  add column if not exists linkedin_url text;

create index if not exists sourced_people_linkedin_idx
  on public.sourced_people (job_id, linkedin_url)
  where linkedin_url is not null;

create index if not exists candidates_linkedin_idx
  on public.candidates (job_id, linkedin_url)
  where linkedin_url is not null;
