import { describe, expect, it } from "vitest";
import {
  calculateAdvanceBalance,
  filterAdvances,
  validateAdvanceInput,
  type AdvanceRecord
} from "../src/advances";

const advance = (overrides: Partial<AdvanceRecord> = {}): AdvanceRecord => ({
  id: "advance-1",
  company_id: "company-1",
  worker_id: "worker-1",
  movement_date: "2025-03-01",
  advance_type: "advance_issued",
  amount: 1000,
  description: "تسبيق",
  document_number: null,
  created_by: null,
  created_at: "2025-03-01T10:00:00.000Z",
  updated_at: "2025-03-01T10:00:00.000Z",
  deleted_at: null,
  ...overrides
});

describe("advance business logic", () => {
  it("calculates amounts due, repaid and outstanding", () => {
    const result = calculateAdvanceBalance([
      advance(),
      advance({ id: "advance-2", advance_type: "purchase_expense", amount: 250 }),
      advance({ id: "advance-3", advance_type: "repayment", amount: 300 })
    ], [{ advances_deducted: 200, deleted_at: null }]);

    expect(result).toEqual({
      totalIssued: 1250,
      totalRepaid: 500,
      outstanding: 750
    });
  });

  it("rejects a repayment greater than the outstanding amount", () => {
    expect(() =>
      calculateAdvanceBalance([
        advance({ amount: 300 }),
        advance({ id: "repayment", advance_type: "repayment", amount: 400 })
      ])
    ).toThrow("يتجاوز إجمالي التسبيقات");
  });

  it("validates advance movement and positive amount", () => {
    expect(validateAdvanceInput({
      worker_id: "worker-1",
      movement_date: "2025-03-01",
      advance_type: "repayment",
      amount: 100.129,
      description: " سداد ",
      document_number: null
    }).amount).toBe(100.13);

    expect(() => validateAdvanceInput({
      worker_id: "worker-1",
      movement_date: "2025-03-01",
      advance_type: "repayment",
      amount: 0,
      description: null,
      document_number: null
    })).toThrow("أكبر من صفر");
  });

  it("filters records and excludes soft-deleted movements", () => {
    const records = [
      advance(),
      advance({ id: "repayment", advance_type: "repayment", description: "سداد" }),
      advance({ id: "deleted", deleted_at: "2025-03-02T00:00:00.000Z" })
    ];
    expect(filterAdvances(records, { type: "repayment" })).toHaveLength(1);
    expect(filterAdvances(records, { search: "سداد" })).toHaveLength(1);
  });
});
