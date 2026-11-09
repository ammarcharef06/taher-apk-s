# Phase 5 — Offline-first Sync Engine

## Apply the database migration

Apply `supabase/migrations/06_phase5_sync_engine.sql` after migrations 01–05. Do not edit or re-run the earlier migrations.

The migration:
- Adds company-scoped cursor indexes, including tombstone rows.
- Creates `public.sync_apply_record(text, jsonb)`, an authenticated RPC with a strict entity allowlist and per-role checks.
- Performs an atomic upsert with deterministic last-write-wins handling.
- Keeps `wage_payments` append-only and idempotent.
- Writes server-side conflict decisions to `correction_logs`.

The RPC is called with the Supabase user session. Never call it with a service-role key from the client.

## Local data flow

1. Existing repositories write business data to Dexie and append an item to `syncQueue` in the same local transaction.
2. The engine coalesces multiple queued snapshots for the same entity/record and pushes the newest snapshot.
3. Server responses are reconciled back into Dexie; server-generated archive IDs are matched by `(company_id, source_table, source_id)`.
4. Pull reads each role-authorized entity in stable pages of 500 rows, using a per-company/per-entity cursor with a two-second overlap.
5. Tombstones are pulled like ordinary updates because the cursor indexes include deleted rows.
6. Archive Blobs remain in IndexedDB. The engine uploads pending files to the existing private `company-archives` bucket, then pushes their storage metadata through the normal queue.

## Conflict policy

- Newer local timestamp: keep the local snapshot queued for the next push.
- Newer server timestamp: accept the server row and clear stale queued snapshots.
- Equal timestamps: server wins.
- Wage payments are immutable events: repeated IDs are ignored by the server, so retrying an interrupted push cannot create a second payment.

The engine stores local conflict details in Dexie `correctionLogs`; server-side push conflicts are also written to PostgreSQL `correction_logs`.

## Connectivity and retries

- Initial synchronization starts when an authenticated company is available.
- Browser `online`, window focus, and visibility changes trigger another sync.
- Manual synchronization is available in the application header.
- Failed queue entries remain locally stored with retry count and error text. They are retried on the next synchronization attempt.
- A stale `processing` marker is reset to `pending` on the next run.

## Verification

Run:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Test at minimum: first full pull, offline create/update/delete (soft delete), reconnect push, second-device pull, concurrent edits in both directions, interrupted/retried push, role-restricted sync, and offline archive attachment upload.

## Phase 8 invoice entities

Migration 08 (applied after migration 07) extends the allow-listed sync endpoint for clients, invoices and invoice_items. Invoice items are append-only sync events because the server calculates their generated line totals and recalculates the parent invoice after each accepted insert. Invoice payments are also append-only, but use the dedicated sync_apply_invoice_payment RPC rather than sync_apply_record.

Dexie version 5 stores invoice headers, item rows and payments locally. Existing clients storage is reused and is now part of the sync table map. Push ordering is clients → invoices → invoice_items → invoice_payments. A cash invoice payment is committed locally with a linked cash-box income movement; on reconnect the dedicated RPC inserts both rows atomically and idempotently. Bank payments do not affect the physical cash-box balance.

Apply migrations 07 and 08 to Supabase before deploying a build that includes Phase 8 invoice synchronization. See docs/PHASE-8-CLIENT-PORTAL.md for the invoice/payment acceptance checks.
