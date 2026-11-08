import { describe, expect, it } from "vitest";
import { chooseSyncWinner, sanitizeSyncPayload, syncCursorStart } from "../src/sync";

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

  it("removes local-only metadata and generated expense totals", () => {
    expect(sanitizeSyncPayload("expenses", {
      id: "x", amount_ht: 10, tax_amount: 2, amount_ttc: 12,
      _synced: 0, _updated_at: "now", file_blob: new Blob()
    })).toEqual({ id: "x", amount_ht: 10, tax_amount: 2 });
  });
});
