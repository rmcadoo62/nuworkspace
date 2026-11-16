-- 2026-11-16 — EMI Layout Audit (NUForce tab)
-- Private bucket for Jordan's EMI layout HTML, readable only by signed-in
-- employees whose role has the view_emi_audit capability ticked in
-- Setup > Permissions. No insert/update/delete policies: only the dashboard
-- (service role) can upload or replace the file.
--
-- Run in the Supabase SQL Editor BEFORE pushing the JS, then upload the file:
--   Storage > nuforce-tools > Upload  →  name it exactly  emi-layout-audit.html

insert into storage.buckets (id, name, public)
values ('nuforce-tools', 'nuforce-tools', false)
on conflict (id) do nothing;

drop policy if exists "nuforce_tools_emi_audit_read" on storage.objects;
create policy "nuforce_tools_emi_audit_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nuforce-tools'
  and name = 'emi-layout-audit.html'
  and exists (
    select 1
    from public.employees e
    join public.permission_roles r on r.id = e.role_id
    where lower(e.email) = lower((select auth.jwt() ->> 'email'))
      and coalesce(e.is_active, true)
      and (r.capabilities ->> 'view_emi_audit') = 'true'
  )
);
