-- Project-evidence sourcing. Sourced people are staged outside public.candidates
-- so a bad query never reaches the pipeline; the recruiter promotes survivors.

create table if not exists public.source_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  source text not null default 'github' check (source in ('github')),
  query jsonb not null default '{}'::jsonb,
  state text not null default 'queued'
    check (state in ('queued', 'running', 'complete', 'failed')),
  stats jsonb not null default '{}'::jsonb,
  found int not null default 0,
  kept int not null default 0,
  attempts int not null default 0,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.sourced_people (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  source_run_id uuid references public.source_runs (id) on delete set null,
  source text not null default 'github' check (source in ('github')),
  external_id text not null,
  handle text,
  name text,
  profile_url text,
  avatar_url text,
  location text,
  email text,
  bio text,
  company text,
  blog text,
  followers int,
  public_repos int,
  hireable boolean,
  skills jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  matched jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  evidence_score numeric,
  summary text,
  state text not null default 'new'
    check (state in ('new', 'promoted', 'rejected')),
  candidate_id uuid references public.candidates (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, source, external_id)
);

create index if not exists source_runs_job_idx
  on public.source_runs (job_id, created_at desc);
create index if not exists source_runs_queue_idx
  on public.source_runs (created_at)
  where state in ('queued', 'running', 'failed');
create index if not exists sourced_people_job_idx
  on public.sourced_people (job_id, state, evidence_score desc nulls last);

-- Promoted people need a source value the candidates table accepts.
alter table public.candidates drop constraint if exists candidates_source_check;
alter table public.candidates add constraint candidates_source_check
  check (source in ('referral', 'csv', 'paste', 'linkedin', 'github'));

alter table public.source_runs enable row level security;
alter table public.sourced_people enable row level security;

drop policy if exists source_runs_select on public.source_runs;
drop policy if exists source_runs_insert on public.source_runs;
drop policy if exists source_runs_update on public.source_runs;
drop policy if exists source_runs_delete on public.source_runs;
drop policy if exists sourced_people_select on public.sourced_people;
drop policy if exists sourced_people_update on public.sourced_people;
drop policy if exists sourced_people_delete on public.sourced_people;

create policy source_runs_select on public.source_runs
  for select to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy source_runs_insert on public.source_runs
  for insert to authenticated with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy source_runs_update on public.source_runs
  for update to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy source_runs_delete on public.source_runs
  for delete to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );

create policy sourced_people_select on public.sourced_people
  for select to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy sourced_people_update on public.sourced_people
  for update to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy sourced_people_delete on public.sourced_people
  for delete to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
