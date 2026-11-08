import { describe, expect, it } from "vitest";
import {
  calculateSocialSecurityAmounts,
  deriveSocialSecurityStatus,
  validateSocialSecurityInput
} from "../src/social-security";

describe("social security business logic", () => {
  it("derives unpaid, partial and paid statuses", () => {
    expect(deriveSocialSecurityStatus(1000, 0)).toBe("unpaid");
    expect(deriveSocialSecurityStatus(1000, 250)).toBe("partial");
    expect(deriveSocialSecurityStatus(1000, 1000)).toBe("paid");
    expect(deriveSocialSecurityStatus(0, 0)).toBe("paid");
  });

  it("calculates the remaining amount", () => {
    expect(calculateSocialSecurityAmounts(1200, 300)).toEqual({
      amount_due: 1200,
      amount_paid: 300,
      remaining_amount: 900,
      payment_status: "partial"
    });
  });

  it("rejects a paid amount above the due amount", () => {
    expect(() => deriveSocialSecurityStatus(100, 101)).toThrow("غير صالحة");
  });

  it("requires a first-of-month period and payment date for partial payment", () => {
    expect(() => validateSocialSecurityInput({
      agency: "CNAS",
      declaration_period: "2025-03-02",
      declaration_type: "Cotisation",
      amount_due: 100,
      amount_paid: 50,
      payment_date: "2025-03-15",
      receipt_number: null,
      archive_location: null,
      notes: null
    })).toThrow("أول يوم");

    expect(() => validateSocialSecurityInput({
      agency: "CNAS",
      declaration_period: "2025-03-01",
      declaration_type: "Cotisation",
      amount_due: 100,
      amount_paid: 50,
      payment_date: null,
      receipt_number: null,
      archive_location: null,
      notes: null
    })).toThrow("تاريخ الدفع");
  });
});
