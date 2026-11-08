import { isValidDate, roundMoney } from "./workers";

export type SocialSecurityAgency = "CNAS" | "CASNOS";
export type SocialSecurityPaymentStatus = "paid" | "unpaid" | "partial";

export interface SocialSecurityInput {
  agency: SocialSecurityAgency;
  declaration_period: string;
  declaration_type: string;
  amount_due: number;
  amount_paid: number;
  payment_date: string | null;
  receipt_number: string | null;
  archive_location: string | null;
  notes: string | null;
}

export interface SocialSecurityRecord extends SocialSecurityInput {
  id: string;
  company_id: string;
  payment_status: SocialSecurityPaymentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SocialSecurityFilters {
  agency?: SocialSecurityAgency | "all";
  status?: SocialSecurityPaymentStatus | "all";
  periodFrom?: string;
  periodTo?: string;
  search?: string;
}

export interface SocialSecurityAmounts {
  amount_due: number;
  amount_paid: number;
  remaining_amount: number;
  payment_status: SocialSecurityPaymentStatus;
}

export function deriveSocialSecurityStatus(
  amountDue: number,
  amountPaid: number
): SocialSecurityPaymentStatus {
  const due = roundMoney(amountDue);
  const paid = roundMoney(amountPaid);

  if (!Number.isFinite(due) || due < 0 || !Number.isFinite(paid) || paid < 0 || paid > due) {
    throw new Error("مبالغ تصريح الضمان الاجتماعي غير صالحة.");
  }

  if (due === 0) return "paid";
  if (paid === 0) return "unpaid";
  return paid >= due ? "paid" : "partial";
}

export function calculateSocialSecurityAmounts(
  amountDue: number,
  amountPaid: number
): SocialSecurityAmounts {
  const due = roundMoney(amountDue);
  const paid = roundMoney(amountPaid);
  const paymentStatus = deriveSocialSecurityStatus(due, paid);

  return {
    amount_due: due,
    amount_paid: paid,
    remaining_amount: roundMoney(due - paid),
    payment_status: paymentStatus
  };
}

export function validateSocialSecurityInput(input: SocialSecurityInput): SocialSecurityInput {
  if (input.agency !== "CNAS" && input.agency !== "CASNOS") {
    throw new Error("هيئة الضمان الاجتماعي غير صالحة.");
  }
  if (!isValidDate(input.declaration_period) || !input.declaration_period.endsWith("-01")) {
    throw new Error("فترة التصريح يجب أن تكون أول يوم من الشهر.");
  }

  const declarationType = input.declaration_type.trim();
  if (declarationType.length < 2 || declarationType.length > 120) {
    throw new Error("نوع التصريح يجب أن يتراوح بين حرفين و120 حرفاً.");
  }

  const amounts = calculateSocialSecurityAmounts(input.amount_due, input.amount_paid);
  const paymentDate = normalizeText(input.payment_date);
  if (paymentDate && !isValidDate(paymentDate)) {
    throw new Error("تاريخ الدفع غير صالح.");
  }
  if (amounts.amount_paid > 0 && !paymentDate) {
    throw new Error("أدخل تاريخ الدفع عند تسجيل مبلغ مدفوع.");
  }

  return {
    agency: input.agency,
    declaration_period: input.declaration_period,
    declaration_type: declarationType,
    amount_due: amounts.amount_due,
    amount_paid: amounts.amount_paid,
    payment_date: paymentDate,
    receipt_number: normalizeText(input.receipt_number),
    archive_location: normalizeText(input.archive_location),
    notes: normalizeText(input.notes)
  };
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}


export function filterSocialSecurityDeclarations<T extends SocialSecurityRecord>(
  records: readonly T[],
  filters: SocialSecurityFilters = {}
): T[] {
  const agency = filters.agency ?? "all";
  const status = filters.status ?? "all";
  const term = filters.search?.trim().toLocaleLowerCase() ?? "";

  return records
    .filter((record) => record.deleted_at === null)
    .filter((record) => agency === "all" || record.agency === agency)
    .filter((record) => status === "all" || record.payment_status === status)
    .filter((record) => !filters.periodFrom || record.declaration_period >= filters.periodFrom)
    .filter((record) => !filters.periodTo || record.declaration_period <= filters.periodTo)
    .filter((record) => {
      if (!term) return true;
      return [
        record.declaration_type,
        record.receipt_number ?? "",
        record.archive_location ?? "",
        record.notes ?? ""
      ].join(" ").toLocaleLowerCase().includes(term);
    })
    .sort((left, right) => {
      const periodOrder = right.declaration_period.localeCompare(left.declaration_period);
      return periodOrder !== 0 ? periodOrder : right.created_at.localeCompare(left.created_at);
    });
}
