-- Phase 5: authenticated, company-scoped sync endpoint with server-side LWW.
-- Apply after 05_phase4_expenses_archives.sql. No previously applied migration is modified.

-- Pulls are scoped by company and ordered by update cursor. Include tombstones.
create index if not exists workers_company_sync_idx on public.workers(company_id, updated_at, id);
create index if not exists cash_transactions_company_sync_idx on public.cash_transactions(company_id, updated_at, id);
create index if not exists cash_opening_company_sync_idx on public.cash_opening_balances(company_id, updated_at, id);
create index if not exists wages_company_sync_idx on public.wages(company_id, updated_at, id);
create index if not exists wage_payments_company_sync_idx on public.wage_payments(company_id, created_at, id);
create index if not exists advances_company_sync_idx on public.advances(company_id, updated_at, id);
create index if not exists social_security_company_sync_idx on public.social_security_declarations(company_id, updated_at, id);
create index if not exists expenses_company_sync_idx on public.expenses(company_id, updated_at, id);
create index if not exists archives_company_sync_idx on public.archives(company_id, updated_at, id);

create or replace function public.sync_apply_record(
  p_entity text,
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
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
  v_applied boolean := false;
  v_payload jsonb;
  v_column record;
  v_existing_archive_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'A JSON record is required.' using errcode = '22023';
  end if;

  v_company_id := nullif(p_record ->> 'company_id', '')::uuid;
  v_record_id := nullif(p_record ->> 'id', '')::uuid;
  if v_company_id is null or v_record_id is null then
    raise exception 'company_id and id are required.' using errcode = '22023';
  end if;

  v_allowed_roles := case p_entity
    when 'workers' then array['company_admin','manager']::public.app_role[]
    when 'cash_transactions' then array['company_admin','manager','data_entry']::public.app_role[]
    when 'cash_opening_balances' then array['company_admin','manager']::public.app_role[]
    when 'wages' then array['company_admin','manager']::public.app_role[]
    when 'wage_payments' then array['company_admin','manager']::public.app_role[]
    when 'advances' then array['company_admin','manager','data_entry']::public.app_role[]
    when 'social_security_declarations' then array['company_admin','manager']::public.app_role[]
    when 'expenses' then array['company_admin','manager','data_entry']::public.app_role[]
    when 'archives' then array['company_admin','manager','data_entry']::public.app_role[]
    else null
  end;
  if v_allowed_roles is null then
    raise exception 'Sync entity is not allowed: %', p_entity using errcode = '22023';
  end if;
  if not public.has_company_role(v_company_id, v_allowed_roles) then
    raise exception 'Insufficient company permissions for sync entity %.', p_entity using errcode = '42501';
  end if;

  -- Wage payments are immutable append-only events and have no updated_at column.
  if p_entity = 'wage_payments' then
    v_payload := p_record - '_synced' - '_updated_at' - '_deleted' - 'file_blob';
    insert into public.wage_payments
    select (jsonb_populate_record(null::public.wage_payments, v_payload)).*
    on conflict (id) do nothing
    returning to_jsonb(wage_payments) into v_result;
    if v_result is not null then
      return jsonb_build_object('applied', true, 'record', v_result, 'duplicate', false);
    end if;
    select to_jsonb(wp) into v_result
    from public.wage_payments wp
    where wp.id = v_record_id and wp.company_id = v_company_id;
    if v_result is null then
      raise exception 'Wage payment insert was not accepted.' using errcode = '23514';
    end if;
    return jsonb_build_object('applied', false, 'record', v_result, 'duplicate', true);
  end if;

  if nullif(p_record ->> 'updated_at', '') is null then
    raise exception 'updated_at is required for mutable sync records.' using errcode = '22023';
  end if;

  v_payload := p_record - '_synced' - '_updated_at' - '_deleted' - 'file_blob';
  if p_entity = 'expenses' then
    v_payload := v_payload - 'amount_ttc';
  end if;

  -- Financial-table triggers can create the archive row before its local queue item
  -- is pushed. Reuse that canonical server ID instead of violating source uniqueness.
  if p_entity = 'archives'
     and nullif(v_payload ->> 'source_table', '') is not null
     and nullif(v_payload ->> 'source_id', '') is not null then
    select a.id into v_existing_archive_id
    from public.archives a
    where a.company_id = v_company_id
      and a.source_table = v_payload ->> 'source_table'
      and a.source_id = (v_payload ->> 'source_id')::uuid
    limit 1;
    if v_existing_archive_id is not null then
      v_record_id := v_existing_archive_id;
      v_payload := jsonb_set(v_payload, '{id}', to_jsonb(v_existing_archive_id::text), true);
    end if;
  end if;

  select
    string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position),
    string_agg(format('(jsonb_populate_record(null::public.%I, $1)).%I', p_entity, c.column_name), ', ' order by c.ordinal_position),
    string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ' order by c.ordinal_position)
  into v_columns, v_select, v_updates
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_entity
    and c.is_generated = 'NEVER'
    and c.column_name <> 'id'
    and c.column_name <> 'company_id'
    and c.column_name <> 'created_at'
    and v_payload ? c.column_name;

  if v_columns is null then
    raise exception 'No writable columns supplied for sync entity %.', p_entity using errcode = '22023';
  end if;

  v_sql := format(
    'insert into public.%I as current_row (id, company_id, created_at, %s) ' ||
    'select (jsonb_populate_record(null::public.%I, $1)).id, ' ||
    '(jsonb_populate_record(null::public.%I, $1)).company_id, ' ||
    'coalesce((jsonb_populate_record(null::public.%I, $1)).created_at, now()), %s ' ||
    'on conflict (id) do update set %s ' ||
    'where current_row.company_id = excluded.company_id ' ||
    'and current_row.updated_at < excluded.updated_at ' ||
    'returning to_jsonb(current_row)',
    p_entity, v_columns, p_entity, p_entity, p_entity, v_select, v_updates
  );
  execute v_sql into v_result using v_payload;

  if v_result is not null then
    v_applied := true;
    return jsonb_build_object('applied', v_applied, 'record', v_result, 'duplicate', false);
  end if;

  -- A newer server row won. Persist a server-side correction audit entry.
  v_sql := format('select to_jsonb(t) from public.%I t where t.id = $1 and t.company_id = $2', p_entity);
  execute v_sql into v_result using v_record_id, v_company_id;
  if v_result is null then
    raise exception 'Sync upsert returned no row.' using errcode = '23514';
  end if;

  insert into public.correction_logs (
    company_id, actor_user_id, table_name, record_id,
    conflict_resolution, previous_data, accepted_data
  ) values (
    v_company_id, auth.uid(), p_entity, v_record_id,
    'server_wins_newer_updated_at', v_payload, v_result
  );

  return jsonb_build_object('applied', false, 'record', v_result, 'duplicate', false);
end;
$$;

revoke all on function public.sync_apply_record(text, jsonb) from public, anon;
grant execute on function public.sync_apply_record(text, jsonb) to authenticated;

-- Sync readers can inspect correction history only through the existing role policy.
create index if not exists correction_logs_company_table_record_idx
  on public.correction_logs(company_id, table_name, record_id, created_at desc);
