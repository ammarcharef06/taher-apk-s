import { describe, expect, it } from "vitest";
import { chooseSyncWinner, sanitizeSyncPayload, syncCursorStart, SYNC_ENTITIES } from "../src/sync";

describe("sync helpers", () => {
  it("keeps newer local edits and otherwise accepts server version", () => {
    expect(chooseSyncWinner(
      { _updated_at: "2026-01-02T00:00:00.000Z" },
      { updated_at: "2026-01-01T00:00:00.000Z" }
    )).toBe("local");
    expect(chooseSyncWinner(
      { _updated_at: "2026-01-01T00:00:00.000Z" },
      { updated_at: "2026-01-02T00:00:00.000Z" }
    )).toBe("remote");
  });

  it("overlaps pull cursors to avoid losing same-time changes", () => {
    expect(syncCursorStart("2026-01-01T00:00:02.000Z")).toBe("2026-01-01T00:00:00.000Z");
    expect(syncCursorStart(null)).toBeNull();
  });

  it("registers company-scoped invoicing entities for sync", () => {
    expect(SYNC_ENTITIES).toContain("clients");
    expect(SYNC_ENTITIES).toContain("invoices");
    expect(SYNC_ENTITIES).toContain("invoice_items");
    expect(SYNC_ENTITIES).toContain("invoice_payments");
  });

  it("removes generated invoice values before pushing to PostgreSQL", () => {
    expect(sanitizeSyncPayload("invoices", {
      id: "invoice-1", company_id: "company-1", total: 120, subtotal: 100,
      tax_total: 20, paid_amount: 40, updated_at: "2026-11-09T00:00:00.000Z"
    })).toEqual({
      id: "invoice-1", company_id: "company-1", updated_at: "2026-11-09T00:00:00.000Z"
    });
    expect(sanitizeSyncPayload("invoice_items", {
      id: "item-1", line_subtotal: 100, line_tax: 19, quantity: 1, unit_price: 100
    })).toEqual({ id: "item-1", quantity: 1, unit_price: 100 });
  });

  it("removes local-only metadata and generated expense totals", () => {
    expect(sanitizeSyncPayload("expenses", {
      id: "x", amount_ht: 10, tax_amount: 2, amount_ttc: 12,
      _synced: 0, _updated_at: "now", file_blob: new Blob()
    })).toEqual({ id: "x", amount_ht: 10, tax_amount: 2 });
  });
});
