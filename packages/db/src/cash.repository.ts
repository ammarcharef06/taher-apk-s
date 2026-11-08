import {
  buildCashLedger,
  calculateCashBalance,
  filterCashLedger,
  validateCashTransactionInput,
  validateOpeningBalance,
  type CashFilters,
  type CashTransactionInput
} from "@taher/core";
import {
  localDb,
  type LocalCashOpeningBalance,
  type LocalCashTransaction,
  type SyncQueueItem
} from "./local.db";

export interface CashOverview {
  rows: ReturnType<typeof filterCashLedger>;
  currentBalance: number;
  openingBalances: LocalCashOpeningBalance[];
}

export interface OpeningBalanceInput {
  period_start: string;
  period_end: string | null;
  opening_amount: number;
  notes: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function localToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function createQueueItem(
  companyId: string,
  recordId: string,
  entity: string,
  operation: SyncQueueItem["operation"],
  payload: unknown,
  timestamp: string
): SyncQueueItem {
  return {
    company_id: companyId,
    entity,
    record_id: recordId,
    operation,
    payload,
    status: "pending",
    retry_count: 0,
    last_error: null,
    created_at: timestamp,
    updated_at: timestamp
  };
}

export async function getCashOverview(
  companyId: string,
  filters: CashFilters = {}
): Promise<CashOverview> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");

  try {
    const [transactions, openingBalances] = await Promise.all([
      localDb.cashTransactions
        .where("company_id")
        .equals(companyId)
        .and((item) => item._deleted === null && item.deleted_at === null)
        .toArray(),
      localDb.cashOpeningBalances
        .where("company_id")
        .equals(companyId)
        .and((item) => item._deleted === null && item.deleted_at === null)
        .toArray()
    ]);

    const ledger = buildCashLedger(transactions, openingBalances);
    return {
      rows: filterCashLedger(ledger, filters),
      currentBalance: calculateCashBalance(openingBalances, transactions, localToday()),
      openingBalances: openingBalances.sort((left, right) =>
        right.period_start.localeCompare(left.period_start)
      )
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تحميل بيانات الصندوق: " + reason);
  }
}

export async function createCashTransaction(
  companyId: string,
  input: CashTransactionInput,
  userId: string | null
): Promise<LocalCashTransaction> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");
  const validated = validateCashTransactionInput(input);
  const timestamp = nowIso();

  const record: LocalCashTransaction = {
    ...validated,
    id: newId(),
    company_id: companyId,
    created_by: userId,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    _synced: 0,
    _updated_at: timestamp,
    _deleted: null
  };

  try {
    await localDb.transaction(
      "rw",
      [localDb.cashTransactions, localDb.syncQueue],
      async () => {
        await localDb.cashTransactions.add(record);
        await localDb.syncQueue.add(
          createQueueItem(companyId, record.id, "cash_transactions", "insert", record, timestamp)
        );
      }
    );
    return record;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تسجيل حركة الصندوق: " + reason);
  }
}

export async function updateCashTransaction(
  companyId: string,
  transactionId: string,
  input: CashTransactionInput
): Promise<LocalCashTransaction> {
  const validated = validateCashTransactionInput(input);
  const timestamp = nowIso();

  try {
    return await localDb.transaction(
      "rw",
      [localDb.cashTransactions, localDb.syncQueue],
      async () => {
        const current = await localDb.cashTransactions.get(transactionId);
        if (
          !current ||
          current.company_id !== companyId ||
          current.deleted_at !== null
        ) {
          throw new Error("حركة الصندوق غير موجودة في هذه الشركة.");
        }

        const updated: LocalCashTransaction = {
          ...current,
          ...validated,
          updated_at: timestamp,
          _updated_at: timestamp,
          _synced: 0
        };
        await localDb.cashTransactions.put(updated);
        await localDb.syncQueue.add(
          createQueueItem(companyId, transactionId, "cash_transactions", "update", updated, timestamp)
        );
        return updated;
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تعديل حركة الصندوق: " + reason);
  }
}

export async function deleteCashTransaction(
  companyId: string,
  transactionId: string
): Promise<void> {
  const timestamp = nowIso();

  try {
    await localDb.transaction(
      "rw",
      [localDb.cashTransactions, localDb.syncQueue],
      async () => {
        const current = await localDb.cashTransactions.get(transactionId);
        if (
          !current ||
          current.company_id !== companyId ||
          current.deleted_at !== null
        ) {
          throw new Error("حركة الصندوق غير موجودة في هذه الشركة.");
        }

        const deleted: LocalCashTransaction = {
          ...current,
          deleted_at: timestamp,
          updated_at: timestamp,
          _updated_at: timestamp,
          _deleted: timestamp,
          _synced: 0
        };

        await localDb.cashTransactions.put(deleted);
        await localDb.syncQueue.add(
          createQueueItem(companyId, transactionId, "cash_transactions", "update", deleted, timestamp)
        );
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر حذف حركة الصندوق: " + reason);
  }
}

export async function saveCashOpeningBalance(
  companyId: string,
  input: OpeningBalanceInput
): Promise<LocalCashOpeningBalance> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");
  const validatedAmount = validateOpeningBalance(input.opening_amount, input.period_start);
  if (input.period_end && input.period_end < input.period_start) {
    throw new Error("تاريخ نهاية الفترة يجب ألا يسبق تاريخ بدايتها.");
  }

  const timestamp = nowIso();

  try {
    return await localDb.transaction(
      "rw",
      [localDb.cashOpeningBalances, localDb.syncQueue],
      async () => {
        const existing = await localDb.cashOpeningBalances
          .where("[company_id+period_start]")
          .equals([companyId, input.period_start])
          .first();

        const record: LocalCashOpeningBalance = {
          id: existing?.id ?? newId(),
          company_id: companyId,
          period_start: input.period_start,
          period_end: input.period_end,
          opening_amount: validatedAmount,
          notes: input.notes?.trim() || null,
          created_at: existing?.created_at ?? timestamp,
          updated_at: timestamp,
          deleted_at: null,
          _synced: 0,
          _updated_at: timestamp,
          _deleted: null
        };

        await localDb.cashOpeningBalances.put(record);
        await localDb.syncQueue.add(
          createQueueItem(
            companyId,
            record.id,
            "cash_opening_balances",
            existing ? "update" : "insert",
            record,
            timestamp
          )
        );
        return record;
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر حفظ الرصيد الافتتاحي: " + reason);
  }
}
