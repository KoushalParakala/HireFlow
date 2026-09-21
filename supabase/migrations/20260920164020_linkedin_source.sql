-- LinkedIn sourcing via Apify. GitHub rows already stored stay valid.

alter table public.source_runs drop constraint if exists source_runs_source_check;
alter table public.source_runs add constraint source_runs_source_check
  check (source in ('github', 'linkedin'));
alter table public.source_runs alter column source set default 'linkedin';

alter table public.sourced_people drop constraint if exists sourced_people_source_check;
alter table public.sourced_people add constraint sourced_people_source_check
  check (source in ('github', 'linkedin'));
alter table public.sourced_people alter column source set default 'linkedin';
