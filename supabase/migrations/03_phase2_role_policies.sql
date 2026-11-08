-- Phase 2 role restrictions.
-- This is a new migration so an already-applied Phase 1 migration is not edited.

drop policy if exists workers_read_company on public.workers;
create policy workers_read_company
on public.workers for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager']::public.app_role[]
  )
);

drop policy if exists cash_transactions_read_company on public.cash_transactions;
create policy cash_transactions_read_company
on public.cash_transactions for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager', 'data_entry']::public.app_role[]
  )
);

drop policy if exists cash_opening_balances_read_company on public.cash_opening_balances;
create policy cash_opening_balances_read_company
on public.cash_opening_balances for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['company_admin', 'manager']::public.app_role[]
  )
);
