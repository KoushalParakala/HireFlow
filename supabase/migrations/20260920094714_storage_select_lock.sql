-- Signed uploads still need INSERT + UPDATE (TUS / upsert).
-- SELECT let anyone holding the publishable key list every interview object.
drop policy if exists interviews_objects_select on storage.objects;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
