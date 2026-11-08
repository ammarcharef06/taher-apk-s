import { describe, expect, it } from "vitest";
import {
  filterWorkers,
  isValidDate,
  normalizeOptionalText,
  roundMoney,
  validateWorkerInput,
  type WorkerRecord
} from "../src/workers";

const worker = (overrides: Partial<WorkerRecord> = {}): WorkerRecord => ({
  id: "worker-1",
  company_id: "company-1",
  full_name: "أحمد",
  phone: null,
  job_title: "نجار",
  start_date: "2025-01-01",
  daily_wage: 2500,
  status: "active",
  notes: null,
  created_at: "2025-01-01T08:00:00.000Z",
  updated_at: "2025-01-01T08:00:00.000Z",
  deleted_at: null,
  ...overrides
});

describe("worker business logic", () => {
  it("normalizes optional text consistently", () => {
    expect(normalizeOptionalText("  وصف  ")).toBe("وصف");
    expect(normalizeOptionalText("   ")).toBeNull();
    expect(normalizeOptionalText(null)).toBeNull();
  });

  it("rounds currency to two decimal places", () => {
    expect(roundMoney(10.125)).toBe(10.13);
    expect(roundMoney(10)).toBe(10);
  });

  it("validates ISO calendar dates", () => {
    expect(isValidDate("2025-02-28")).toBe(true);
    expect(isValidDate("2025-02-30")).toBe(false);
    expect(isValidDate("28-02-2025")).toBe(false);
  });

  it("normalizes and validates a valid worker", () => {
    expect(
      validateWorkerInput({
        full_name: "  أحمد بن سالم ",
        phone: " 0550000000 ",
        job_title: " نجار ",
        start_date: "2025-02-01",
        daily_wage: 2500.129,
        status: "active",
        notes: " عامل دائم "
      })
    ).toEqual({
      full_name: "أحمد بن سالم",
      phone: "0550000000",
      job_title: "نجار",
      start_date: "2025-02-01",
      daily_wage: 2500.13,
      status: "active",
      notes: "عامل دائم"
    });
  });

  it("rejects a negative daily wage", () => {
    expect(() =>
      validateWorkerInput({
        full_name: "أحمد",
        phone: null,
        job_title: null,
        start_date: "2025-01-01",
        daily_wage: -1,
        status: "active",
        notes: null
      })
    ).toThrow("الأجر اليومي");
  });

  it("rejects invalid and missing worker names and dates", () => {
    expect(() =>
      validateWorkerInput({
        full_name: "أ",
        phone: null,
        job_title: null,
        start_date: "2025-02-30",
        daily_wage: 0,
        status: "active",
        notes: null
      })
    ).toThrow("اسم العامل");
  });

  it("filters by name and excludes soft-deleted workers", () => {
    const values = [
      worker(),
      worker({ id: "worker-2", full_name: "محمد", status: "inactive" }),
      worker({ id: "worker-3", full_name: "أحمد محذوف", deleted_at: "2025-02-01T00:00:00.000Z" })
    ];

    expect(filterWorkers(values, { search: "أحمد", status: "all" })).toHaveLength(1);
    expect(filterWorkers(values, { status: "inactive" })).toHaveLength(1);
  });
});
