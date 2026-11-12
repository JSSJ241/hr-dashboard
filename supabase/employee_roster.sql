-- Employee roster and automatic department headcount synchronization.
-- Run after supabase/turnover_schema.sql.

alter table public.departments
  drop constraint if exists departments_employees_check;
alter table public.departments
  add constraint departments_employees_check check (employees >= 0);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dept text not null references public.departments(name) on update cascade on delete restrict,
  position text,
  raw_department text,
  active boolean not null default true,
  hired_on date,
  terminated_on date,
  created_at timestamptz not null default now()
);

alter table public.terminations
  add column if not exists employee_id uuid;

create index if not exists employees_active_dept_idx
  on public.employees (dept, name)
  where active = true;

create unique index if not exists employees_active_name_dept_idx
  on public.employees (lower(name), dept)
  where active = true;

create or replace function public.sync_department_headcount()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.active then
      update public.departments
      set employees = employees + 1
      where name = new.dept;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.active then
      update public.departments
      set employees = greatest(0, employees - 1)
      where name = old.dept;
    end if;
    return old;
  end if;

  if old.active and (not new.active or old.dept is distinct from new.dept) then
    update public.departments
    set employees = greatest(0, employees - 1)
    where name = old.dept;
  end if;

  if new.active and (not old.active or old.dept is distinct from new.dept) then
    update public.departments
    set employees = employees + 1
    where name = new.dept;
  end if;

  return new;
end;
$$;

drop trigger if exists employees_sync_department_headcount on public.employees;
create trigger employees_sync_department_headcount
after insert or update or delete
on public.employees
for each row execute function public.sync_department_headcount();

create or replace function public.terminate_employees(employee_ids uuid[])
returns integer
language sql
as $$
  with changed as (
    update public.employees
    set active = false, terminated_on = coalesce(terminated_on, current_date)
    where id = any(employee_ids) and active
    returning 1
  )
  select count(*)::integer from changed;
$$;

create or replace function public.record_employee_termination(
  p_employee_id uuid,
  p_reason text,
  p_type text,
  p_termination_type text,
  p_date date,
  p_tenure_months integer,
  p_value_score integer
)
returns uuid
language plpgsql
as $$
declare
  employee public.employees%rowtype;
  termination_id uuid;
begin
  select * into employee
  from public.employees
  where id = p_employee_id and active = true
  for update;

  if not found then
    raise exception 'Активный сотрудник не найден';
  end if;

  insert into public.terminations (
    employee_id, name, dept, position, date, tenure_months,
    reason, type, termination_type, value_score
  )
  values (
    employee.id, employee.name, employee.dept, employee.position, p_date, p_tenure_months,
    p_reason, p_type, p_termination_type, p_value_score
  )
  returning id into termination_id;

  update public.employees
  set active = false, terminated_on = p_date
  where id = employee.id;

  return termination_id;
end;
$$;

alter table public.employees enable row level security;

drop policy if exists "dashboard employees" on public.employees;
create policy "dashboard employees"
on public.employees for all
to anon, authenticated
using (true)
with check (true);

grant execute on function public.terminate_employees(uuid[]) to anon, authenticated;
grant execute on function public.record_employee_termination(
  uuid, text, text, text, date, integer, integer
) to anon, authenticated;
