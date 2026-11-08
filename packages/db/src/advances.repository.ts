import {
  calculateAdvanceBalance,
  filterAdvances,
  validateAdvanceInput,
  type AdvanceFilters,
  type AdvanceInput,
  type AdvanceRecord
} from "@taher/core";
import {
  localDb,
  type LocalAdvance,
  type LocalCashTransaction,
  type SyncQueueItem
} from "./local.db";

export interface WorkerAdvanceBalance {
  worker_id: string;
  total_issued: number;
  total_repaid: number;
  outstanding: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function today(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function queueItem(
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

async function assertWorkerLedgerIsValid(
  companyId: string,
  workerId: string,
  replacement?: LocalAdvance,
  excludedAdvanceId?: string
): Promise<void> {
  const [movements, wages] = await Promise.all([
    localDb.advances
      .where("worker_id")
      .equals(workerId)
      .and((movement) =>
        movement.company_id === companyId &&
        movement.deleted_at === null &&
        movement.id !== excludedAdvanceId
      )
      .toArray(),
    localDb.wages
      .where("worker_id")
      .equals(workerId)
      .and((wage) => wage.company_id === companyId && wage.deleted_at === null)
      .toArray()
  ]);

  calculateAdvanceBalance(
    replacement ? [...movements, replacement] : movements,
    wages
  );
}

async function getWorkerBalance(
  companyId: string,
  workerId: string,
  excludingAdvanceId?: string,
  asOfDate = today()
): Promise<WorkerAdvanceBalance> {
  const wageMonth = asOfDate.slice(0, 7) + "-01";
  const [movements, wages] = await Promise.all([
    localDb.advances
      .where("worker_id")
      .equals(workerId)
      .and((movement) =>
        movement.company_id === companyId &&
        movement.movement_date <= asOfDate &&
        movement.deleted_at === null &&
        movement.id !== excludingAdvanceId
      )
      .toArray(),
    localDb.wages
      .where("worker_id")
      .equals(workerId)
      .and((wage) =>
        wage.company_id === companyId &&
        wage.wage_month <= wageMonth &&
        wage.deleted_at === null
      )
      .toArray()
  ]);

  const balance = calculateAdvanceBalance(movements, wages);
  return {
    worker_id: workerId,
    total_issued: balance.totalIssued,
    total_repaid: balance.totalRepaid,
    outstanding: balance.outstanding
  };
}

function cashMovementForAdvance(
  advance: LocalAdvance,
  workerName: string,
  createdBy: string | null,
  timestamp: string
): LocalCashTransaction | null {
  if (
    advance.deleted_at !== null ||
    (advance.advance_type !== "advance_issued" &&
      advance.advance_type !== "repayment")
  ) {
    return null;
  }

  return {
    id: newId(),
    company_id: advance.company_id,
    transaction_date: advance.movement_date,
    transaction_type: advance.advance_type === "advance_issued" ? "expense" : "income",
    description:
      advance.advance_type === "advance_issued"
        ? "تسبيق نقدي للعامل: " + workerName
        : "استلام تسديد تسبيق من العامل: " + workerName,
    beneficiary: workerName,
    amount: advance.amount,
    document_number: "ADV-" + advance.id,
    notes: advance.description,
    created_by: createdBy,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    _synced: 0,
    _updated_at: timestamp,
    _deleted: null
  };
}

async function updateLinkedCashMovement(
  companyId: string,
  advance: LocalAdvance,
  workerName: string,
  createdBy: string | null,
  timestamp: string
): Promise<void> {
  const documentNumber = "ADV-" + advance.id;
  const linkedCash = await localDb.cashTransactions
    .where("company_id")
    .equals(companyId)
    .and((transaction) =>
      transaction.document_number === documentNumber &&
      transaction.deleted_at === null
    )
    .first();

  const replacement = cashMovementForAdvance(
    advance,
    workerName,
    createdBy,
    timestamp
  );

  if (!replacement && linkedCash) {
    const deleted: LocalCashTransaction = {
      ...linkedCash,
      deleted_at: timestamp,
      updated_at: timestamp,
      _updated_at: timestamp,
      _deleted: timestamp,
      _synced: 0
    };
    await localDb.cashTransactions.put(deleted);
    await localDb.syncQueue.add(
      queueItem(companyId, deleted.id, "cash_transactions", "update", deleted, timestamp)
    );
    return;
  }

  if (replacement && linkedCash) {
    const updated: LocalCashTransaction = {
      ...linkedCash,
      transaction_date: replacement.transaction_date,
      transaction_type: replacement.transaction_type,
      description: replacement.description,
      beneficiary: replacement.beneficiary,
      amount: replacement.amount,
      notes: replacement.notes,
      updated_at: timestamp,
      _updated_at: timestamp,
      _synced: 0
    };
    await localDb.cashTransactions.put(updated);
    await localDb.syncQueue.add(
      queueItem(companyId, updated.id, "cash_transactions", "update", updated, timestamp)
    );
    return;
  }

  if (replacement) {
    await localDb.cashTransactions.add(replacement);
    await localDb.syncQueue.add(
      queueItem(companyId, replacement.id, "cash_transactions", "insert", replacement, timestamp)
    );
  }
}

export async function listAdvances(
  companyId: string,
  filters: AdvanceFilters = {}
): Promise<LocalAdvance[]> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");

  const records = await localDb.advances
    .where("company_id")
    .equals(companyId)
    .and((movement) => movement.deleted_at === null)
    .toArray();

  return filterAdvances(records as AdvanceRecord[], filters);
}

export async function listWorkerAdvanceBalances(
  companyId: string
): Promise<WorkerAdvanceBalance[]> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");

  const workers = await localDb.workers
    .where("company_id")
    .equals(companyId)
    .and((worker) => worker.deleted_at === null)
    .toArray();

  return Promise.all(
    workers.map((worker) => getWorkerBalance(companyId, worker.id))
  );
}

export async function getWorkerAdvanceBalance(
  companyId: string,
  workerId: string
): Promise<WorkerAdvanceBalance> {
  if (!companyId.trim() || !workerId.trim()) {
    throw new Error("الشركة والعامل مطلوبان.");
  }
  return getWorkerBalance(companyId, workerId);
}

export async function createAdvance(
  companyId: string,
  input: AdvanceInput,
  createdBy: string | null
): Promise<LocalAdvance> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");
  const validated = validateAdvanceInput(input);

