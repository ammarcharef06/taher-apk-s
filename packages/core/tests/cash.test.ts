import { describe, expect, it } from "vitest";
import {
  buildCashLedger,
  calculateCashBalance,
  filterCashLedger,
  validateCashTransactionInput,
  validateOpeningBalance,
  type CashOpeningBalance,
  type CashTransactionRecord
} from "../src/cash";

const transaction = (
  id: string,
  date: string,
  type: "income" | "expense",
  amount: number,
  description: string
): CashTransactionRecord => ({
  id,
  company_id: "company-1",
  transaction_date: date,
  transaction_type: type,
  description,
  beneficiary: null,
  amount,
  document_number: null,
  notes: null,
  created_by: null,
  created_at: date + "T10:00:00.000Z",
  updated_at: date + "T10:00:00.000Z",
  deleted_at: null
});

const opening = (id: string, date: string, amount: number): CashOpeningBalance => ({
  id,
  company_id: "company-1",
  period_start: date,
  period_end: null,
  opening_amount: amount,
  notes: null,
  created_at: date + "T00:00:00.000Z",
  updated_at: date + "T00:00:00.000Z",
  deleted_at: null
});

describe("cash business logic", () => {
  it("validates an opening balance and rejects an invalid period", () => {
    expect(validateOpeningBalance(-25.256, "2025-03-01")).toBe(-25.26);
    expect(() => validateOpeningBalance(100, "2025-02-30")).toThrow("تاريخ بداية فترة");
  });

  it("validates and rounds cash movements", () => {
    expect(
      validateCashTransactionInput({
        transaction_date: "2025-02-01",
        transaction_type: "income",
        description: " قبض من عميل ",
        beneficiary: " عميل ",
        amount: 120.126,
        document_number: " R-1 ",
        notes: " ملاحظة "
      })
    ).toEqual({
      transaction_date: "2025-02-01",
      transaction_type: "income",
      description: "قبض من عميل",
      beneficiary: "عميل",
      amount: 120.13,
      document_number: "R-1",
      notes: "ملاحظة"
    });
  });

  it("calculates the balance after income and expenses", () => {
    const rows = [
      transaction("1", "2025-01-02", "income", 1000, "دفعة"),
      transaction("2", "2025-01-03", "expense", 250, "شراء")
    ];
    expect(calculateCashBalance([], rows, "2025-01-03")).toBe(750);
  });

  it("uses the latest opening balance not later than the requested date", () => {
    const rows = [
      transaction("1", "2025-01-15", "income", 500, "قبض"),
      transaction("2", "2025-02-03", "expense", 100, "مصروف")
    ];
    expect(
      calculateCashBalance(
        [opening("a", "2025-01-01", 1000), opening("b", "2025-02-01", 2000)],
        rows,
        "2025-02-03"
      )
    ).toBe(1900);
  });


  it("keeps a chronological running balance for multiple movements on one day", () => {
    const sameDayRows = [
      transaction("income", "2025-03-04", "income", 300, "قبض"),
      transaction("expense", "2025-03-04", "expense", 75, "صرف")
    ];
    const ledger = buildCashLedger(sameDayRows, [opening("march", "2025-03-01", 100)]);
    expect(ledger.map((row) => row.balance_after)).toEqual([400, 325]);
  });

  it("builds a cumulative ledger and applies filters", () => {
    const rows = [
      transaction("2", "2025-01-03", "expense", 200, "وقود"),
      transaction("1", "2025-01-02", "income", 500, "مقبوضات")
    ];
    const ledger = buildCashLedger(rows, [opening("a", "2025-01-01", 1000)]);

    expect(ledger.map((row) => row.balance_after)).toEqual([1500, 1300]);
    expect(filterCashLedger(ledger, { search: "وقود" })).toHaveLength(1);
    expect(filterCashLedger(ledger, { type: "income" })).toHaveLength(1);
  });
});
