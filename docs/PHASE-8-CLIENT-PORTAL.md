# Phase 8 — Invoicing, Client Portal and Offline Payments

Apply migrations in numeric order. Migration 07 creates the invoicing/client portal foundation. Migration 08 (supabase/migrations/08_phase8_offline_invoicing.sql) extends the authenticated sync RPC and adds idempotent cash-payment posting. Do not edit or re-run migrations 01–07.

## Invoice and client workflow

Company Admin/Manager users can create clients and invoices while offline. Client rows, invoice headers and invoice item rows are committed to Dexie with their sync-queue entries in the same local transaction. The UI reads these local records first. Sync pushes clients before invoice headers, then invoice items, so the company/client and invoice/item foreign keys are respected. PostgreSQL calculates invoice totals from item rows; local totals are calculated for immediate offline display.

Portal-link issuance remains an online operation because the random bearer token is minted by the server. Keep links private. Tokens default to a 30-day expiry and can be revoked through the existing token record.

## Invoice payments and cash box

Payment entry is offline-first. The local transaction stores the invoice payment and, for a cash payment, one matching cash_transactions income movement. A bank transfer does not change the physical cash-box balance, consistent with the existing wage-payment accounting rule.

On reconnect, invoice payments are sent through public.sync_apply_invoice_payment(jsonb). This SECURITY DEFINER RPC is restricted to company Admin/Manager roles and inserts the cash movement and payment in one PostgreSQL transaction. The payment stores cash_transaction_id; retrying the same payment ID returns the existing payment and linked movement instead of creating duplicates. If either insert fails, both are rolled back. The cash movement also participates in the existing financial archive trigger.

Do not insert invoice payments directly through the generic sync_apply_record RPC. Payments are append-only and must use the dedicated RPC to preserve the cash-linkage invariant.

## Sync entities

Migration 08 extends the allow-listed sync endpoint for clients, invoices and append-only invoice_items. invoice_payments use the dedicated payment RPC. The client sync engine pulls clients, invoices, invoice items and payments for the existing company roles allowed to read them; only Company Admin/Manager roles can push invoice mutations and payments.

Dexie database version 5 adds local invoice, item and payment stores. Existing local client records are reused. The company data-clear operation includes all new stores.

## Security and accounting boundaries

- All sync calls use the authenticated Supabase user session. Never use a service-role key in the client.
- Company IDs and composite foreign keys scope invoice, item, payment and cash rows.
- The public token portal remains read/sign-only; it does not create payments.
- Cash payments create a single cash-box income row. Bank transfers are recorded as payments but do not affect the physical cash box.
- Signature capture remains an electronic acknowledgement, not a qualified digital signature.
- Archive downloads through the anonymous portal are not exposed.

## Verification

```bash
pnpm install --no-frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

Acceptance checks:
1. Create a client and invoice with no network; reload the app and confirm both remain available locally.
2. Reconnect and confirm the client is pushed before the invoice and its item rows; totals are recalculated by PostgreSQL.
3. Record a cash payment offline; verify the local invoice balance and cash-box income movement update together.
4. Reconnect; confirm exactly one invoice payment and exactly one linked cash transaction exist server-side. Retry sync and verify no duplicates.
5. Record a bank payment and verify it changes invoice balance but does not change cash-box balance.
6. Verify a payment above the outstanding invoice balance is rejected locally and by PostgreSQL.
7. Test two devices, concurrent invoice updates, interrupted payment push, company isolation, and role-restricted sync.
8. Test expired/revoked portal links and cross-company invoice/item/payment reads.

Migration 08 must be applied to Supabase before the new client build attempts invoice sync or payment sync. Run the migration in a staging project first and verify the acceptance checks before production rollout.
