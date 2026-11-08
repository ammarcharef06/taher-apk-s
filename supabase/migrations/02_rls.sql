-- Taher Accounting NG: row-level security and storage access.
-- Apply after 01_schema.sql.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_super_admin = true
  );
$$;

create or replace function public.has_company_role(
  p_company_id uuid,
  p_allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.deleted_at is null
        and m.role = any(p_allowed_roles)
    );
$$;

create or replace function public.storage_object_company_id(p_object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, storage, pg_temp
as $$
declare
  v_folder text;
begin
  v_folder := (storage.foldername(p_object_name))[1];
  if v_folder is null then
    return null;
  end if;
  return v_folder::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.has_company_role(uuid, public.app_role[]) from public;
revoke all on function public.storage_object_company_id(text) from public;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_company_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.storage_object_company_id(text) to authenticated;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.clients enable row level security;
alter table public.workers enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.cash_opening_balances enable row level security;
alter table public.wages enable row level security;
alter table public.advances enable row level security;
alter table public.social_security_declarations enable row level security;
alter table public.expenses enable row level security;
alter table public.archives enable row level security;
alter table public.audit_logs enable row level security;
alter table public.correction_logs enable row level security;
alter table public.client_access_tokens enable row level security;
alter table public.client_signatures enable row level security;

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

create policy companies_read_members
on public.companies for select to authenticated
using (
  public.is_super_admin()
  or public.has_company_role(
    id,
    array['company_admin', 'manager', 'accountant', 'data_entry', 'client']::public.app_role[]
  )
);

create policy companies_update_admin
on public.companies for update to authenticated
using (public.has_company_role(id, array['company_admin']::public.app_role[]))
with check (public.has_company_role(id, array['company_admin']::public.app_role[]));

create policy profiles_read_self_or_super_admin
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_super_admin());

create policy profiles_update_self
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy memberships_read_self_or_company_admin
on public.company_memberships for select to authenticated
using (
  public.is_super_admin()
  or user_id = auth.uid()
  or public.has_company_role(company_id, array['company_admin']::public.app_role[])
);

create policy memberships_insert_company_admin
on public.company_memberships for insert to authenticated
with check (
  role <> 'super_admin'
  and (
    public.is_super_admin()
    or public.has_company_role(company_id, array['company_admin']::public.app_role[])
  )
);

create policy memberships_update_company_admin
on public.company_memberships for update to authenticated
using (
  public.is_super_admin()
  or public.has_company_role(company_id, array['company_admin']::public.app_role[])
)
with check (
  role <> 'super_admin'
  and (
    public.is_super_admin()
    or public.has_company_role(company_id, array['company_admin']::public.app_role[])
  )
);

create policy memberships_delete_company_admin
on public.company_memberships for delete to authenticated
using (
  public.is_super_admin()
  or public.has_company_role(company_id, array['company_admin']::public.app_role[])
);

create policy clients_read_company_or_self
on public.clients for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
  or user_id = auth.uid()
);

create policy clients_insert_admin_manager
on public.clients for insert to authenticated
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy clients_update_admin_manager
on public.clients for update to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy clients_delete_admin
on public.clients for delete to authenticated
using (public.has_company_role(company_id, array['company_admin']::public.app_role[]));

create policy workers_read_company
on public.workers for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
);

create policy workers_insert_admin_manager
on public.workers for insert to authenticated
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy workers_update_admin_manager
on public.workers for update to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy workers_delete_admin_manager
on public.workers for delete to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy cash_transactions_read_company
on public.cash_transactions for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
);

create policy cash_transactions_insert_allowed
on public.cash_transactions for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
);

create policy cash_transactions_update_admin_manager
on public.cash_transactions for update to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy cash_transactions_delete_admin_manager
on public.cash_transactions for delete to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy cash_opening_balances_read_company
on public.cash_opening_balances for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant']::public.app_role[]
  )
);

create policy cash_opening_balances_manage
on public.cash_opening_balances for all to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy wages_read_company
on public.wages for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant']::public.app_role[]
  )
);

create policy wages_manage
on public.wages for all to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy advances_read_company
on public.advances for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
);

create policy advances_insert_allowed
on public.advances for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
);

create policy advances_update_admin_manager
on public.advances for update to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy advances_delete_admin_manager
on public.advances for delete to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy social_security_read_company
on public.social_security_declarations for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant']::public.app_role[]
  )
);

create policy social_security_manage
on public.social_security_declarations for all to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy expenses_read_company
on public.expenses for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
);

create policy expenses_insert_allowed
on public.expenses for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
);

create policy expenses_update_admin_manager
on public.expenses for update to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy expenses_delete_admin_manager
on public.expenses for delete to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy archives_read_company
on public.archives for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
);

create policy archives_insert_admin_manager
on public.archives for insert to authenticated
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy archives_update_admin_manager
on public.archives for update to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy archives_delete_admin
on public.archives for delete to authenticated
using (public.has_company_role(company_id, array['company_admin']::public.app_role[]));

create policy audit_logs_read
on public.audit_logs for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant']::public.app_role[]
  )
);

create policy correction_logs_read
on public.correction_logs for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant']::public.app_role[]
  )
);

create policy correction_logs_insert_admin_manager
on public.correction_logs for insert to authenticated
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy client_tokens_read_admin_manager
on public.client_access_tokens for select to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy client_tokens_insert_admin_manager
on public.client_access_tokens for insert to authenticated
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy client_tokens_update_admin_manager
on public.client_access_tokens for update to authenticated
using (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]))
with check (public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[]));

create policy client_tokens_delete_admin
on public.client_access_tokens for delete to authenticated
using (public.has_company_role(company_id, array['company_admin']::public.app_role[]));

create policy client_signatures_read_company_or_client
on public.client_signatures for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'accountant']::public.app_role[]
  )
  or exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.user_id = auth.uid()
      and c.company_id = client_signatures.company_id
  )
);

create policy client_signatures_insert_client_or_admin
on public.client_signatures for insert to authenticated
with check (
  public.has_company_role(company_id, array['company_admin', 'manager']::public.app_role[])
  or exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.user_id = auth.uid()
      and c.company_id = client_signatures.company_id
  )
);

insert into storage.buckets (id, name, public)
values ('company-archives', 'company-archives', false)
on conflict (id) do update set public = false;

create policy company_archives_read
on storage.objects for select to authenticated
using (
  bucket_id = 'company-archives'
  and public.has_company_role(
    public.storage_object_company_id(name),
    array['company_admin', 'manager', 'accountant', 'data_entry']::public.app_role[]
  )
);

create policy company_archives_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-archives'
  and public.has_company_role(
    public.storage_object_company_id(name),
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
);

create policy company_archives_update
on storage.objects for update to authenticated
using (
  bucket_id = 'company-archives'
  and public.has_company_role(
    public.storage_object_company_id(name),
    array['company_admin', 'manager']::public.app_role[]
  )
)
with check (
  bucket_id = 'company-archives'
  and public.has_company_role(
    public.storage_object_company_id(name),
    array['company_admin', 'manager']::public.app_role[]
  )
);

create policy company_archives_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-archives'
  and public.has_company_role(
    public.storage_object_company_id(name),
    array['company_admin']::public.app_role[]
  )
);
