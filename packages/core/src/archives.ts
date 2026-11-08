import { isValidDate, normalizeOptionalText, roundMoney } from "./workers";

export interface ArchiveInput {
  source_table: string | null; source_id: string | null; document_type: string;
  counterparty: string | null; invoice_number: string | null; document_date: string;
  amount: number; cabinet: string | null; shelf: string | null;
  delivered_to_accountant: boolean; delivered_at: string | null; notes: string | null;
}
export interface ArchiveRecord extends ArchiveInput {
  id: string; company_id: string; storage_path: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface ArchiveFilters {
  search?: string; documentType?: string; dateFrom?: string; dateTo?: string;
  delivered?: "all" | "yes" | "no";
}
export function validateArchiveInput(input: ArchiveInput): ArchiveInput {
  if (!isValidDate(input.document_date)) throw new Error("تاريخ الوثيقة غير صالح.");
  const documentType = input.document_type.trim();
  if (documentType.length < 2 || documentType.length > 120) throw new Error("نوع الوثيقة مطلوب (2 إلى 120 حرفاً).");
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error("مبلغ الوثيقة يجب أن يكون رقماً غير سالب.");
  if (typeof input.delivered_to_accountant !== "boolean") throw new Error("حالة تسليم الوثيقة غير صالحة.");
  if (input.delivered_to_accountant && input.delivered_at && !Number.isFinite(Date.parse(input.delivered_at))) {
    throw new Error("تاريخ التسليم غير صالح.");
  }
  return {
    source_table: normalizeOptionalText(input.source_table),
    source_id: normalizeOptionalText(input.source_id),
    document_type: documentType,
    counterparty: normalizeOptionalText(input.counterparty),
    invoice_number: normalizeOptionalText(input.invoice_number),
    document_date: input.document_date,
    amount: roundMoney(input.amount),
    cabinet: normalizeOptionalText(input.cabinet),
    shelf: normalizeOptionalText(input.shelf),
    delivered_to_accountant: input.delivered_to_accountant,
    delivered_at: input.delivered_to_accountant ? (input.delivered_at || new Date().toISOString()) : null,
    notes: normalizeOptionalText(input.notes)
  };
}
export function filterArchives<T extends ArchiveRecord>(rows: readonly T[], filters: ArchiveFilters = {}): T[] {
  const term = filters.search?.trim().toLocaleLowerCase() ?? "";
  return rows.filter(row => row.deleted_at === null)
    .filter(row => !filters.documentType || filters.documentType === "all" || row.document_type === filters.documentType)
    .filter(row => !filters.dateFrom || row.document_date >= filters.dateFrom)
    .filter(row => !filters.dateTo || row.document_date <= filters.dateTo)
    .filter(row => filters.delivered === undefined || filters.delivered === "all" ||
      (filters.delivered === "yes" ? row.delivered_to_accountant : !row.delivered_to_accountant))
    .filter(row => !term || [row.document_type, row.counterparty ?? "", row.invoice_number ?? "", row.cabinet ?? "", row.shelf ?? "", row.notes ?? ""].join(" ").toLocaleLowerCase().includes(term))
    .sort((a, b) => b.document_date.localeCompare(a.document_date) || b.created_at.localeCompare(a.created_at));
}
