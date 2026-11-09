-- Phase 8 follow-up: offline invoice synchronization and idempotent payment-to-cash posting.
-- Apply after 07_phase8_invoicing_portal.sql. Existing migrations are not modified.
begin;

-- Composite FK target for a company's cash transaction.
create unique index if not exists cash_transactions_company_id_id_unique
  on public.cash_transactions(company_id,id);

alter table public.invoice_payments
  add column if not exists cash_transaction_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='invoice_payments_company_cash_transaction_fk'
      and conrelid='public.invoice_payments'::regclass
  ) then
    alter table public.invoice_payments
      add constraint invoice_payments_company_cash_transaction_fk
      foreign key(company_id,cash_transaction_id)
      references public.cash_transactions(company_id,id)
      on delete restrict;
  end if;
end $$;

create index if not exists clients_company_sync_idx on public.clients(company_id,updated_at,id);
create index if not exists invoices_company_sync_idx on public.invoices(company_id,updated_at,id);
create index if not exists invoice_items_company_sync_idx on public.invoice_items(company_id,created_at,id);
create index if not exists invoice_payments_company_sync_idx on public.invoice_payments(company_id,created_at,id);

-- Item rows are append-only in the offline sync protocol. Every accepted item
-- recalculates its parent invoice on the server, including retries safely.
create or replace function public.sync_recalculate_invoice_items()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if tg_op='DELETE' then
    perform public.recalculate_invoice(old.company_id,old.invoice_id);
    return old;
  end if;
  if tg_op='UPDATE' and (old.company_id<>new.company_id or old.invoice_id<>new.invoice_id) then
    perform public.recalculate_invoice(old.company_id,old.invoice_id);
  end if;
  perform public.recalculate_invoice(new.company_id,new.invoice_id);
  return new;
end;
$$;

drop trigger if exists sync_recalculate_invoice_items on public.invoice_items;
create trigger sync_recalculate_invoice_items
after insert or update or delete on public.invoice_items
for each row execute function public.sync_recalculate_invoice_items();

