-- Match on the pipeline is rule_score/fit_score. Completed interviews already
-- store an overall 0–5 average, but that never flowed into match_score, so
-- the Match column stayed blank after a scored interview.

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
    when i.state = 'complete' and (i.overall->>'average') is not null then
      round(
        (
          case
            when c.rule_score is not null then
              0.4 * c.rule_score
              + 0.6 * ((i.overall->>'average')::numeric / 5) * 100
            else
              ((i.overall->>'average')::numeric / 5) * 100
          end
        )::numeric,
        1
      )
    when c.fit_score is not null then
      round(
        (
          case
            when c.rule_score is not null then 0.4 * c.rule_score + 0.6 * c.fit_score
            else c.fit_score
          end
        )::numeric,
        1
      )
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

grant select on public.candidate_pipeline to authenticated;

update public.candidates c
set
  fit_score = round((i.avg_score / 5) * 100, 1),
  score_state = 'complete',
  match_summary = concat(
    'Interview ',
    trim(to_char(i.avg_score, 'FM990.0')),
    '/5 across ',
    i.answered,
    ' scored answers.'
  )
from (
  select distinct on (candidate_id)
    candidate_id,
    (overall->>'average')::numeric as avg_score,
    coalesce(nullif(overall->>'answered', '')::int, 0) as answered
  from public.interviews
  where state = 'complete'
    and overall ? 'average'
  order by candidate_id, created_at desc
) i
where i.candidate_id = c.id
  and c.score_state = 'none';
