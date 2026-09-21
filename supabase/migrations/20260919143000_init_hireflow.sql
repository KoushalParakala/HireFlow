-- HireFlow v2 schema: durable queue, RLS, candidate-safe views.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to postgres;
grant usage on schema private to service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  criteria jsonb not null default '{}'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  interview_state text not null default 'draft'
    check (interview_state in ('draft', 'confirmed')),
  email_template jsonb not null default jsonb_build_object(
    'subject', 'Video interview for {{role}}',
    'body', E'Hi {{name}},\n\nPlease record your interview for {{role}}:\n{{link}}\n\nYou can open this on any laptop with a camera. Thank you.'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  idx int not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  text text not null,
  key_points jsonb not null default '[]'::jsonb,
  unique (job_id, idx)
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  name text not null,
  email text,
  title text,
  company text,
  location text,
  source text not null default 'referral'
    check (source in ('referral', 'csv', 'paste', 'linkedin')),
  skills jsonb not null default '[]'::jsonb,
  experience_summary text,
  profile_url text,
  rule_score numeric,
  fit_score numeric,
  match_summary text,
  red_flags jsonb not null default '[]'::jsonb,
  score_state text not null default 'none'
    check (score_state in ('none', 'rules_only', 'complete', 'error')),
  stage text not null default 'added'
    check (stage in ('added', 'scored', 'shortlisted', 'invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  question_order uuid[] not null default '{}',
  state text not null default 'pending'
    check (state in ('pending', 'in_progress', 'submitted', 'scoring', 'complete', 'failed')),
  email_state text not null default 'not_sent'
    check (email_state in ('not_sent', 'queued', 'sent', 'failed')),
  email_error text,
  pending_email_token text,
  overall jsonb,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews (id) on delete cascade,
  question_id uuid not null references public.job_questions (id) on delete restrict,
  idx int not null,
  storage_path text,
  mime_type text,
  bytes bigint,
  duration_seconds numeric,
  transcript text,
  scores jsonb,
  summary text,
  communication_notes text,
  state text not null default 'pending'
    check (state in ('pending', 'uploaded', 'queued', 'processing', 'complete', 'failed')),
  attempts int not null default 0,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (interview_id, question_id)
);

create table public.provider_calls (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  model text,
  duration_ms int,
  ok boolean not null,
  error text,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table public.worker_runs (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  claimed int not null default 0,
  completed int not null default 0,
  failed int not null default 0,
  emails_sent int not null default 0,
  duration_ms int,
  notes text,
  created_at timestamptz not null default now()
);

create index jobs_owner_idx on public.jobs (owner_id, created_at desc);
create index candidates_job_idx on public.candidates (job_id, created_at desc);
create unique index candidates_job_email_idx
  on public.candidates (job_id, lower(email))
  where email is not null;
create index interviews_candidate_idx on public.interviews (candidate_id, created_at desc);
create index interviews_job_idx on public.interviews (job_id);
create index interview_answers_interview_idx on public.interview_answers (interview_id, idx);
create index interview_answers_queue_idx
  on public.interview_answers (uploaded_at nulls last, created_at)
  where state in ('queued', 'processing', 'failed');
create index interviews_email_queue_idx
  on public.interviews (created_at)
  where email_state in ('queued', 'failed');

-- ---------------------------------------------------------------------------
-- Auth profile sync
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function private.touch_updated_at();

create trigger candidates_updated_at
  before update on public.candidates
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Queue claim (service role only)
-- ---------------------------------------------------------------------------

create or replace function private.claim_answer_jobs(p_limit int, p_worker text)
returns setof public.interview_answers
language sql
security definer
set search_path = public
as $$
  update public.interview_answers a
     set state = 'processing',
         locked_at = now(),
         locked_by = p_worker,
         attempts = attempts + 1
   where a.id in (
     select id from public.interview_answers
      where state = 'queued'
         or (state = 'processing' and locked_at < now() - interval '5 minutes')
         or (state = 'failed' and attempts < 4
             and locked_at < now() - (interval '1 minute' * power(2, greatest(attempts, 1))))
      order by uploaded_at nulls last, created_at
      limit p_limit
      for update skip locked
   )
  returning a.*;
$$;

create or replace function private.claim_invite_jobs(p_limit int)
returns setof public.interviews
language sql
security definer
set search_path = public
as $$
  select *
  from public.interviews
  where email_state = 'queued'
  order by created_at
  limit p_limit
  for update skip locked;
$$;

create or replace function private.queue_depth()
returns table (answers bigint, invites bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.interview_answers
      where state in ('queued', 'processing', 'failed') and attempts < 4) as answers,
    (select count(*) from public.interviews where email_state = 'queued') as invites;
$$;

create or replace function private.reset_answer_job(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.interview_answers
     set state = 'queued',
         last_error = null,
         locked_at = null,
         locked_by = null,
         attempts = 0
   where id = p_id
     and state in ('failed', 'processing', 'complete');
$$;

create or replace function private.invoke_worker()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  req_id bigint;
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url
    from vault.decrypted_secrets where name = 'worker_url' limit 1;
  select decrypted_secret into worker_secret
    from vault.decrypted_secrets where name = 'worker_secret' limit 1;
  if worker_url is null or worker_secret is null then
    return null;
  end if;
  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  ) into req_id;
  return req_id;
end;
$$;

revoke all on function private.claim_answer_jobs(int, text) from public;
revoke all on function private.claim_invite_jobs(int) from public;
revoke all on function private.queue_depth() from public;
revoke all on function private.reset_answer_job(uuid) from public;
revoke all on function private.invoke_worker() from public;
grant execute on function private.claim_answer_jobs(int, text) to service_role;
grant execute on function private.claim_invite_jobs(int) to service_role;
grant execute on function private.queue_depth() to service_role;
grant execute on function private.reset_answer_job(uuid) to service_role;
grant execute on function private.invoke_worker() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'hireflow-worker') then
    perform cron.schedule('hireflow-worker', '* * * * *', $cron$select private.invoke_worker();$cron$);
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Views (RLS of underlying tables applies)
-- ---------------------------------------------------------------------------

create or replace view public.candidate_pipeline
with (security_invoker = true) as
select
  c.id,
  c.job_id,
  c.name,
  c.email,
  c.title,
  c.company,
  c.location,
  c.source,
  c.skills,
  c.experience_summary,
  c.profile_url,
  c.rule_score,
  c.fit_score,
  c.match_summary,
  c.red_flags,
  c.score_state,
  c.stage,
  c.created_at,
  j.owner_id,
  j.title as job_title,
  i.id as latest_interview_id,
  i.state as latest_interview_state,
  i.email_state,
  i.overall,
  i.submitted_at,
  i.token_prefix,
  case
    when i.state = 'failed' then 'failed'
    when i.state in ('submitted', 'scoring') then 'processing'
    when i.state = 'complete' then 'interviewed'
    when c.stage = 'invited' then 'invited'
    when c.stage = 'shortlisted' then 'shortlisted'
    when c.stage = 'scored' then 'scored'
    else 'added'
  end as display_stage,
  case
    when c.fit_score is not null then round((0.4 * coalesce(c.rule_score, 0) + 0.6 * c.fit_score)::numeric, 1)
    else c.rule_score
  end as match_score
from public.candidates c
join public.jobs j on j.id = c.job_id
left join lateral (
  select *
  from public.interviews iv
  where iv.candidate_id = c.id
  order by iv.created_at desc
  limit 1
) i on true;

create or replace view public.candidate_questions
with (security_invoker = true) as
select id, job_id, idx, difficulty, text
from public.job_questions;

grant select on public.candidate_pipeline to authenticated;
grant select on public.candidate_questions to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_questions enable row level security;
alter table public.candidates enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;
alter table public.provider_calls enable row level security;
alter table public.worker_runs enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy jobs_select on public.jobs
  for select to authenticated using (owner_id = auth.uid());
create policy jobs_insert on public.jobs
  for insert to authenticated with check (owner_id = auth.uid());
create policy jobs_update on public.jobs
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy jobs_delete on public.jobs
  for delete to authenticated using (owner_id = auth.uid());

create policy questions_select on public.job_questions
  for select to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy questions_insert on public.job_questions
  for insert to authenticated with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy questions_update on public.job_questions
  for update to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy questions_delete on public.job_questions
  for delete to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );

create policy candidates_select on public.candidates
  for select to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy candidates_insert on public.candidates
  for insert to authenticated with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy candidates_update on public.candidates
  for update to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy candidates_delete on public.candidates
  for delete to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );

create policy interviews_select on public.interviews
  for select to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy interviews_insert on public.interviews
  for insert to authenticated with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
create policy interviews_update on public.interviews
  for update to authenticated using (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  );

create policy answers_select on public.interview_answers
  for select to authenticated using (
    exists (
      select 1 from public.interviews i
      join public.jobs j on j.id = i.job_id
      where i.id = interview_id and j.owner_id = auth.uid()
    )
  );
create policy answers_insert on public.interview_answers
  for insert to authenticated with check (
    exists (
      select 1 from public.interviews i
      join public.jobs j on j.id = i.job_id
      where i.id = interview_id and j.owner_id = auth.uid()
    )
  );
create policy answers_update on public.interview_answers
  for update to authenticated using (
    exists (
      select 1 from public.interviews i
      join public.jobs j on j.id = i.job_id
      where i.id = interview_id and j.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.interviews i
      join public.jobs j on j.id = i.job_id
      where i.id = interview_id and j.owner_id = auth.uid()
    )
  );

create policy provider_calls_select on public.provider_calls
  for select to authenticated using (true);
create policy worker_runs_select on public.worker_runs
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interviews',
  'interviews',
  false,
  52428800,
  array['video/webm', 'video/mp4', 'video/quicktime', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
