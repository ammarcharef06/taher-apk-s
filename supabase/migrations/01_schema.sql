-- Taher Accounting NG: core relational schema.
-- Apply this migration before 02_rls.sql.

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.app_role as enum (
    'super_admin',
    'company_admin',
    'manager',
    'accountant',
    'data_entry',
    'client'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.worker_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.cash_transaction_type as enum ('income', 'expense');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.advance_type as enum (
    'advance_issued',
    'purchase_expense',
    'repayment',
    'wage_deduction'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'bank', 'credit');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.social_security_agency as enum ('CNAS', 'CASNOS');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('paid', 'unpaid', 'partial');
exception when duplicate_object then null;
end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  owner_name text not null check (length(trim(owner_name)) between 2 and 160),
  logo_path text,
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  currency_code varchar(3) not null default 'DZD' check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role <> 'super_admin'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint company_memberships_company_user_unique unique (company_id, user_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint clients_company_id_id_unique unique (company_id, id)
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  phone text,
  job_title text,
  start_date date not null default current_date,
  daily_wage numeric(14, 2) not null default 0 check (daily_wage >= 0),
  status public.worker_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workers_company_id_id_unique unique (company_id, id)
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transaction_date date not null default current_date,
  transaction_type public.cash_transaction_type not null,
  description text not null,
  beneficiary text,
  amount numeric(14, 2) not null check (amount > 0),
  document_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.cash_opening_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date,
  opening_amount numeric(14, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cash_opening_period_valid check (period_end is null or period_end >= period_start),
  constraint cash_opening_company_period_unique unique (company_id, period_start)
);

create table if not exists public.wages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null,
  wage_month date not null,
  work_days numeric(7, 2) not null default 0 check (work_days >= 0),
  daily_rate numeric(14, 2) not null default 0 check (daily_rate >= 0),
  base_amount numeric(14, 2) not null default 0 check (base_amount >= 0),
  overtime_hours numeric(8, 2) not null default 0 check (overtime_hours >= 0),
  overtime_amount numeric(14, 2) not null default 0 check (overtime_amount >= 0),
  bonuses numeric(14, 2) not null default 0 check (bonuses >= 0),
  deductions numeric(14, 2) not null default 0 check (deductions >= 0),
  advances_deducted numeric(14, 2) not null default 0 check (advances_deducted >= 0),
  carried_balance numeric(14, 2) not null default 0,
  net_due numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  receipt_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint wages_worker_company_fk
    foreign key (company_id, worker_id)
    references public.workers(company_id, id) on delete restrict,
  constraint wages_month_start check (extract(day from wage_month) = 1),
  constraint wages_paid_not_over_due check (paid_amount <= greatest(net_due, 0)),
  constraint wages_worker_month_unique unique (worker_id, wage_month)
);

create table if not exists public.advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  advance_type public.advance_type not null,
  movement_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  document_number text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint advances_worker_company_fk
    foreign key (company_id, worker_id)
    references public.workers(company_id, id) on delete restrict
);

create table if not exists public.social_security_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency public.social_security_agency not null,
  declaration_period date not null,
  declaration_type text not null,
  amount_due numeric(14, 2) not null check (amount_due >= 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  payment_date date,
  payment_status public.payment_status not null default 'unpaid',
  receipt_number text,
  archive_location text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_security_paid_not_over_due check (amount_paid <= amount_due)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_date date not null default current_date,
  expense_type text not null,
  supplier text,
  invoice_number text,
  amount_ht numeric(14, 2) not null default 0 check (amount_ht >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  amount_ttc numeric(14, 2) generated always as (amount_ht + tax_amount) stored,
  payment_method public.payment_method not null default 'cash',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_table text,
  source_id uuid,
  document_type text not null,
  counterparty text,
  invoice_number text,
  document_date date not null default current_date,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  cabinet text,
  shelf text,
  storage_path text,
  delivered_to_accountant boolean not null default false,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint archives_source_unique unique (company_id, source_table, source_id),
  constraint archives_company_id_id_unique unique (company_id, id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.correction_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id uuid not null,
  conflict_resolution text not null,
  previous_data jsonb,
  accepted_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_access_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint client_tokens_company_client_fk
    foreign key (company_id, client_id)
    references public.clients(company_id, id) on delete cascade
);

create table if not exists public.client_signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  archive_id uuid,
  signer_name text not null,
  signature_storage_path text,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint client_signatures_company_client_fk
    foreign key (company_id, client_id)
    references public.clients(company_id, id) on delete cascade,
  constraint client_signatures_company_archive_fk
    foreign key (company_id, archive_id)
    references public.archives(company_id, id) on delete restrict
);

create index if not exists company_memberships_user_active_idx
  on public.company_memberships (user_id, is_active) where deleted_at is null;
create index if not exists workers_company_status_idx
  on public.workers (company_id, status) where deleted_at is null;
create index if not exists cash_transactions_company_date_idx
  on public.cash_transactions (company_id, transaction_date desc) where deleted_at is null;
create index if not exists wages_company_month_idx
  on public.wages (company_id, wage_month desc) where deleted_at is null;
create index if not exists advances_company_worker_date_idx
  on public.advances (company_id, worker_id, movement_date desc) where deleted_at is null;
create index if not exists expenses_company_date_idx
  on public.expenses (company_id, expense_date desc) where deleted_at is null;
create index if not exists archives_company_date_idx
  on public.archives (company_id, document_date desc) where deleted_at is null;
create index if not exists audit_logs_company_created_idx
  on public.audit_logs (company_id, created_at desc);
create index if not exists correction_logs_company_created_idx
  on public.correction_logs (company_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'companies',
    'profiles',
    'company_memberships',
    'clients',
    'workers',
    'cash_transactions',
    'cash_opening_balances',
    'wages',
    'advances',
    'social_security_declarations',
    'expenses',
    'archives',
    'client_access_tokens',
    'client_signatures'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', v_table);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'مستخدم جديد'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.bootstrap_company(
  p_company_name text,
  p_owner_name text,
  p_currency_code varchar(3) default 'DZD'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_currency_code varchar(3) := upper(trim(coalesce(p_currency_code, 'DZD')));
begin
  if v_user_id is null then
    raise exception 'يجب تسجيل الدخول قبل إنشاء الشركة' using errcode = '28000';
  end if;

  if length(trim(coalesce(p_company_name, ''))) < 2 then
    raise exception 'اسم الشركة يجب ألا يقل عن حرفين' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_owner_name, ''))) < 2 then
    raise exception 'اسم المالك يجب ألا يقل عن حرفين' using errcode = '22023';
  end if;

  if v_currency_code !~ '^[A-Z]{3}$' then
    raise exception 'رمز العملة يجب أن يتكون من ثلاثة أحرف كبيرة' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.company_memberships
    where user_id = v_user_id
      and is_active = true
      and deleted_at is null
  ) then
    raise exception 'هذا الحساب مرتبط بشركة بالفعل' using errcode = '23505';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user_id, trim(p_owner_name))
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.companies (name, owner_name, currency_code)
  values (trim(p_company_name), trim(p_owner_name), v_currency_code)
  returning id into v_company_id;

  insert into public.company_memberships (company_id, user_id, role)
  values (v_company_id, v_user_id, 'company_admin');

  return v_company_id;
