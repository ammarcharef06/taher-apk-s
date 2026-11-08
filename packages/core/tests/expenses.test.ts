import { describe, expect, it } from "vitest";
import { calculateExpenseTotals, filterExpenses, validateExpenseInput, type ExpenseRecord } from "../src/expenses";
const input = { expense_date:"2026-11-08", expense_type:"مواد بناء", supplier:"المورد", invoice_number:null, amount_ht:100, tax_amount:19, payment_method:"cash" as const, notes:null };
describe("expenses", () => {
  it("normalizes and calculates HT/TVA/TTc", () => {
    const value = validateExpenseInput(input);
    expect(value.amount_ht + value.tax_amount).toBe(119);
  });
  it("rejects invalid dates and negative amounts", () => {
    expect(() => validateExpenseInput({...input, expense_date:"2026-02-30"})).toThrow();
    expect(() => validateExpenseInput({...input, amount_ht:-1})).toThrow();
  });
  it("filters and totals active records", () => {
    const rows = [{...input,id:"1",company_id:"c",amount_ttc:119,created_by:null,created_at:"2026-11-08",updated_at:"2026-11-08",deleted_at:null}] as ExpenseRecord[];
    expect(filterExpenses(rows,{paymentMethod:"cash"})).toHaveLength(1);
    expect(calculateExpenseTotals(rows).amount_ttc).toBe(119);
  });
});
