-- Survey participation tables for the HR dashboard.
-- Run this script in Supabase Dashboard > SQL Editor.
-- The dashboard uses real records only; this script inserts no employee data.

create extension if not exists pgcrypto;

create table if not exists public.survey_employees (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique check (length(trim(external_id)) > 0),
  name text not null check (length(trim(name)) > 0),
  department text not null check (length(trim(department)) > 0),
  manager text,
  hire_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_waves (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  starts_on date not null,
  closes_on date not null,
  status text not null default 'closed' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  constraint survey_wave_dates_check check (closes_on >= starts_on)
);

create table if not exists public.survey_participation (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references public.survey_waves(id) on delete cascade,
  employee_id uuid not null references public.survey_employees(id) on delete cascade,
  eligibility text not null check (eligibility in ('eligible', 'excluded')),
  result text not null check (result in ('completed', 'not_completed', 'not_sent')),
  exclusion_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wave_id, employee_id)
);

create table if not exists public.survey_followups (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references public.survey_waves(id) on delete cascade,
  employee_id uuid not null references public.survey_employees(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'follow_up', 'closed')),
  owner text,
  contact_date date,
  outcome text
    check (outcome is null or outcome in ('work_issue', 'not_work_related', 'monitor', 'unreachable')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wave_id, employee_id)
);

create index if not exists survey_employees_department_idx
  on public.survey_employees (department);
create index if not exists survey_employees_status_idx
  on public.survey_employees (status);
create index if not exists survey_waves_dates_idx
  on public.survey_waves (starts_on, closes_on);
create index if not exists survey_participation_wave_idx
  on public.survey_participation (wave_id);
create index if not exists survey_participation_employee_idx
  on public.survey_participation (employee_id);
create index if not exists survey_followups_status_idx
  on public.survey_followups (wave_id, status);

create or replace function public.set_survey_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists survey_employees_updated_at on public.survey_employees;
create trigger survey_employees_updated_at
before update on public.survey_employees
for each row execute function public.set_survey_updated_at();

drop trigger if exists survey_participation_updated_at on public.survey_participation;
create trigger survey_participation_updated_at
before update on public.survey_participation
for each row execute function public.set_survey_updated_at();

drop trigger if exists survey_followups_updated_at on public.survey_followups;
create trigger survey_followups_updated_at
before update on public.survey_followups
for each row execute function public.set_survey_updated_at();

alter table public.survey_employees enable row level security;
alter table public.survey_waves enable row level security;
alter table public.survey_participation enable row level security;
alter table public.survey_followups enable row level security;

-- Employee names, participation and follow-up notes are personnel data.
-- Do not expose these tables through the public anon role.
grant select, insert, update, delete on public.survey_employees to authenticated;
grant select, insert, update, delete on public.survey_waves to authenticated;
grant select, insert, update, delete on public.survey_participation to authenticated;
grant select, insert, update, delete on public.survey_followups to authenticated;

drop policy if exists "authenticated survey employees" on public.survey_employees;
create policy "authenticated survey employees"
on public.survey_employees for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated survey waves" on public.survey_waves;
create policy "authenticated survey waves"
on public.survey_waves for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated survey participation" on public.survey_participation;
create policy "authenticated survey participation"
on public.survey_participation for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated survey followups" on public.survey_followups;
create policy "authenticated survey followups"
on public.survey_followups for all
to authenticated
using (true)
with check (true);