end;
$$;

create or replace function public.create_archive_for_financial_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_company_id uuid;
  v_source_id uuid;
  v_document_date date;
  v_amount numeric(14, 2);
  v_counterparty text;
  v_document_number text;
begin
  v_row := to_jsonb(new);
  v_company_id := (v_row ->> 'company_id')::uuid;
  v_source_id := (v_row ->> 'id')::uuid;

  v_document_date := coalesce(
    nullif(v_row ->> 'transaction_date', '')::date,
    nullif(v_row ->> 'wage_month', '')::date,
    nullif(v_row ->> 'movement_date', '')::date,
    nullif(v_row ->> 'declaration_period', '')::date,
    nullif(v_row ->> 'expense_date', '')::date,
    current_date
  );

  v_amount := coalesce(
    nullif(v_row ->> 'amount', '')::numeric,
    nullif(v_row ->> 'net_due', '')::numeric,
    nullif(v_row ->> 'amount_due', '')::numeric,
    nullif(v_row ->> 'amount_ttc', '')::numeric,
    0
  );

  v_counterparty := coalesce(
    nullif(v_row ->> 'beneficiary', ''),
    nullif(v_row ->> 'supplier', ''),
    nullif(v_row ->> 'description', '')
  );

  v_document_number := coalesce(
    nullif(v_row ->> 'document_number', ''),
    nullif(v_row ->> 'receipt_number', ''),
    nullif(v_row ->> 'invoice_number', '')
  );

  insert into public.archives (
    company_id,
    source_table,
    source_id,
    document_type,
    counterparty,
    invoice_number,
    document_date,
    amount
  )
  values (
    v_company_id,
    tg_table_name,
    v_source_id,
    tg_table_name,
    v_counterparty,
    v_document_number,
    v_document_date,
    greatest(v_amount, 0)
  )
  on conflict (company_id, source_table, source_id) do nothing;

  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'cash_transactions',
    'wages',
    'advances',
    'social_security_declarations',
    'expenses'
  ]
  loop
    execute format('drop trigger if exists create_financial_archive on public.%I', v_table);
    execute format(
      'create trigger create_financial_archive after insert on public.%I for each row execute function public.create_archive_for_financial_record()',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_company_id uuid;
  v_record_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_row := v_old;
  else
    v_new := to_jsonb(new);
    v_row := v_new;
  end if;

  v_company_id := nullif(v_row ->> 'company_id', '')::uuid;
  v_record_id := nullif(v_row ->> 'id', '')::uuid;

  if v_company_id is not null then
    insert into public.audit_logs (
      company_id,
      actor_user_id,
      action,
      table_name,
      record_id,
      before_data,
      after_data
    )
    values (
      v_company_id,
      auth.uid(),
      lower(tg_op),
      tg_table_name,
      v_record_id,
      v_old,
      v_new
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'companies',
    'company_memberships',
    'clients',
    'workers',
    'cash_transactions',
    'cash_opening_balances',
    'wages',
    'advances',
    'social_security_declarations',
    'expenses',
    'archives',
    'client_access_tokens',
    'client_signatures'
  ]
  loop
    execute format('drop trigger if exists write_audit_log on public.%I', v_table);
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      v_table
    );
  end loop;
end;
$$;

grant usage on schema public to authenticated;
grant execute on function public.bootstrap_company(text, text, varchar) to authenticated;
