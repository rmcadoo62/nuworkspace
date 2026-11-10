-- 2026-11-10  Employee Company field (NU Labs / Ballantine)
-- Run in the Supabase SQL Editor BEFORE pushing the JS.
--
-- Replaces the old "Department = Ballantine" convention with a real Company
-- column. NOT NULL with a default, so the null-department filter problem
-- (.neq('department','Ballantine') dropping NULL rows) can't happen with it.

-- 1) Safety check: does anything server-side still key off department = Ballantine?
--    If this returns rows, stop and send them to Claude before going on.
select n.nspname as schema, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog','information_schema')
  and p.prosrc ilike '%ballantine%';

-- 2) Add the column
alter table public.employees
  add column if not exists company text not null default 'nulabs';

alter table public.employees
  drop constraint if exists employees_company_check;
alter table public.employees
  add constraint employees_company_check check (company in ('nulabs','ballantine'));

-- 3) Backfill from the old Department convention
update public.employees
   set company = 'ballantine'
 where lower(trim(coalesce(department,''))) = 'ballantine';

-- 4) Verify: Keith Monteleone should show nulabs here until you set him in the app
select company, count(*) from public.employees group by company order by company;
select name, department, company from public.employees where company = 'ballantine' order by name;
