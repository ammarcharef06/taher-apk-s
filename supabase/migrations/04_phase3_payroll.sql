-- Phase 3: payroll payment records and supporting indexes.
-- Keeps all previously applied migrations unchanged.

create unique index if not exists wages_company_id_id_uidx
  on public.wages(company_id, id);

create unique index if not exists cash_transactions_company_id_id_uidx
  on public.cash_transactions(company_id, id);

create index if not exists wages_company_worker_month_idx
  on public.wages(company_id, worker_id, wage_month desc)
  where deleted_at is null;

create index if not exists advances_company_worker_movement_idx
  on public.advances(company_id, worker_id, movement_date desc)
  where deleted_at is null;

create index if not exists social_security_company_period_idx
  on public.social_security_declarations(company_id, declaration_period desc, agency)
  where deleted_at is null;

-- Payroll readers need worker names, while the Workers management screen stays restricted.
drop policy if exists workers_read_company on public.workers;
create policy workers_read_company
on public.workers for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
);

create table if not exists public.wage_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  wage_id uuid not null,
  worker_id uuid not null,
  payment_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method public.payment_method not null check (payment_method in ('cash', 'bank')),
  cash_transaction_id uuid,
  receipt_number text not null check (length(trim(receipt_number)) between 2 and 80),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint wage_payments_company_receipt_unique unique(company_id, receipt_number),
  constraint wage_payments_cash_link_required check (
    (payment_method = 'cash' and cash_transaction_id is not null)
    or (payment_method = 'bank' and cash_transaction_id is null)
  ),
  constraint wage_payments_wage_company_fk
    foreign key (company_id, wage_id)
    references public.wages(company_id, id) on delete restrict,
  constraint wage_payments_worker_company_fk
    foreign key (company_id, worker_id)
    references public.workers(company_id, id) on delete restrict,
  constraint wage_payments_cash_company_fk
    foreign key (company_id, cash_transaction_id)
    references public.cash_transactions(company_id, id) on delete restrict
);

create index if not exists wage_payments_company_date_idx
  on public.wage_payments(company_id, payment_date desc);

create index if not exists wage_payments_wage_date_idx
  on public.wage_payments(wage_id, payment_date desc);

alter table public.wage_payments enable row level security;

grant select, insert on public.wage_payments to authenticated;
revoke update, delete on public.wage_payments from authenticated;

create policy wage_payments_read_company
on public.wage_payments for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant']::public.app_role[]
  )
);

create policy wage_payments_insert_admin_manager
on public.wage_payments for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager']::public.app_role[]
  )
);

create or replace function public.apply_wage_payment()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_net_due numeric(14, 2);
  v_paid_amount numeric(14, 2);
  v_payment_total numeric(14, 2);
  v_new_paid_amount numeric(14, 2);
begin
  if new.payment_method = 'cash' and not exists (
    select 1
    from public.cash_transactions ct
    where ct.company_id = new.company_id
      and ct.id = new.cash_transaction_id
      and ct.transaction_type = 'expense'
      and ct.amount = new.amount
      and ct.transaction_date = new.payment_date
      and ct.deleted_at is null
  ) then
    raise exception 'حركة الصندوق المرتبطة بدفعة الأجر غير صحيحة.'
      using errcode = '23514';
  end if;

  select w.net_due, w.paid_amount
    into v_net_due, v_paid_amount
  from public.wages w
  where w.company_id = new.company_id
    and w.id = new.wage_id
    and w.worker_id = new.worker_id
    and w.deleted_at is null
  for update;

  if not found then
    raise exception 'قسيمة الأجر غير موجودة أو غير نشطة.'
      using errcode = '23503';
  end if;

  select coalesce(sum(wp.amount), 0)
    into v_payment_total
  from public.wage_payments wp
  where wp.company_id = new.company_id
    and wp.wage_id = new.wage_id;

  v_new_paid_amount := greatest(v_paid_amount, v_payment_total);

  if v_new_paid_amount > v_net_due then
    raise exception 'قيمة الدفعة تتجاوز الرصيد المستحق للأجر.'
      using errcode = '23514';
  end if;

  update public.wages
  set paid_amount = v_new_paid_amount,
      receipt_number = new.receipt_number,
      updated_at = now()
  where company_id = new.company_id
    and id = new.wage_id;

  return new;
end;
$$;

revoke all on function public.apply_wage_payment() from public;

drop trigger if exists apply_wage_payment_after_insert on public.wage_payments;
create trigger apply_wage_payment_after_insert
after insert on public.wage_payments
for each row execute function public.apply_wage_payment();

drop trigger if exists audit_wage_payment on public.wage_payments;
create trigger audit_wage_payment
after insert on public.wage_payments
for each row execute function public.write_audit_log();
