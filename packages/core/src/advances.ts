import { isValidDate, roundMoney } from "./workers";

export type AdvanceType =
  | "advance_issued"
  | "purchase_expense"
  | "repayment"
  | "wage_deduction";

export interface AdvanceInput {
  worker_id: string;
  movement_date: string;
  advance_type: AdvanceType;
  amount: number;
  description: string | null;
  document_number: string | null;
}

export interface AdvanceRecord extends AdvanceInput {
  id: string;
  company_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AdvanceFilters {
  workerId?: string;
  type?: AdvanceType | "all";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface AdvanceBalance {
  totalIssued: number;
  totalRepaid: number;
  outstanding: number;
}

export function validateAdvanceInput(input: AdvanceInput): AdvanceInput {
  if (!input.worker_id.trim()) {
    throw new Error("يجب اختيار العامل.");
  }
  if (!isValidDate(input.movement_date)) {
    throw new Error("تاريخ حركة التسبيق غير صالح.");
  }
  if (
    input.advance_type !== "advance_issued" &&
    input.advance_type !== "purchase_expense" &&
    input.advance_type !== "repayment" &&
    input.advance_type !== "wage_deduction"
  ) {
    throw new Error("نوع حركة التسبيق غير صالح.");
  }

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(input.amount) || amount <= 0) {
    throw new Error("يجب أن يكون مبلغ الحركة أكبر من صفر بعد التقريب.");
  }

  return {
    worker_id: input.worker_id,
    movement_date: input.movement_date,
    advance_type: input.advance_type,
    amount,
    description: normalizeText(input.description),
    document_number: normalizeText(input.document_number)
  };
}

export function calculateAdvanceBalance(
  movements: readonly Pick<AdvanceRecord, "advance_type" | "amount" | "deleted_at">[],
  wageDeductions: readonly { advances_deducted: number; deleted_at: string | null }[] = []
): AdvanceBalance {
  let issued = 0;
  let repaid = 0;

  for (const movement of movements) {
    if (movement.deleted_at !== null) continue;
    if (movement.advance_type === "advance_issued" || movement.advance_type === "purchase_expense") {
      issued += movement.amount;
    } else {
      repaid += movement.amount;
    }
  }

  for (const wage of wageDeductions) {
    if (wage.deleted_at === null) repaid += wage.advances_deducted;
  }

  const totalIssued = roundMoney(issued);
  const totalRepaid = roundMoney(repaid);
  const outstanding = roundMoney(totalIssued - totalRepaid);

  if (outstanding < 0) {
    throw new Error("إجمالي التسديدات والاقتطاعات يتجاوز إجمالي التسبيقات المسجلة.");
  }

  return { totalIssued, totalRepaid, outstanding };
}

export function filterAdvances<T extends AdvanceRecord>(
  records: readonly T[],
  filters: AdvanceFilters = {}
): T[] {
  const term = filters.search?.trim().toLocaleLowerCase() ?? "";
  const type = filters.type ?? "all";

  return records
    .filter((record) => record.deleted_at === null)
    .filter((record) => !filters.workerId || record.worker_id === filters.workerId)
    .filter((record) => type === "all" || record.advance_type === type)
    .filter((record) => !filters.dateFrom || record.movement_date >= filters.dateFrom)
    .filter((record) => !filters.dateTo || record.movement_date <= filters.dateTo)
    .filter((record) => {
      if (!term) return true;
      return [record.description ?? "", record.document_number ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term);
    })
    .sort((left, right) => {
      const dateOrder = right.movement_date.localeCompare(left.movement_date);
      return dateOrder !== 0 ? dateOrder : right.created_at.localeCompare(left.created_at);
    });
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
