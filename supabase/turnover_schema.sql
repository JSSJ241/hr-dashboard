-- Turnover tables for the existing HR dashboard Supabase project.
-- Run this script in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  employees integer not null default 1 check (employees > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.terminations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dept text not null,
  position text,
  date date not null,
  tenure_months integer not null default 0 check (tenure_months >= 0),
  reason text not null,
  type text,
  termination_type text not null default 'Другое',
  value_score integer not null default 5 check (value_score between 1 and 10),
  created_at timestamptz not null default now()
);

create index if not exists terminations_date_idx on public.terminations (date desc);
create index if not exists terminations_dept_idx on public.terminations (dept);

alter table public.departments enable row level security;
alter table public.terminations enable row level security;

-- Temporary compatibility policies for the current client-side dashboard.
-- Replace these with Supabase Auth-based policies before using real employee data.
drop policy if exists "authenticated dashboard departments" on public.departments;
create policy "authenticated dashboard departments"
on public.departments for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "authenticated dashboard terminations" on public.terminations;
create policy "authenticated dashboard terminations"
on public.terminations for all
to anon, authenticated
using (true)
with check (true);