  if (validated.advance_type === "wage_deduction") {
    throw new Error("خصم التسبيقات يُسجّل من خلال قسيمة الأجر، وليس كحركة يدوية.");
  }

  const timestamp = nowIso();

  try {
    return await localDb.transaction(
      "rw",
      [
        localDb.workers,
        localDb.advances,
        localDb.wages,
        localDb.cashTransactions,
        localDb.syncQueue
      ],
      async () => {
        const worker = await localDb.workers.get(validated.worker_id);
        if (
          !worker ||
          worker.company_id !== companyId ||
          worker.deleted_at !== null
        ) {
          throw new Error("العامل غير موجود في هذه الشركة.");
        }

        if (validated.advance_type === "repayment") {
          const current = await getWorkerBalance(
            companyId,
            worker.id,
            undefined,
            validated.movement_date
          );
          if (validated.amount > current.outstanding) {
            throw new Error("مبلغ التسديد أكبر من رصيد التسبيق المتبقي في تاريخ الحركة.");
          }
        }

        const record: LocalAdvance = {
          ...validated,
          id: newId(),
          company_id: companyId,
          created_by: createdBy,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
          _synced: 0,
          _updated_at: timestamp,
          _deleted: null
        };

        await localDb.advances.add(record);
        await localDb.syncQueue.add(
          queueItem(companyId, record.id, "advances", "insert", record, timestamp)
        );
        await updateLinkedCashMovement(
          companyId,
          record,
          worker.full_name,
          createdBy,
          timestamp
        );
        return record;
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تسجيل حركة التسبيق: " + reason);
  }
}

export async function updateAdvance(
  companyId: string,
  advanceId: string,
  input: AdvanceInput
): Promise<LocalAdvance> {
  const validated = validateAdvanceInput(input);
  if (validated.advance_type === "wage_deduction") {
    throw new Error("خصم التسبيقات يُدار من خلال قسيمة الأجر.");
  }

  const timestamp = nowIso();

  try {
    return await localDb.transaction(
      "rw",
      [
        localDb.workers,
        localDb.advances,
        localDb.wages,
        localDb.cashTransactions,
        localDb.syncQueue
      ],
      async () => {
        const current = await localDb.advances.get(advanceId);
        if (!current || current.company_id !== companyId || current.deleted_at !== null) {
          throw new Error("حركة التسبيق غير موجودة في هذه الشركة.");
        }

        const worker = await localDb.workers.get(validated.worker_id);
        if (!worker || worker.company_id !== companyId || worker.deleted_at !== null) {
          throw new Error("العامل غير موجود في هذه الشركة.");
        }
        if (validated.worker_id !== current.worker_id) {
          throw new Error("لا يمكن نقل حركة تسبيق إلى عامل آخر؛ احذفها وسجّل حركة جديدة.");
        }

        if (validated.advance_type === "repayment") {
          const currentBalance = await getWorkerBalance(
            companyId,
            worker.id,
            advanceId,
            validated.movement_date
          );
          if (validated.amount > currentBalance.outstanding) {
            throw new Error("مبلغ التسديد أكبر من رصيد التسبيق المتبقي في تاريخ الحركة.");
          }
        }

        const updated: LocalAdvance = {
          ...current,
          ...validated,
          updated_at: timestamp,
          _updated_at: timestamp,
          _synced: 0
        };

        await assertWorkerLedgerIsValid(
          companyId,
          worker.id,
          updated,
          advanceId
        );

        await localDb.advances.put(updated);
        await localDb.syncQueue.add(
          queueItem(companyId, advanceId, "advances", "update", updated, timestamp)
        );
        await updateLinkedCashMovement(
          companyId,
          updated,
          worker.full_name,
          current.created_by,
          timestamp
        );
        return updated;
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تعديل حركة التسبيق: " + reason);
  }
}

export async function deleteAdvance(companyId: string, advanceId: string): Promise<void> {
  const timestamp = nowIso();

  try {
    await localDb.transaction(
      "rw",
      [
        localDb.advances,
        localDb.wages,
        localDb.cashTransactions,
        localDb.syncQueue
      ],
      async () => {
        const current = await localDb.advances.get(advanceId);
        if (!current || current.company_id !== companyId || current.deleted_at !== null) {
          throw new Error("حركة التسبيق غير موجودة في هذه الشركة.");
        }

        const deleted: LocalAdvance = {
          ...current,
          deleted_at: timestamp,
          updated_at: timestamp,
          _updated_at: timestamp,
          _deleted: timestamp,
          _synced: 0
        };

        await localDb.advances.put(deleted);
        await localDb.syncQueue.add(
          queueItem(companyId, advanceId, "advances", "update", deleted, timestamp)
        );
        await assertWorkerLedgerIsValid(
          companyId,
          current.worker_id,
          undefined,
          advanceId
        );

        await updateLinkedCashMovement(
          companyId,
          deleted,
          "العامل",
          current.created_by,
          timestamp
        );
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر حذف حركة التسبيق: " + reason);
  }
}
