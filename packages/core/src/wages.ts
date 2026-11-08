import { isValidDate, roundMoney } from "./workers";

export interface WageInput {
  wage_month: string;
  work_days: number;
  daily_rate: number;
  overtime_hours: number;
  overtime_amount: number;
  bonuses: number;
  deductions: number;
  advances_deducted: number;
  notes: string | null;
}

export interface WageAmounts {
  base_amount: number;
  gross_amount: number;
  deductions: number;
  advances_deducted: number;
  carried_balance: number;
  net_due: number;
  paid_amount: number;
  outstanding_amount: number;
}

export interface WageRecord extends WageInput, WageAmounts {
  id: string;
  company_id: string;
  worker_id: string;
  receipt_number: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function validateWageInput(input: WageInput): WageInput {
  if (!isValidDate(input.wage_month) || !input.wage_month.endsWith("-01")) {
    throw new Error("فترة الأجر يجب أن تكون أول يوم من الشهر.");
  }

  if (!Number.isFinite(input.work_days) || input.work_days < 0 || input.work_days > 31) {
    throw new Error("عدد أيام العمل يجب أن يكون بين صفر و31.");
  }

  const nonNegativeValues: Array<[string, number]> = [
    ["الأجر اليومي", input.daily_rate],
    ["ساعات العمل الإضافي", input.overtime_hours],
    ["مبلغ العمل الإضافي", input.overtime_amount],
    ["المكافآت", input.bonuses],
    ["الاقتطاعات", input.deductions],
    ["التسبيقات المخصومة", input.advances_deducted]
  ];

  for (const [label, value] of nonNegativeValues) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(label + " يجب أن يكون رقماً غير سالب.");
    }
  }

  return {
    wage_month: input.wage_month,
    work_days: roundMoney(input.work_days),
    daily_rate: roundMoney(input.daily_rate),
    overtime_hours: roundMoney(input.overtime_hours),
    overtime_amount: roundMoney(input.overtime_amount),
    bonuses: roundMoney(input.bonuses),
    deductions: roundMoney(input.deductions),
    advances_deducted: roundMoney(input.advances_deducted),
    notes: normalizeText(input.notes)
  };
}

export function calculateWageAmounts(
  input: WageInput,
  carriedBalance = 0,
  paidAmount = 0
): WageAmounts {
  const validated = validateWageInput(input);

  if (!Number.isFinite(carriedBalance) || carriedBalance < 0) {
    throw new Error("الرصيد المرحّل يجب أن يكون رقماً غير سالب.");
  }
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new Error("المبلغ المدفوع يجب أن يكون رقماً غير سالب.");
  }

  const baseAmount = roundMoney(validated.work_days * validated.daily_rate);
  const grossAmount = roundMoney(
    baseAmount + validated.overtime_amount + validated.bonuses
  );
  const netDue = roundMoney(
    grossAmount + carriedBalance - validated.deductions - validated.advances_deducted
  );

  if (netDue < 0) {
    throw new Error("إجمالي الاقتطاعات والتسبيقات يتجاوز المستحق بعد إضافة الرصيد المرحّل.");
  }

  const roundedPaid = roundMoney(paidAmount);
  if (roundedPaid > netDue) {
    throw new Error("المبلغ المدفوع لا يمكن أن يتجاوز صافي المستحق.");
  }

  return {
    base_amount: baseAmount,
    gross_amount: grossAmount,
    deductions: validated.deductions,
    advances_deducted: validated.advances_deducted,
    carried_balance: roundMoney(carriedBalance),
    net_due: netDue,
    paid_amount: roundedPaid,
    outstanding_amount: roundMoney(netDue - roundedPaid)
  };
}

export function calculateWageOutstanding(netDue: number, paidAmount: number): number {
  if (!Number.isFinite(netDue) || netDue < 0) {
    throw new Error("صافي المستحق غير صالح.");
  }
  if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > netDue) {
    throw new Error("المبلغ المدفوع خارج حدود المستحق.");
  }
  return roundMoney(netDue - paidAmount);
}

export function getPreviousWageCarryForward(
  wages: readonly Pick<WageRecord, "wage_month" | "net_due" | "paid_amount" | "deleted_at">[],
  targetMonth: string
): number {
  if (!isValidDate(targetMonth) || !targetMonth.endsWith("-01")) {
    throw new Error("فترة الأجر المطلوبة غير صالحة.");
  }

  const previous = wages
    .filter((wage) => wage.deleted_at === null && wage.wage_month < targetMonth)
    .slice()
    .sort((left, right) => right.wage_month.localeCompare(left.wage_month))[0];

  return previous
    ? calculateWageOutstanding(previous.net_due, previous.paid_amount)
    : 0;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
