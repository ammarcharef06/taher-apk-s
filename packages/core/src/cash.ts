import { isValidDate, roundMoney } from "./workers";

export type CashTransactionType = "income" | "expense";

export interface CashTransactionInput {
  transaction_date: string;
  transaction_type: CashTransactionType;
  description: string;
  beneficiary: string | null;
  amount: number;
  document_number: string | null;
  notes: string | null;
}

export interface CashTransactionRecord extends CashTransactionInput {
  id: string;
  company_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CashOpeningBalance {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string | null;
  opening_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CashFilters {
  search?: string;
  type?: CashTransactionType | "all";
  dateFrom?: string;
  dateTo?: string;
}

export interface CashLedgerRow {
  transaction: CashTransactionRecord;
  balance_after: number;
}

export function validateCashTransactionInput(input: CashTransactionInput): CashTransactionInput {
  if (!isValidDate(input.transaction_date)) {
    throw new Error("تاريخ الحركة غير صالح.");
  }
  if (input.transaction_type !== "income" && input.transaction_type !== "expense") {
    throw new Error("نوع حركة الصندوق غير صالح.");
  }
  const description = input.description.trim();
  if (description.length < 2 || description.length > 500) {
    throw new Error("بيان الحركة يجب أن يتراوح بين حرفين و500 حرف.");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("يجب أن يكون مبلغ الحركة أكبر من صفر.");
  }

  return {
    transaction_date: input.transaction_date,
    transaction_type: input.transaction_type,
    description,
    beneficiary: normalizeText(input.beneficiary),
    amount: roundMoney(input.amount),
    document_number: normalizeText(input.document_number),
    notes: normalizeText(input.notes)
  };
}

export function validateOpeningBalance(amount: number, periodStart: string): number {
  if (!isValidDate(periodStart)) {
    throw new Error("تاريخ بداية فترة الرصيد الافتتاحي غير صالح.");
  }
  if (!Number.isFinite(amount)) {
    throw new Error("الرصيد الافتتاحي يجب أن يكون رقماً صالحاً.");
  }
  return roundMoney(amount);
}

export function calculateCashBalance(
  openingBalances: readonly CashOpeningBalance[],
  transactions: readonly CashTransactionRecord[],
  asOfDate: string
): number {
  if (!isValidDate(asOfDate)) {
    throw new Error("تاريخ احتساب الرصيد غير صالح.");
  }

  const opening = openingBalances
    .filter((item) => item.deleted_at === null && item.period_start <= asOfDate)
    .slice()
    .sort((left, right) => {
      const periodOrder = right.period_start.localeCompare(left.period_start);
      return periodOrder !== 0 ? periodOrder : right.updated_at.localeCompare(left.updated_at);
    })[0];

  const openingDate = opening?.period_start ?? "0001-01-01";
  const initialAmount = opening?.opening_amount ?? 0;

  const movements = transactions.reduce((total, transaction) => {
    if (
      transaction.deleted_at !== null ||
      transaction.transaction_date < openingDate ||
      transaction.transaction_date > asOfDate
    ) {
      return total;
    }
    const signedAmount =
      transaction.transaction_type === "income" ? transaction.amount : -transaction.amount;
    return total + signedAmount;
  }, initialAmount);

  return roundMoney(movements);
}

export function buildCashLedger(
  transactions: readonly CashTransactionRecord[],
  openingBalances: readonly CashOpeningBalance[]
): CashLedgerRow[] {
  const orderedTransactions = transactions
    .filter((transaction) => transaction.deleted_at === null)
    .slice()
    .sort((left, right) => {
      const dateOrder = left.transaction_date.localeCompare(right.transaction_date);
      return dateOrder !== 0 ? dateOrder : left.created_at.localeCompare(right.created_at);
    });

  const orderedOpenings = openingBalances
    .filter((opening) => opening.deleted_at === null)
    .slice()
    .sort((left, right) => {
      const dateOrder = left.period_start.localeCompare(right.period_start);
      return dateOrder !== 0 ? dateOrder : left.updated_at.localeCompare(right.updated_at);
    });

  let openingIndex = 0;
  let runningBalance = 0;
  const ledger: CashLedgerRow[] = [];

  for (const transaction of orderedTransactions) {
    while (
      openingIndex < orderedOpenings.length &&
      orderedOpenings[openingIndex].period_start <= transaction.transaction_date
    ) {
      runningBalance = orderedOpenings[openingIndex].opening_amount;
      openingIndex += 1;
    }

    runningBalance +=
      transaction.transaction_type === "income" ? transaction.amount : -transaction.amount;

    ledger.push({
      transaction,
      balance_after: roundMoney(runningBalance)
    });
  }

  return ledger;
}

export function filterCashLedger(
  ledger: readonly CashLedgerRow[],
  filters: CashFilters = {}
): CashLedgerRow[] {
  const term = filters.search?.trim().toLocaleLowerCase() ?? "";
  const type = filters.type ?? "all";
  const dateFrom = filters.dateFrom ?? "";
  const dateTo = filters.dateTo ?? "";

  return ledger
    .filter(({ transaction }) => type === "all" || transaction.transaction_type === type)
    .filter(({ transaction }) => dateFrom.length === 0 || transaction.transaction_date >= dateFrom)
    .filter(({ transaction }) => dateTo.length === 0 || transaction.transaction_date <= dateTo)
    .filter(({ transaction }) => {
      if (term.length === 0) return true;
      return [
        transaction.description,
        transaction.beneficiary ?? "",
        transaction.document_number ?? "",
        transaction.notes ?? ""
      ].join(" ").toLocaleLowerCase().includes(term);
    });
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
