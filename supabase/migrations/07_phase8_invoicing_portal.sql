-- Phase 8: standalone invoicing, client-scoped access and token portal.
-- Additive only: existing clients, client_access_tokens, client_signatures and archives are reused.
begin;

create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null,
 invoice_number text not null,
 issue_date date not null default current_date,
 due_date date,
 currency_code varchar(3) not null default 'DZD' check(currency_code ~ '^[A-Z]{3}$'),
 status text not null default 'draft' check(status in ('draft','sent','partial','paid','overdue','cancelled')),
 subtotal numeric(14,2) not null default 0 check(subtotal>=0),
 tax_total numeric(14,2) not null default 0 check(tax_total>=0),
 total numeric(14,2) not null default 0 check(total>=0),
 paid_amount numeric(14,2) not null default 0 check(paid_amount>=0 and paid_amount<=total),
 notes text,
 archive_id uuid,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 constraint invoices_company_client_fk foreign key(company_id,client_id) references public.clients(company_id,id) on delete restrict,
 constraint invoices_company_archive_fk foreign key(company_id,archive_id) references public.archives(company_id,id) on delete restrict,
 constraint invoices_company_number_unique unique(company_id,invoice_number),
 constraint invoices_company_id_id_unique unique(company_id,id)
);

create table if not exists public.invoice_items (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 invoice_id uuid not null,
 description text not null check(length(trim(description)) between 1 and 500),
 quantity numeric(14,3) not null check(quantity>0),
 unit_price numeric(14,2) not null check(unit_price>=0),
 tva_rate numeric(5,2) not null default 0 check(tva_rate between 0 and 100),
 line_subtotal numeric(14,2) generated always as(round(quantity*unit_price,2)) stored,
 line_tax numeric(14,2) generated always as(round(quantity*unit_price*tva_rate/100,2)) stored,
 created_at timestamptz not null default now(),
 constraint invoice_items_company_invoice_fk foreign key(company_id,invoice_id) references public.invoices(company_id,id) on delete cascade
);

create table if not exists public.invoice_payments (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 invoice_id uuid not null,
 payment_date date not null default current_date,
 amount numeric(14,2) not null check(amount>0),
 payment_method public.payment_method not null check(payment_method in ('cash','bank')),
 reference text, notes text,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint invoice_payments_company_invoice_fk foreign key(company_id,invoice_id) references public.invoices(company_id,id) on delete restrict
);

alter table public.client_signatures add column if not exists invoice_id uuid;
alter table public.client_signatures add column if not exists signature_data_url text;
do $$ begin
 alter table public.client_signatures add constraint client_signatures_company_invoice_fk
 foreign key(company_id,invoice_id) references public.invoices(company_id,id) on delete restrict;
exception when duplicate_object then null; end $$;

create index if not exists invoices_company_client_date_idx on public.invoices(company_id,client_id,issue_date desc) where deleted_at is null;
create index if not exists invoices_company_status_date_idx on public.invoices(company_id,status,issue_date desc) where deleted_at is null;
create index if not exists invoice_items_company_invoice_idx on public.invoice_items(company_id,invoice_id);
create index if not exists invoice_payments_company_invoice_date_idx on public.invoice_payments(company_id,invoice_id,payment_date desc);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
grant select,insert,update,delete on public.invoices,public.invoice_items to authenticated;
grant select,insert on public.invoice_payments to authenticated;
revoke update,delete on public.invoice_payments from authenticated;

create policy invoices_read_company_or_client on public.invoices for select to authenticated using (
 public.has_company_role(company_id,array['company_admin','manager','accountant','data_entry']::public.app_role[])
 or exists(select 1 from public.clients c where c.id=client_id and c.company_id=invoices.company_id and c.user_id=auth.uid())
);
create policy invoices_manage_admin_manager on public.invoices for all to authenticated
 using(public.has_company_role(company_id,array['company_admin','manager']::public.app_role[]))
 with check(public.has_company_role(company_id,array['company_admin','manager']::public.app_role[]));

create policy invoice_items_read_company_or_client on public.invoice_items for select to authenticated using (
 public.has_company_role(company_id,array['company_admin','manager','accountant','data_entry']::public.app_role[])
 or exists(select 1 from public.invoices i join public.clients c on c.id=i.client_id and c.company_id=i.company_id
  where i.id=invoice_id and i.company_id=invoice_items.company_id and c.user_id=auth.uid())
);
create policy invoice_items_manage_admin_manager on public.invoice_items for all to authenticated
 using(public.has_company_role(company_id,array['company_admin','manager']::public.app_role[]))
 with check(public.has_company_role(company_id,array['company_admin','manager']::public.app_role[]));

