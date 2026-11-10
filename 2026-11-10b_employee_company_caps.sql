-- 2026-11-10b  Store Company as display text: 'NU Labs' / 'Ballantine'
-- Run in the Supabase SQL Editor (after 2026-11-10_employee_company.sql, which is already applied).

alter table public.employees drop constraint if exists employees_company_check;

update public.employees set company = 'Ballantine' where company = 'ballantine';
update public.employees set company = 'NU Labs'    where company = 'nulabs';

alter table public.employees alter column company set default 'NU Labs';
alter table public.employees
  add constraint employees_company_check check (company in ('NU Labs','Ballantine'));

select company, count(*) from public.employees group by company order by company;
