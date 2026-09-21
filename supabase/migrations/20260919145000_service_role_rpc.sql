create or replace function public.claim_answer_jobs(p_limit int, p_worker text)
returns setof public.interview_answers
language sql
security definer
set search_path = public, private
as $$
  select * from private.claim_answer_jobs(p_limit, p_worker);
$$;

create or replace function public.claim_invite_jobs(p_limit int)
returns setof public.interviews
language sql
security definer
set search_path = public, private
as $$
  select * from private.claim_invite_jobs(p_limit);
$$;

create or replace function public.queue_depth()
returns table (answers bigint, invites bigint)
language sql
stable
security definer
set search_path = public, private
as $$
  select * from private.queue_depth();
$$;

create or replace function public.reset_answer_job(p_id uuid)
returns void
language sql
security definer
set search_path = public, private
as $$
  select private.reset_answer_job(p_id);
$$;

revoke all on function public.claim_answer_jobs(int, text) from public, anon, authenticated;
revoke all on function public.claim_invite_jobs(int) from public, anon, authenticated;
revoke all on function public.queue_depth() from public, anon, authenticated;
revoke all on function public.reset_answer_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_answer_jobs(int, text) to service_role;
grant execute on function public.claim_invite_jobs(int) to service_role;
grant execute on function public.queue_depth() to service_role;
grant execute on function public.reset_answer_job(uuid) to service_role;

alter table public.interviews add column if not exists pending_email_token text;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
