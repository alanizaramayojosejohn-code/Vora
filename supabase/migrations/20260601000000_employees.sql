-- Vora – Employee & Salary Payment tables
-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table employees (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  name        text        not null,
  ci          text        not null,
  phone       text,
  position    text        not null,
  salary      numeric(12, 2) not null default 0,
  hired_at    date        not null,
  created_at  timestamptz not null default now()
);

create table salary_payments (
  id           uuid        primary key default gen_random_uuid(),
  employee_id  uuid        not null references employees(id) on delete cascade,
  amount       numeric(12, 2) not null,
  period_month integer     not null check (period_month between 1 and 12),
  period_year  integer     not null,
  paid_at      date        not null,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table employees       enable row level security;
alter table salary_payments enable row level security;

-- employees: solo admins del negocio gestionan su propio personal
create policy "admins manage employees"
  on employees for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- salary_payments: sin business_id directo → join a través de employees
create policy "admins manage salary_payments"
  on salary_payments for all
  using (
    exists (
      select 1 from employees e
      where e.id = salary_payments.employee_id
        and e.business_id = current_user_business_id()
        and current_user_role() in ('admin', 'super_admin')
    )
  );
