-- Phase 4: expense cash linkage and archive file metadata.
-- Existing applied migrations and the private company-archives bucket are preserved.

alter table public.expenses
  add column if not exists cash_transaction_id uuid;

alter table public.archives
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_cash_transaction_company_fk') then
    alter table public.expenses
      add constraint expenses_cash_transaction_company_fk
      foreign key (company_id, cash_transaction_id)
      references public.cash_transactions(company_id, id)
      on delete restrict;
  end if;
end $$;

do $
begin
  if not exists (select 1 from pg_constraint where conname = 'archives_file_metadata_check') then
    alter table public.archives
      add constraint archives_file_metadata_check
      check (
        (file_size is null or file_size between 0 and 15728640)
        and (mime_type is null or mime_type in ('application/pdf','image/jpeg','image/png','image/webp'))
      );
  end if;
end $$;

create index if not exists expenses_company_payment_date_idx
  on public.expenses(company_id, payment_method, expense_date desc)
  where deleted_at is null;

create index if not exists archives_company_delivery_date_idx
  on public.archives(company_id, delivered_to_accountant, document_date desc)
  where deleted_at is null;

create index if not exists archives_company_source_idx
  on public.archives(company_id, source_table, source_id)
  where deleted_at is null;

-- The expense workflow creates a matching archive entry locally.
drop policy if exists archives_insert_admin_manager on public.archives;
create policy archives_insert_admin_manager
on public.archives for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
);

-- Data-entry users may attach documents to expense/archive records they create.
drop policy if exists archives_update_admin_manager on public.archives;
create policy archives_update_admin_manager
on public.archives for update to authenticated
using (
  public.has_company_role(company_id, array['company_admin', 'manager', 'data_entry']::public.app_role[])
)
with check (
  public.has_company_role(company_id, array['company_admin', 'manager', 'data_entry']::public.app_role[])
);

drop policy if exists company_archives_update on storage.objects;
create policy company_archives_update
on storage.objects for update to authenticated
using (
  bucket_id = 'company-archives'
  and public.has_company_role(
    public.storage_object_company_id(name),
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
)
with check (
  bucket_id = 'company-archives'
  and public.has_company_role(
    public.storage_object_company_id(name),
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
);
