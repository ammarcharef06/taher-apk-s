export type SyncWinner = "local" | "remote";

export interface SyncVersionedRecord {
  updated_at?: string | null;
  created_at?: string | null;
  _updated_at?: string | null;
}

function timestamp(record: SyncVersionedRecord): number {
  const value = record.updated_at ?? record._updated_at ?? record.created_at ?? "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Deterministic last-write-wins comparison. Equal timestamps prefer the server copy. */
export function chooseSyncWinner(local: SyncVersionedRecord, remote: SyncVersionedRecord): SyncWinner {
  return timestamp(local) > timestamp(remote) ? "local" : "remote";
}

export function syncCursorStart(cursor: string | null, overlapMs = 2000): string | null {
  if (!cursor) return null;
  const parsed = Date.parse(cursor);
  if (!Number.isFinite(parsed)) return null;
  return new Date(Math.max(0, parsed - overlapMs)).toISOString();
}

export function sanitizeSyncPayload(
  entity: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key.startsWith("_") || key === "file_blob" || value === undefined) continue;
    clean[key] = value;
  }
  // amount_ttc is a generated PostgreSQL column; the server calculates it.
  if (entity === "expenses") delete clean.amount_ttc;
  if (entity === "invoice_items") { delete clean.line_subtotal; delete clean.line_tax; }
  if (entity === "invoices") { delete clean.subtotal; delete clean.tax_total; delete clean.total; delete clean.paid_amount; }
  return clean;
}

export const SYNC_ENTITIES = [
  "workers",
  "cash_transactions",
  "cash_opening_balances",
  "wages",
  "wage_payments",
  "advances",
  "social_security_declarations",
  "expenses",
  "archives",
  "clients",
  "invoices",
  "invoice_items",
  "invoice_payments"
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];


/** Read-only pull allow-list. Write permissions remain enforced by the server RPC/RLS. */
export function allowedSyncPullEntities(role: string): SyncEntity[] {
  if (role === "company_admin" || role === "manager" || role === "super_admin") {
    return [...SYNC_ENTITIES];
  }
  if (role === "accountant") {
    return [
      "workers", "cash_transactions", "wages", "wage_payments", "advances",
      "social_security_declarations", "expenses", "archives",
      "clients", "invoices", "invoice_items", "invoice_payments"
    ];
  }
  if (role === "data_entry") {
    return [
      "workers", "cash_transactions", "advances", "expenses", "archives",
      "clients", "invoices", "invoice_items", "invoice_payments"
    ];
  }
  return [];
}
