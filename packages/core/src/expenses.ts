import { isValidDate, normalizeOptionalText, roundMoney } from "./workers";

export type ExpensePaymentMethod = "cash" | "bank" | "credit";
export interface ExpenseInput {
  expense_date: string;
  expense_type: string;
  supplier: string | null;
  invoice_number: string | null;
  amount_ht: number;
  tax_amount: number;
  payment_method: ExpensePaymentMethod;
  notes: string | null;
}
export interface ExpenseRecord extends ExpenseInput {
  id: string; company_id: string; amount_ttc: number; created_by: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface ExpenseFilters {
  search?: string; paymentMethod?: ExpensePaymentMethod | "all";
  dateFrom?: string; dateTo?: string; expenseType?: string;
}
export function validateExpenseInput(input: ExpenseInput): ExpenseInput & { amount_ht: number; tax_amount: number } {
  if (!isValidDate(input.expense_date)) throw new Error("تاريخ المصروف غير صالح.");
  const expenseType = input.expense_type.trim();
  if (expenseType.length < 2 || expenseType.length > 120) throw new Error("تصنيف المصروف يجب أن يتراوح بين حرفين و120 حرفاً.");
  if (!["cash", "bank", "credit"].includes(input.payment_method)) throw new Error("طريقة دفع المصروف غير صالحة.");
  if (!Number.isFinite(input.amount_ht) || !Number.isFinite(input.tax_amount) || input.amount_ht < 0 || input.tax_amount < 0) {
    throw new Error("المبالغ يجب أن تكون أرقاماً غير سالبة.");
  }
  const amount_ht = roundMoney(input.amount_ht);
  const tax_amount = roundMoney(input.tax_amount);
  if (roundMoney(amount_ht + tax_amount) <= 0) throw new Error("إجمالي المصروف يجب أن يكون أكبر من صفر.");
  if (amount_ht + tax_amount > 999999999999) throw new Error("إجمالي المصروف يتجاوز الحد المسموح.");
  return {
    expense_date: input.expense_date, expense_type: expenseType,
    supplier: normalizeOptionalText(input.supplier),
    invoice_number: normalizeOptionalText(input.invoice_number),
    amount_ht, tax_amount, payment_method: input.payment_method,
    notes: normalizeOptionalText(input.notes)
  };
}
export function calculateExpenseTotals<T extends Pick<ExpenseRecord, "amount_ht" | "tax_amount" | "amount_ttc">>(rows: readonly T[]) {
  return rows.reduce((total, row) => ({
    amount_ht: roundMoney(total.amount_ht + row.amount_ht),
    tax_amount: roundMoney(total.tax_amount + row.tax_amount),
    amount_ttc: roundMoney(total.amount_ttc + row.amount_ttc)
  }), { amount_ht: 0, tax_amount: 0, amount_ttc: 0 });
}
export function filterExpenses<T extends ExpenseRecord>(rows: readonly T[], filters: ExpenseFilters = {}): T[] {
  const term = filters.search?.trim().toLocaleLowerCase() ?? "";
  return rows.filter(row => row.deleted_at === null)
    .filter(row => filters.paymentMethod === undefined || filters.paymentMethod === "all" || row.payment_method === filters.paymentMethod)
    .filter(row => !filters.dateFrom || row.expense_date >= filters.dateFrom)
    .filter(row => !filters.dateTo || row.expense_date <= filters.dateTo)
    .filter(row => !filters.expenseType || row.expense_type === filters.expenseType)
    .filter(row => !term || [row.expense_type, row.supplier ?? "", row.invoice_number ?? "", row.notes ?? ""].join(" ").toLocaleLowerCase().includes(term))
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at));
}