create policy invoice_payments_read_company_or_client on public.invoice_payments for select to authenticated using (
 public.has_company_role(company_id,array['company_admin','manager','accountant','data_entry']::public.app_role[])
 or exists(select 1 from public.invoices i join public.clients c on c.id=i.client_id and c.company_id=i.company_id
  where i.id=invoice_id and i.company_id=invoice_payments.company_id and c.user_id=auth.uid())
);
create policy invoice_payments_insert_admin_manager on public.invoice_payments for insert to authenticated
 with check(public.has_company_role(company_id,array['company_admin','manager']::public.app_role[]));

-- Preserve employee access and additionally expose only archives explicitly linked to the client's invoices.
drop policy if exists archives_read_company on public.archives;
create policy archives_read_company on public.archives for select to authenticated using (
 public.has_company_role(company_id,array['company_admin','manager','accountant','data_entry']::public.app_role[])
 or exists(select 1 from public.invoices i join public.clients c on c.id=i.client_id and c.company_id=i.company_id
  where i.archive_id=archives.id and i.company_id=archives.company_id and c.user_id=auth.uid())
);
drop policy if exists company_archives_read on storage.objects;
create policy company_archives_read on storage.objects for select to authenticated using (
 bucket_id='company-archives' and (
  public.has_company_role(public.storage_object_company_id(name),array['company_admin','manager','accountant','data_entry']::public.app_role[])
  or exists(select 1 from public.archives a join public.invoices i on i.company_id=a.company_id and i.archive_id=a.id
   join public.clients c on c.company_id=i.company_id and c.id=i.client_id
   where a.company_id=public.storage_object_company_id(name) and a.storage_path=name and c.user_id=auth.uid())
 )
);

