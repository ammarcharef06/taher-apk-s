import { describe, expect, it } from "vitest";
import {
  calculateWageAmounts,
  calculateWageOutstanding,
  getPreviousWageCarryForward,
  validateWageInput,
  type WageInput,
  type WageRecord
} from "../src/wages";

const input = (overrides: Partial<WageInput> = {}): WageInput => ({
  wage_month: "2025-03-01",
  work_days: 22,
  daily_rate: 2500,
  overtime_hours: 4,
  overtime_amount: 500,
  bonuses: 250,
  deductions: 100,
  advances_deducted: 300,
  notes: null,
  ...overrides
});

const record = (overrides: Partial<WageRecord> = {}): WageRecord => ({
  ...input(),
  id: "wage-1",
  company_id: "company-1",
  worker_id: "worker-1",
  base_amount: 55000,
  gross_amount: 55750,
  carried_balance: 0,
  net_due: 55350,
  paid_amount: 0,
  outstanding_amount: 55350,
  receipt_number: null,
  created_by: null,
  created_at: "2025-03-01T10:00:00.000Z",
  updated_at: "2025-03-01T10:00:00.000Z",
  deleted_at: null,
  ...overrides
});

describe("wage business logic", () => {
  it("calculates base pay, gross pay, deductions and net due", () => {
    expect(calculateWageAmounts(input(), 1000, 20000)).toEqual({
      base_amount: 55000,
      gross_amount: 55750,
      deductions: 100,
      advances_deducted: 300,
      carried_balance: 1000,
      net_due: 56350,
      paid_amount: 20000,
      outstanding_amount: 36350
    });
  });

  it("rejects a month that does not start on day one", () => {
    expect(() => validateWageInput(input({ wage_month: "2025-03-02" }))).toThrow("أول يوم");
  });

  it("rejects deductions that exceed earnings and carry-forward", () => {
    expect(() =>
      calculateWageAmounts(
        input({ work_days: 0, overtime_amount: 0, bonuses: 0, deductions: 800 }),
        0,
        0
      )
    ).toThrow("إجمالي الاقتطاعات والتسبيقات يتجاوز");
  });

  it("limits paid amount to net due", () => {
    expect(() => calculateWageAmounts(input(), 0, 999999)).toThrow("يتجاوز صافي المستحق");
    expect(calculateWageOutstanding(1000, 300)).toBe(700);
  });

  it("carries forward the remaining amount from the most recent earlier wage", () => {
    const wages = [
      record({ wage_month: "2025-01-01", net_due: 1000, paid_amount: 200 }),
      record({ id: "wage-2", wage_month: "2025-02-01", net_due: 1500, paid_amount: 900 })
    ];

    expect(getPreviousWageCarryForward(wages, "2025-03-01")).toBe(600);
    expect(getPreviousWageCarryForward(wages, "2025-01-01")).toBe(0);
  });
});
