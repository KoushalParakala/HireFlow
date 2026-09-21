-- Browser PUTs to signed upload URLs run as anon. RLS on storage.objects
-- was enabled with no policies, which blocked every insert.
-- Paths are {interview_uuid}/{answer_uuid}-{ts}.webm

grant select, insert, update on storage.objects to anon, authenticated;

drop policy if exists interviews_objects_insert on storage.objects;
drop policy if exists interviews_objects_update on storage.objects;
drop policy if exists interviews_objects_select on storage.objects;

create policy interviews_objects_insert
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'interviews'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

create policy interviews_objects_update
on storage.objects
for update
to anon, authenticated
using (
  bucket_id = 'interviews'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
with check (
  bucket_id = 'interviews'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

create policy interviews_objects_select
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'interviews'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