-- Extend the authenticated, allow-listed sync endpoint without widening access
-- to arbitrary table names. Clients/invoices are mutable; invoice items are
-- immutable insert events and their generated totals are calculated by PostgreSQL.
create or replace function public.sync_apply_record(p_entity text,p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_company_id uuid;
  v_record_id uuid;
  v_allowed_roles public.app_role[];
  v_columns text;
  v_select text;
  v_updates text;
  v_sql text;
  v_result jsonb;
  v_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode='28000';
  end if;
  if p_record is null or jsonb_typeof(p_record)<>'object' then
    raise exception 'A JSON record is required.' using errcode='22023';
  end if;
  v_company_id:=nullif(p_record->>'company_id','')::uuid;
  v_record_id:=nullif(p_record->>'id','')::uuid;
  if v_company_id is null or v_record_id is null then
    raise exception 'company_id and id are required.' using errcode='22023';
  end if;

  v_allowed_roles:=case p_entity
    when 'workers' then array['company_admin','manager']::public.app_role[]
    when 'cash_transactions' then array['company_admin','manager','data_entry']::public.app_role[]
    when 'cash_opening_balances' then array['company_admin','manager']::public.app_role[]
    when 'wages' then array['company_admin','manager']::public.app_role[]
    when 'wage_payments' then array['company_admin','manager']::public.app_role[]
    when 'advances' then array['company_admin','manager','data_entry']::public.app_role[]
    when 'social_security_declarations' then array['company_admin','manager']::public.app_role[]
    when 'expenses' then array['company_admin','manager','data_entry']::public.app_role[]
    when 'archives' then array['company_admin','manager','data_entry']::public.app_role[]
    when 'clients' then array['company_admin','manager']::public.app_role[]
    when 'invoices' then array['company_admin','manager']::public.app_role[]
    when 'invoice_items' then array['company_admin','manager']::public.app_role[]
    else null
  end;
  if v_allowed_roles is null then
    raise exception 'Sync entity is not allowed: %',p_entity using errcode='22023';
  end if;
  if not public.has_company_role(v_company_id,v_allowed_roles) then
    raise exception 'Insufficient company permissions for sync entity %.',p_entity using errcode='42501';
  end if;

  if p_entity='wage_payments' then
    v_payload:=p_record-'_synced'-'_updated_at'-'_deleted'-'file_blob';
    insert into public.wage_payments
    select (jsonb_populate_record(null::public.wage_payments,v_payload)).*
    on conflict(id) do nothing
    returning to_jsonb(wage_payments) into v_result;
    if v_result is not null then
      return jsonb_build_object('applied',true,'record',v_result,'duplicate',false);
    end if;
    select to_jsonb(wp) into v_result from public.wage_payments wp
      where wp.id=v_record_id and wp.company_id=v_company_id;
    if v_result is null then raise exception 'Wage payment insert was not accepted.' using errcode='23514'; end if;
    return jsonb_build_object('applied',false,'record',v_result,'duplicate',true);
  end if;

  if p_entity='invoice_items' then
    v_payload:=p_record-'_synced'-'_updated_at'-'_deleted'-'file_blob'-'line_subtotal'-'line_tax';
    insert into public.invoice_items(id,company_id,invoice_id,description,quantity,unit_price,tva_rate,created_at)
    values(
      (v_payload->>'id')::uuid,(v_payload->>'company_id')::uuid,(v_payload->>'invoice_id')::uuid,
      trim(v_payload->>'description'),(v_payload->>'quantity')::numeric,(v_payload->>'unit_price')::numeric,
      coalesce((v_payload->>'tva_rate')::numeric,0),coalesce((v_payload->>'created_at')::timestamptz,now())
    )
    on conflict(id) do nothing
    returning to_jsonb(invoice_items) into v_result;
    if v_result is not null then
      return jsonb_build_object('applied',true,'record',v_result,'duplicate',false);
    end if;
    select to_jsonb(ii) into v_result from public.invoice_items ii
      where ii.id=v_record_id and ii.company_id=v_company_id;
    if v_result is null then raise exception 'Invoice item insert was not accepted.' using errcode='23514'; end if;
    return jsonb_build_object('applied',false,'record',v_result,'duplicate',true);
  end if;

  if nullif(p_record->>'updated_at','') is null then
    raise exception 'updated_at is required for mutable sync records.' using errcode='22023';
  end if;
  v_payload:=p_record-'_synced'-'_updated_at'-'_deleted'-'file_blob';
  if p_entity='invoices' then
    v_payload:=v_payload-'subtotal'-'tax_total'-'total'-'paid_amount';
  end if;

  select
    string_agg(format('%I',c.column_name),', ' order by c.ordinal_position),
    string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',p_entity,c.column_name),', ' order by c.ordinal_position),
    string_agg(format('%I=excluded.%I',c.column_name,c.column_name),', ' order by c.ordinal_position)
  into v_columns,v_select,v_updates
  from information_schema.columns c
  where c.table_schema='public' and c.table_name=p_entity
    and c.is_generated='NEVER' and c.column_name not in ('id','company_id','created_at')
    and v_payload ? c.column_name;

  if v_columns is null then
    raise exception 'No writable columns supplied for sync entity %.',p_entity using errcode='22023';
  end if;
  v_sql:=format(
    'insert into public.%I as current_row(id,company_id,created_at,%s) '||
    'select (jsonb_populate_record(null::public.%I,$1)).id,'||
    '(jsonb_populate_record(null::public.%I,$1)).company_id,'||
    'coalesce((jsonb_populate_record(null::public.%I,$1)).created_at,now()),%s '||
    'on conflict(id) do update set %s '||
    'where current_row.company_id=excluded.company_id and current_row.updated_at<excluded.updated_at '||
    'returning to_jsonb(current_row)',
    p_entity,v_columns,p_entity,p_entity,p_entity,v_select,v_updates
  );
  execute v_sql into v_result using v_payload;
  if v_result is not null then
    return jsonb_build_object('applied',true,'record',v_result,'duplicate',false);
  end if;
  v_sql:=format('select to_jsonb(t) from public.%I t where t.id=$1 and t.company_id=$2',p_entity);
  execute v_sql into v_result using v_record_id,v_company_id;
  if v_result is null then raise exception 'Sync upsert returned no row.' using errcode='23514'; end if;
  insert into public.correction_logs(company_id,actor_user_id,table_name,record_id,conflict_resolution,previous_data,accepted_data)
  values(v_company_id,auth.uid(),p_entity,v_record_id,'server_wins_newer_updated_at',v_payload,v_result);
  return jsonb_build_object('applied',false,'record',v_result,'duplicate',false);
end;
$$;

-- A cash invoice payment is an atomic, idempotent append event. Cash payments
-- create one linked cash_transactions income row; bank payments do not alter
-- the physical cash-box balance.
create or replace function public.sync_apply_invoice_payment(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_company uuid;
  v_invoice uuid;
  v_payment_id uuid;
  v_cash_id uuid;
  v_method public.payment_method;
  v_amount numeric(14,2);
  v_date date;
  v_number text;
  v_client_name text;
  v_payment public.invoice_payments%rowtype;
  v_cash public.cash_transactions%rowtype;
  v_existing public.invoice_payments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  if p_record is null or jsonb_typeof(p_record)<>'object' then raise exception 'A JSON payment is required.' using errcode='22023'; end if;
  v_company:=nullif(p_record->>'company_id','')::uuid;
  v_invoice:=nullif(p_record->>'invoice_id','')::uuid;
  v_payment_id:=nullif(p_record->>'id','')::uuid;
  v_amount:=nullif(p_record->>'amount','')::numeric;
  v_date:=nullif(p_record->>'payment_date','')::date;
  v_method:=nullif(p_record->>'payment_method','')::public.payment_method;
  v_cash_id:=nullif(p_record->>'cash_transaction_id','')::uuid;
  if v_company is null or v_invoice is null or v_payment_id is null or v_amount is null or v_amount<=0 or v_date is null then
    raise exception 'Payment identity, date and positive amount are required.' using errcode='22023';
  end if;
  if v_method is null or v_method not in ('cash','bank') then raise exception 'Unsupported invoice payment method.' using errcode='22023'; end if;
  if (v_method='cash' and v_cash_id is null) or (v_method='bank' and v_cash_id is not null) then
    raise exception 'Cash transaction linkage does not match the payment method.' using errcode='22023';
  end if;
  if not public.has_company_role(v_company,array['company_admin','manager']::public.app_role[]) then
    raise exception 'Insufficient invoice payment permissions.' using errcode='42501';
  end if;

  select * into v_existing from public.invoice_payments where id=v_payment_id;
  if found then
    if v_existing.company_id<>v_company or v_existing.invoice_id<>v_invoice or
       v_existing.amount<>v_amount or v_existing.payment_method<>v_method or
       v_existing.cash_transaction_id is distinct from v_cash_id then
      raise exception 'Payment ID already exists with different data.' using errcode='23505';
    end if;
    if v_cash_id is not null then
      select * into v_cash from public.cash_transactions where id=v_cash_id and company_id=v_company;
      if not found then raise exception 'Linked cash movement is missing.' using errcode='23514'; end if;
    end if;
    return jsonb_build_object('applied',false,'record',to_jsonb(v_existing),
      'cash_transaction',case when v_cash_id is null then null else to_jsonb(v_cash) end,'duplicate',true);
  end if;

  select i.invoice_number,c.name into v_number,v_client_name
  from public.invoices i join public.clients c on c.id=i.client_id and c.company_id=i.company_id
  where i.id=v_invoice and i.company_id=v_company and i.deleted_at is null and i.status not in ('draft','cancelled')
  for update of i;
  if not found then raise exception 'Invoice is not available for payment.' using errcode='23503'; end if;

  -- Insert the linked cash movement first to satisfy the payment's composite FK.
  -- Both inserts share this RPC transaction, so a rejected payment rolls the cash row back.
  if v_method='cash' then
    insert into public.cash_transactions(id,company_id,transaction_date,transaction_type,description,beneficiary,amount,document_number,notes,created_by,created_at,updated_at,deleted_at)
    values(v_cash_id,v_company,v_date,'income','تحصيل فاتورة: '||v_number,v_client_name,v_amount,
      coalesce(nullif(trim(p_record->>'reference'),''),v_number),nullif(trim(p_record->>'notes'),''),auth.uid(),now(),now(),null)
    returning * into v_cash;
  end if;

  insert into public.invoice_payments(id,company_id,invoice_id,payment_date,amount,payment_method,reference,notes,created_by,created_at,cash_transaction_id)
  values(v_payment_id,v_company,v_invoice,v_date,v_amount,v_method,nullif(trim(p_record->>'reference'),''),nullif(trim(p_record->>'notes'),''),auth.uid(),coalesce(nullif(p_record->>'created_at','')::timestamptz,now()),v_cash_id)
  returning * into v_payment;

  return jsonb_build_object('applied',true,'record',to_jsonb(v_payment),
    'cash_transaction',case when v_method='cash' then to_jsonb(v_cash) else null end,'duplicate',false);
end;
$$;

revoke all on function public.sync_apply_invoice_payment(jsonb) from public,anon;
grant execute on function public.sync_apply_invoice_payment(jsonb) to authenticated;
revoke all on function public.sync_apply_record(text,jsonb) from public,anon;
grant execute on function public.sync_apply_record(text,jsonb) to authenticated;

commit;
