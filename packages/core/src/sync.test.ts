import { describe, expect, it } from "vitest";
import { allowedSyncPullEntities, sanitizeSyncPayload } from "./sync";

describe("allowedSyncPullEntities", () => {
  it("allows accountants to pull cash transactions without granting write permissions", () => {
    const entities = allowedSyncPullEntities("accountant");
    expect(entities).toContain("cash_transactions");
    expect(entities).not.toContain("cash_opening_balances");
  });

  it("keeps data-entry pull scope limited to operational entities", () => {
    const entities = allowedSyncPullEntities("data_entry");
    expect(entities).toContain("cash_transactions");
    expect(entities).not.toContain("wages");
    expect(entities).not.toContain("cash_opening_balances");
  });

  it("allows managers and company admins to pull all sync entities", () => {
    expect(allowedSyncPullEntities("manager")).toHaveLength(13);
    expect(allowedSyncPullEntities("company_admin")).toHaveLength(13);
  });

  it("returns no sync entities for unknown and client roles", () => {
    expect(allowedSyncPullEntities("client")).toEqual([]);
    expect(allowedSyncPullEntities("unknown")).toEqual([]);
  });
});

describe("sanitizeSyncPayload", () => {
  it("removes local-only metadata and generated financial fields", () => {
    const clean = sanitizeSyncPayload("invoices", {
      id: "invoice-1",
      company_id: "company-1",
      _synced: 0,
      _updated_at: "2026-01-01T00:00:00.000Z",
      file_blob: new Blob(["private"]),
      subtotal: 100,
      tax_total: 19,
      total: 119,
      paid_amount: 20
    });
    expect(clean).toEqual({ id: "invoice-1", company_id: "company-1" });
  });

  it("does not mutate the original payload", () => {
    const input = { id: "expense-1", amount_ttc: 119, _synced: 0 };
    sanitizeSyncPayload("expenses", input);
    expect(input).toEqual({ id: "expense-1", amount_ttc: 119, _synced: 0 });
  });
});
