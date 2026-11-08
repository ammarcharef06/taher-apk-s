# Phase 8 — Invoicing and Client Portal

Apply `supabase/migrations/07_phase8_invoicing_portal.sql` after migrations 01–06. The migration is additive and reuses the existing clients, client_access_tokens, client_signatures, archives and private company-archives bucket.

Company Admin/Manager users open Invoices, add/select a client, set a unique invoice number and dates, and add one or more item lines with description, quantity, unit price and TVA. PostgreSQL calculates totals. New invoices are marked sent. Create link generates a random bearer URL; only its SHA-256 digest is stored. Share it privately. Revoke a token by setting revoked_at; set expires_at for expiry.

For Auth-based client access, create a Supabase Auth user and associate its UUID with clients.user_id using an authorized workflow. RLS exposes only that client's invoices, invoice items, payments and archive rows explicitly linked to an invoice. Storage RLS additionally checks that the object path equals the attached archive's storage_path.

The anonymous token portal uses restricted SECURITY DEFINER RPCs and returns only that token client's non-draft invoices. The token is a credential: anyone holding it can view those invoices and submit a signature. Revoke leaked links immediately.

Production limitations to address before launch:
- The existing Pages workflow copies index.html to 404.html for SPA fallback; verify deep-link refresh at /portal/<token> after deployment.
- Invoice entry is online-first and is not yet in Dexie offline sync.
- Payment rows are read-only in the portal; there is no payment-entry UI or cash/bank ledger posting yet. Do not treat these as reconciled accounting postings until ledger integration is implemented and tested.
- Token portal archive downloads are not exposed. Authenticated linked clients can read attached private archive objects under Storage RLS.
- Signatures are PNG data URLs stored in Postgres. This is an electronic acknowledgement, not a qualified digital signature. Obtain jurisdiction-specific legal review for consent, identity proofing, timestamping, integrity and retention.
- Test with multiple companies, linked/unlinked client users, expired/revoked tokens, and cross-company invoice/item/payment/archive/storage reads.

Build: `pnpm install --no-frozen-lockfile`, `pnpm --filter @taher/web typecheck`, `pnpm --filter @taher/web build`.
