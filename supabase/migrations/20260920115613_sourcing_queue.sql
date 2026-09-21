-- Sourcing rides the same claim-and-retry queue as interview answers.

create or replace function private.claim_source_runs(p_limit int, p_worker text)
returns setof public.source_runs
language sql
security definer
set search_path = public
as $$
  update public.source_runs r
     set state = 'running',
         locked_at = now(),
         locked_by = p_worker,
         attempts = attempts + 1
   where r.id in (
     select id from public.source_runs
      where state = 'queued'
         or (state = 'running' and locked_at < now() - interval '10 minutes')
         or (state = 'failed' and attempts < 3
             and locked_at < now() - (interval '2 minutes' * power(2, greatest(attempts, 1))))
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning r.*;
$$;

create or replace function public.claim_source_runs(p_limit int, p_worker text)
returns setof public.source_runs
language sql
security definer
set search_path = public, private
as $$
  select * from private.claim_source_runs(p_limit, p_worker);
$$;

-- queue_depth gains a third column, so the old signature has to go first.
drop function if exists public.queue_depth();
drop function if exists private.queue_depth();

create or replace function private.queue_depth()
returns table (answers bigint, invites bigint, sources bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.interview_answers
      where state in ('queued', 'processing', 'failed') and attempts < 4) as answers,
    (select count(*) from public.interviews where email_state = 'queued') as invites,
    (select count(*) from public.source_runs
      where state = 'queued'
         or (state = 'running' and locked_at < now() - interval '10 minutes')
         or (state = 'failed' and attempts < 3)) as sources;
$$;

create or replace function public.queue_depth()
returns table (answers bigint, invites bigint, sources bigint)
language sql
stable
security definer
set search_path = public, private
as $$
  select * from private.queue_depth();
$$;

revoke all on function private.claim_source_runs(int, text) from public;
revoke all on function private.queue_depth() from public;
revoke all on function public.claim_source_runs(int, text) from public, anon, authenticated;
revoke all on function public.queue_depth() from public, anon, authenticated;
grant execute on function private.claim_source_runs(int, text) to service_role;
grant execute on function private.queue_depth() to service_role;
grant execute on function public.claim_source_runs(int, text) to service_role;
grant execute on function public.queue_depth() to service_role;
