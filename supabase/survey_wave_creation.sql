-- Manual survey-wave builder linked to the shared employee roster.
-- Run after supabase/employee_roster.sql and supabase/survey_schema.sql.

alter table public.survey_employees
  add column if not exists roster_employee_id uuid;

alter table public.survey_waves
  add column if not exists notes text;

create unique index if not exists survey_employees_roster_employee_idx
  on public.survey_employees (roster_employee_id);

alter table public.survey_employees
  drop constraint if exists survey_employees_roster_employee_id_fkey;
alter table public.survey_employees
  add constraint survey_employees_roster_employee_id_fkey
  foreign key (roster_employee_id)
  references public.employees(id)
  on delete set null;

-- Keep linked survey records current when the shared roster changes.
create or replace function public.sync_survey_employee_from_roster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active then
    insert into public.survey_employees (
      external_id, name, department, hire_date, status, roster_employee_id
    )
    values (
      'roster:' || new.id,
      new.name,
      new.dept,
      new.hired_on,
      'active',
      new.id
    )
    on conflict (roster_employee_id) do update
    set name = excluded.name,
        department = excluded.department,
        hire_date = excluded.hire_date,
        status = 'active';
  else
    update public.survey_employees
    set name = new.name,
        department = new.dept,
        hire_date = new.hired_on,
        status = 'inactive'
    where roster_employee_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists employees_sync_survey_employee on public.employees;
create trigger employees_sync_survey_employee
after insert or update of name, dept, position, active, hired_on
on public.employees
for each row execute function public.sync_survey_employee_from_roster();

-- Backfill the current roster once. Existing survey-only employees remain intact.
insert into public.survey_employees (
  external_id, name, department, hire_date, status, roster_employee_id
)
select
  'roster:' || employee.id,
  employee.name,
  employee.dept,
  employee.hired_on,
  'active',
  employee.id
from public.employees employee
where employee.active = true
on conflict (roster_employee_id) do update
set name = excluded.name,
    department = excluded.department,
    hire_date = excluded.hire_date,
    status = 'active';

create or replace function public.create_survey_wave_with_roster(
  p_code text,
  p_name text,
  p_starts_on date,
  p_closes_on date,
  p_status text,
  p_notes text,
  p_employee_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wave_id uuid;
  survey_employee_id uuid;
  employee record;
  selected_count integer;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Для создания волны нужен вход в Supabase Auth';
  end if;

  if nullif(trim(p_code), '') is null
     or nullif(trim(p_name), '') is null
     or p_starts_on is null
     or p_closes_on is null then
    raise exception 'Название и обе даты обязательны';
  end if;

  if p_closes_on < p_starts_on then
    raise exception 'Дедлайн не может быть раньше даты проведения';
  end if;

  if p_status not in ('open', 'closed') then
    raise exception 'Неизвестный статус волны';
  end if;

  select count(*) into selected_count
  from public.employees
  where id = any(p_employee_ids) and active = true;

  if selected_count = 0 then
    raise exception 'В волне нет активных сотрудников';
  end if;

  insert into public.survey_waves (code, name, starts_on, closes_on, status, notes)
  values (trim(p_code), trim(p_name), p_starts_on, p_closes_on, p_status, nullif(trim(p_notes), ''))
  returning id into wave_id;

  for employee in
    select id, name, dept, position, hired_on
    from public.employees
    where id = any(p_employee_ids) and active = true
    order by dept, name
  loop
    insert into public.survey_employees (
      external_id, name, department, hire_date, status, roster_employee_id
    )
    values (
      'roster:' || employee.id,
      employee.name,
      employee.dept,
      employee.hired_on,
      'active',
      employee.id
    )
    on conflict (roster_employee_id) do update
    set name = excluded.name,
        department = excluded.department,
        hire_date = excluded.hire_date,
        status = 'active'
    returning id into survey_employee_id;

    insert into public.survey_participation (
      wave_id, employee_id, eligibility, result
    )
    values (
      wave_id, survey_employee_id, 'eligible', 'not_sent'
    )
    on conflict (wave_id, employee_id) do nothing;
  end loop;

  return wave_id;
end;
$$;

revoke all on function public.create_survey_wave_with_roster(
  text, text, date, date, text, text, uuid[]
) from public;
grant execute on function public.create_survey_wave_with_roster(
  text, text, date, date, text, text, uuid[]
) to authenticated;