create or replace function public.recalculate_invoice(p_company_id uuid,p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_sub numeric(14,2); v_tax numeric(14,2); v_paid numeric(14,2);
begin
 if not public.has_company_role(p_company_id,array['company_admin','manager']::public.app_role[]) then raise exception 'Insufficient invoice permissions.' using errcode='42501'; end if;
 select coalesce(sum(line_subtotal),0),coalesce(sum(line_tax),0) into v_sub,v_tax from public.invoice_items where company_id=p_company_id and invoice_id=p_invoice_id;
 select coalesce(sum(amount),0) into v_paid from public.invoice_payments where company_id=p_company_id and invoice_id=p_invoice_id;
 update public.invoices set subtotal=v_sub,tax_total=v_tax,total=v_sub+v_tax,paid_amount=least(v_paid,v_sub+v_tax),
 status=case when status='cancelled' then 'cancelled' when v_paid>=v_sub+v_tax and v_sub+v_tax>0 then 'paid' when v_paid>0 then 'partial' when status='draft' then 'draft' else 'sent' end,updated_at=now()
 where company_id=p_company_id and id=p_invoice_id;
end $$;

create or replace function public.create_invoice(p_company_id uuid,p_client_id uuid,p_invoice_number text,p_issue_date date,p_due_date date,p_currency_code varchar(3),p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_item jsonb;
begin
 if not public.has_company_role(p_company_id,array['company_admin','manager']::public.app_role[]) then raise exception 'Insufficient invoice permissions.' using errcode='42501'; end if;
 if not exists(select 1 from public.clients where id=p_client_id and company_id=p_company_id and deleted_at is null) then raise exception 'Client not found.' using errcode='23503'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one item is required.' using errcode='22023'; end if;
 insert into public.invoices(company_id,client_id,invoice_number,issue_date,due_date,currency_code,notes,created_by)
 values(p_company_id,p_client_id,trim(p_invoice_number),p_issue_date,p_due_date,upper(p_currency_code),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  insert into public.invoice_items(company_id,invoice_id,description,quantity,unit_price,tva_rate)
  values(p_company_id,v_id,trim(v_item->>'description'),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce((v_item->>'tva_rate')::numeric,0));
 end loop;
 perform public.recalculate_invoice(p_company_id,v_id); return v_id;
end $$;

create or replace function public.issue_client_portal_token(p_company_id uuid,p_client_id uuid,p_expires_at timestamptz default null)
returns text language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_token text:=encode(gen_random_bytes(32),'hex');
begin
 if not public.has_company_role(p_company_id,array['company_admin','manager']::public.app_role[]) then raise exception 'Insufficient portal permissions.' using errcode='42501'; end if;
 if not exists(select 1 from public.clients where id=p_client_id and company_id=p_company_id and deleted_at is null) then raise exception 'Client not found.' using errcode='23503'; end if;
 insert into public.client_access_tokens(company_id,client_id,token_hash,expires_at) values(p_company_id,p_client_id,encode(digest(v_token,'sha256'),'hex'),p_expires_at);
 return v_token;
end $$;

create or replace function public.client_portal_get(p_token text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_client uuid; v_company uuid; v_out jsonb;
begin
 select client_id,company_id into v_client,v_company from public.client_access_tokens
 where token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex') and revoked_at is null and deleted_at is null and (expires_at is null or expires_at>now());
 if v_client is null then raise exception 'Invalid or expired portal link.' using errcode='28000'; end if;
 select jsonb_build_object('client',jsonb_build_object('id',c.id,'name',c.name,'email',c.email),
 'company',jsonb_build_object('name',co.name,'currency_code',co.currency_code),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'issue_date',i.issue_date,'due_date',i.due_date,'status',i.status,'subtotal',i.subtotal,'tax_total',i.tax_total,'total',i.total,'paid_amount',i.paid_amount,'notes',i.notes,
 'items',(select coalesce(jsonb_agg(jsonb_build_object('description',x.description,'quantity',x.quantity,'unit_price',x.unit_price,'tva_rate',x.tva_rate,'line_subtotal',x.line_subtotal,'line_tax',x.line_tax)),'[]'::jsonb) from public.invoice_items x where x.company_id=i.company_id and x.invoice_id=i.id),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('payment_date',p.payment_date,'amount',p.amount,'payment_method',p.payment_method,'reference',p.reference)),'[]'::jsonb) from public.invoice_payments p where p.company_id=i.company_id and p.invoice_id=i.id),
 'signed',exists(select 1 from public.client_signatures s where s.company_id=i.company_id and s.invoice_id=i.id and s.deleted_at is null)
 ) order by i.issue_date desc) from public.invoices i where i.company_id=v_company and i.client_id=v_client and i.deleted_at is null and i.status<>'draft'),'[]'::jsonb))
 into v_out from public.clients c join public.companies co on co.id=c.company_id where c.id=v_client and c.company_id=v_company;
 return v_out;
end $$;

create or replace function public.client_portal_sign(p_token text,p_invoice_id uuid,p_signer_name text,p_signature_data_url text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_client uuid; v_company uuid; v_id uuid;
begin
 select client_id,company_id into v_client,v_company from public.client_access_tokens where token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex') and revoked_at is null and deleted_at is null and (expires_at is null or expires_at>now());
 if v_client is null then raise exception 'Invalid or expired portal link.' using errcode='28000'; end if;
 if length(trim(coalesce(p_signer_name,'')))<2 or length(coalesce(p_signature_data_url,''))>2000000 or p_signature_data_url !~ '^data:image/png;base64,' then raise exception 'Invalid signature.' using errcode='22023'; end if;
 if not exists(select 1 from public.invoices where id=p_invoice_id and company_id=v_company and client_id=v_client and status not in ('draft','cancelled')) then raise exception 'Invoice not available for signing.' using errcode='42501'; end if;
 insert into public.client_signatures(company_id,client_id,invoice_id,signer_name,signature_data_url) values(v_company,v_client,p_invoice_id,trim(p_signer_name),p_signature_data_url) returning id into v_id;
 return v_id;
end $$;

revoke all on function public.recalculate_invoice(uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_invoice(uuid,uuid,text,date,date,varchar,text,jsonb) from public,anon;
revoke all on function public.issue_client_portal_token(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.client_portal_get(text) from public,authenticated;
revoke all on function public.client_portal_sign(text,uuid,text,text) from public,authenticated;
grant execute on function public.create_invoice(uuid,uuid,text,date,date,varchar,text,jsonb) to authenticated;
grant execute on function public.issue_client_portal_token(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.client_portal_get(text) to anon,authenticated;
grant execute on function public.client_portal_sign(text,uuid,text,text) to anon,authenticated;
commit;
