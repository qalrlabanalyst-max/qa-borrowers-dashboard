-- Additive schema: does not drop existing tables or records.
create extension if not exists pgcrypto;
create table if not exists public.qa_employees (id uuid primary key default gen_random_uuid(), employee_code text unique not null, full_name text not null, department text, role text not null default 'employee' check(role in ('admin','employee')), pin_hash text not null, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.qa_borrowings (id uuid primary key default gen_random_uuid(), material_name text not null, condition_out text not null, borrower_name text not null, borrower_department text not null, purpose text not null, borrowed_at timestamptz not null default now(), returned_at timestamptz, released_by_name text not null, released_by_employee_id uuid references public.qa_employees(id), returned_by_employee_id uuid references public.qa_employees(id), remarks text, created_at timestamptz not null default now());
create table if not exists public.qa_login_attempts (id bigint generated always as identity primary key, employee_code text not null, ip_hash text not null, success boolean not null default false, created_at timestamptz not null default now());
create index if not exists qa_borrowings_borrowed_at_idx on public.qa_borrowings(borrowed_at desc);
create index if not exists qa_login_attempts_lookup_idx on public.qa_login_attempts(employee_code,ip_hash,created_at desc);
alter table public.qa_employees enable row level security;
alter table public.qa_borrowings enable row level security;
alter table public.qa_login_attempts enable row level security;
-- No anon/authenticated policies: only the Edge Function service-role client accesses these tables.
-- First admin provisioning: run once in Supabase SQL Editor, replacing values:
-- insert into public.qa_employees(employee_code,full_name,department,role,pin_hash)
-- values('QAADMIN','QA Administrator','QA','admin',crypt('1234',gen_salt('bf',12)));
-- IMPORTANT: Replace 1234 with a unique initial PIN before running; change it after setup.
-- Security-definer functions are callable only by service_role.
create or replace function public.qa_check_pin(p_code text,p_pin text)
returns table(id uuid,employee_code text,full_name text,department text,role text,active boolean)
language sql security definer set search_path = public as $$
 select e.id,e.employee_code,e.full_name,e.department,e.role,e.active from public.qa_employees e
 where e.employee_code=p_code and e.active and e.pin_hash=crypt(p_pin,e.pin_hash);
$$;
create or replace function public.qa_create_employee(p_code text,p_name text,p_department text,p_role text,p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
 if p_code='' or p_name='' or p_role not in ('admin','employee') or p_pin !~ '^[0-9]{4}$' then raise exception 'Invalid employee'; end if;
 insert into public.qa_employees(employee_code,full_name,department,role,pin_hash)
 values(p_code,p_name,p_department,p_role,crypt(p_pin,gen_salt('bf',12)));
end; $$;
revoke all on function public.qa_check_pin(text,text) from public,anon,authenticated;
revoke all on function public.qa_create_employee(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.qa_check_pin(text,text) to service_role;
grant execute on function public.qa_create_employee(text,text,text,text,text) to service_role;
