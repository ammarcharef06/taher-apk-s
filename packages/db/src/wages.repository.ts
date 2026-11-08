import {
  calculateAdvanceBalance,
  calculateWageAmounts,
  getPreviousWageCarryForward,
  isValidDate,
  roundMoney,
  validateWageInput,
  type WageInput
} from "@taher/core";
import {
  localDb,
  type LocalCashTransaction,
  type LocalWage,
  type LocalWagePayment,
  type SyncQueueItem
} from "./local.db";

export interface WageDraftContext {
  carried_balance: number;
  advance_balance: number;
}

export interface WagePaymentInput {
  payment_date: string;
  amount: number;
  payment_method: "cash" | "bank";
  notes: string | null;
}

export interface WagePaymentResult {
  wage: LocalWage;
  payment: LocalWagePayment;
}

function nowIso(): string {
  return new Date().toISOString();
}

function localDate(): string {
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

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 0));
  return date.toISOString().slice(0, 10);
}

async function getPreviousRecords(
  companyId: string,
  workerId: string,
  targetMonth: string
): Promise<LocalWage[]> {
  return localDb.wages
    .where("worker_id")
    .equals(workerId)
    .and((wage) =>
      wage.company_id === companyId &&
      wage.wage_month < targetMonth &&
      wage.deleted_at === null
    )
    .toArray();
}

async function getAdvanceMovementsForMonth(
  companyId: string,
  workerId: string,
  targetMonth: string
) {
  const movements = await localDb.advances
    .where("worker_id")
    .equals(workerId)
    .and((movement) =>
      movement.company_id === companyId &&
      movement.movement_date <= monthEnd(targetMonth) &&
      movement.deleted_at === null
    )
    .toArray();

  return movements;
}

export async function getWageDraftContext(
  companyId: string,
  workerId: string,
  wageMonth: string
): Promise<WageDraftContext> {
  if (!companyId.trim() || !workerId.trim()) {
    throw new Error("الشركة والعامل مطلوبان.");
  }
  if (!isValidDate(wageMonth) || !wageMonth.endsWith("-01")) {
    throw new Error("فترة الأجر يجب أن تكون أول يوم من الشهر.");
  }

  const [previousWages, movements] = await Promise.all([
    getPreviousRecords(companyId, workerId, wageMonth),
    getAdvanceMovementsForMonth(companyId, workerId, wageMonth)
  ]);

  return {
    carried_balance: getPreviousWageCarryForward(previousWages, wageMonth),
    advance_balance: calculateAdvanceBalance(movements, previousWages).outstanding
  };
}

export async function listWages(
  companyId: string,
  wageMonth?: string
): Promise<LocalWage[]> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");

  const records = await localDb.wages
    .where("company_id")
    .equals(companyId)
    .and((wage) =>
      wage.deleted_at === null && (!wageMonth || wage.wage_month === wageMonth)
    )
    .toArray();

  return records.sort((left, right) => {
    const monthOrder = right.wage_month.localeCompare(left.wage_month);
    return monthOrder !== 0 ? monthOrder : left.created_at.localeCompare(right.created_at);
  });
}

export async function createWage(
  companyId: string,
  workerId: string,
  input: WageInput,
  createdBy: string | null
): Promise<LocalWage> {
  if (!companyId.trim() || !workerId.trim()) {
    throw new Error("الشركة والعامل مطلوبان.");
  }

  const validated = validateWageInput(input);
  const timestamp = nowIso();

  try {
    return await localDb.transaction(
      "rw",
      [localDb.workers, localDb.wages, localDb.advances, localDb.syncQueue],
      async () => {
        const worker = await localDb.workers.get(workerId);
        if (
          !worker ||
          worker.company_id !== companyId ||
          worker.deleted_at !== null ||
          worker.status !== "active"
        ) {
          throw new Error("العامل غير موجود أو غير نشط في هذه الشركة.");
        }

        const duplicate = await localDb.wages
          .where("[worker_id+wage_month]")
          .equals([workerId, validated.wage_month])
          .first();

        if (duplicate && duplicate.deleted_at === null) {
          throw new Error("تم إنشاء قسيمة أجر لهذا العامل في هذا الشهر بالفعل.");
        }

        const laterWage = await localDb.wages
          .where("worker_id")
          .equals(workerId)
          .and((wage) =>
            wage.company_id === companyId &&
            wage.wage_month > validated.wage_month &&
            wage.deleted_at === null
          )
          .first();
        if (laterWage) {
          throw new Error("أنشئ قسائم الأجور بترتيب الأشهر؛ توجد قسيمة لاحقة لهذا العامل.");
        }

        const [previousWages, movements] = await Promise.all([
          getPreviousRecords(companyId, workerId, validated.wage_month),
          getAdvanceMovementsForMonth(companyId, workerId, validated.wage_month)
        ]);

        const carryForward = getPreviousWageCarryForward(previousWages, validated.wage_month);
        const advanceBalance = calculateAdvanceBalance(movements, previousWages).outstanding;

        if (validated.advances_deducted > advanceBalance) {
          throw new Error("التسبيقات المراد خصمها أكبر من رصيد العامل المتبقي.");
        }

        const totals = calculateWageAmounts(validated, carryForward, 0);
        const record: LocalWage = {
          ...validated,
          id: duplicate?.id ?? newId(),
          company_id: companyId,
          worker_id: workerId,
          base_amount: totals.base_amount,
          carried_balance: totals.carried_balance,
          net_due: totals.net_due,
          paid_amount: 0,
          receipt_number: null,
          created_by: createdBy,
          created_at: duplicate?.created_at ?? timestamp,
          updated_at: timestamp,
          deleted_at: null,
          _synced: 0,
          _updated_at: timestamp,
          _deleted: null
        };

        await localDb.wages.put(record);
        await localDb.syncQueue.add(
          createQueueItem(
            companyId,
            record.id,
            "wages",
            duplicate ? "update" : "insert",
            record,
            timestamp
          )
        );
        return record;
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر إنشاء قسيمة الأجر: " + reason);
  }
}

export async function updateWage(
  companyId: string,
  wageId: string,
  input: WageInput
): Promise<LocalWage> {
  const validated = validateWageInput(input);
  const timestamp = nowIso();

  try {
    return await localDb.transaction(
      "rw",
      [localDb.workers, localDb.wages, localDb.advances, localDb.syncQueue],
      async () => {
        const current = await localDb.wages.get(wageId);
        if (!current || current.company_id !== companyId || current.deleted_at !== null) {
          throw new Error("قسيمة الأجر غير موجودة في هذه الشركة.");
        }

        const laterWage = await localDb.wages
          .where("worker_id")
          .equals(current.worker_id)
          .and((wage) =>
            wage.company_id === companyId &&
            wage.wage_month > current.wage_month &&
            wage.deleted_at === null
          )
          .first();
        if (laterWage) {
          throw new Error("لا يمكن تعديل قسيمة لها رصيد مرحّل إلى شهر لاحق.");
        }

        const [worker, previousWages, movements] = await Promise.all([
          localDb.workers.get(current.worker_id),
          getPreviousRecords(companyId, current.worker_id, validated.wage_month),
          getAdvanceMovementsForMonth(companyId, current.worker_id, validated.wage_month)
        ]);

        if (!worker || worker.company_id !== companyId || worker.deleted_at !== null) {
          throw new Error("بيانات العامل المرتبط بالقسيمة غير متاحة.");
        }

        const advanceBalance = calculateAdvanceBalance(movements, previousWages).outstanding;
        if (validated.advances_deducted > advanceBalance) {
          throw new Error("التسبيقات المراد خصمها أكبر من رصيد العامل المتبقي.");
        }

        const totals = calculateWageAmounts(
          validated,
          current.carried_balance,
          current.paid_amount
        );

        if (validated.wage_month !== current.wage_month) {
          const duplicate = await localDb.wages
            .where("[worker_id+wage_month]")
            .equals([current.worker_id, validated.wage_month])
            .first();
          if (duplicate && duplicate.id !== current.id && duplicate.deleted_at === null) {
            throw new Error("توجد قسيمة أجر أخرى لهذا العامل في الشهر المحدد.");
          }
          throw new Error("لا يمكن تغيير شهر قسيمة موجودة؛ أنشئ قسيمة جديدة للشهر الصحيح.");
        }

        const updated: LocalWage = {
          ...current,
          ...validated,
          base_amount: totals.base_amount,
          net_due: totals.net_due,
          updated_at: timestamp,
          _updated_at: timestamp,
          _synced: 0
        };

        await localDb.wages.put(updated);
        await localDb.syncQueue.add(
          createQueueItem(companyId, wageId, "wages", "update", updated, timestamp)
        );
        return updated;
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تحديث قسيمة الأجر: " + reason);
  }
}

export async function deleteWage(companyId: string, wageId: string): Promise<void> {
  const timestamp = nowIso();

  try {
    await localDb.transaction("rw", [localDb.wages, localDb.syncQueue], async () => {
      const wage = await localDb.wages.get(wageId);
      if (!wage || wage.company_id !== companyId || wage.deleted_at !== null) {
        throw new Error("قسيمة الأجر غير موجودة في هذه الشركة.");
      }
      if (wage.paid_amount > 0) {
        throw new Error("لا يمكن حذف قسيمة تم دفع جزء منها أو كل مستحقاتها.");
      }

      const laterWage = await localDb.wages
        .where("worker_id")
        .equals(wage.worker_id)
        .and((item) =>
          item.company_id === companyId &&
          item.wage_month > wage.wage_month &&
          item.deleted_at === null
        )
        .first();

      if (laterWage) {
        throw new Error("لا يمكن حذف قسيمة لها رصيد مرحّل إلى شهر لاحق.");
      }

      const deleted: LocalWage = {
        ...wage,
        deleted_at: timestamp,
        updated_at: timestamp,
        _updated_at: timestamp,
        _deleted: timestamp,
        _synced: 0
      };
      await localDb.wages.put(deleted);
      await localDb.syncQueue.add(
        createQueueItem(companyId, wageId, "wages", "update", deleted, timestamp)
      );
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر حذف قسيمة الأجر: " + reason);
  }
}

export async function listWagePayments(
  companyId: string,
  wageId: string
): Promise<LocalWagePayment[]> {
  if (!companyId.trim() || !wageId.trim()) return [];

  const records = await localDb.wagePayments
    .where("[company_id+wage_id]")
    .equals([companyId, wageId])
    .toArray();

  return records.sort((left, right) => {
    const dateOrder = right.payment_date.localeCompare(left.payment_date);
    return dateOrder !== 0 ? dateOrder : right.created_at.localeCompare(left.created_at);
  });
}

export async function recordWagePayment(
  companyId: string,
  wageId: string,
  input: WagePaymentInput,
  createdBy: string | null
): Promise<WagePaymentResult> {
  if (!isValidDate(input.payment_date)) {
    throw new Error("تاريخ دفع الأجر غير صالح.");
  }
  if (input.payment_method !== "cash" && input.payment_method !== "bank") {
    throw new Error("طريقة دفع الأجر غير صالحة.");
  }

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(input.amount) || amount <= 0) {
    throw new Error("مبلغ الدفعة يجب أن يكون أكبر من صفر.");
  }

  const timestamp = nowIso();
  const paymentId = newId();

  try {
    return await localDb.transaction(
      "rw",
      [
        localDb.wages,
        localDb.workers,
        localDb.wagePayments,
        localDb.cashTransactions,
        localDb.syncQueue
      ],
      async () => {
        const wage = await localDb.wages.get(wageId);
        if (!wage || wage.company_id !== companyId || wage.deleted_at !== null) {
          throw new Error("قسيمة الأجر غير موجودة في هذه الشركة.");
        }

        const worker = await localDb.workers.get(wage.worker_id);
        if (!worker || worker.company_id !== companyId || worker.deleted_at !== null) {
          throw new Error("بيانات العامل المرتبط بالقسيمة غير متاحة.");
        }

        const remaining = roundMoney(wage.net_due - wage.paid_amount);
        if (amount > remaining) {
          throw new Error("مبلغ الدفعة يتجاوز الرصيد المتبقي من الأجر.");
        }

        const receiptNumber =
          "WR-" +
          wage.wage_month.slice(0, 7).replace("-", "") +
          "-" +
          paymentId.slice(0, 8).toUpperCase();

        let cashTransaction: LocalCashTransaction | null = null;

        if (input.payment_method === "cash") {
          cashTransaction = {
            id: newId(),
            company_id: companyId,
            transaction_date: input.payment_date,
            transaction_type: "expense",
            description: "دفع أجرة العامل: " + worker.full_name,
            beneficiary: worker.full_name,
            amount,
            document_number: receiptNumber,
            notes: input.notes?.trim() || null,
            created_by: createdBy,
            created_at: timestamp,
            updated_at: timestamp,
            deleted_at: null,
            _synced: 0,
            _updated_at: timestamp,
            _deleted: null
          };

          await localDb.cashTransactions.add(cashTransaction);
          await localDb.syncQueue.add(
            createQueueItem(
              companyId,
              cashTransaction.id,
              "cash_transactions",
              "insert",
              cashTransaction,
              timestamp
            )
          );
        }

        const payment: LocalWagePayment = {
          id: paymentId,
          company_id: companyId,
          wage_id: wageId,
          worker_id: wage.worker_id,
          payment_date: input.payment_date,
          amount,
          payment_method: input.payment_method,
          cash_transaction_id: cashTransaction?.id ?? null,
          receipt_number: receiptNumber,
          notes: input.notes?.trim() || null,
          created_by: createdBy,
          created_at: timestamp
        };

        const updatedWage: LocalWage = {
          ...wage,
          paid_amount: roundMoney(wage.paid_amount + amount),
          receipt_number: receiptNumber,
          updated_at: timestamp,
          _updated_at: timestamp,
          _synced: 0
        };

        await localDb.wagePayments.add(payment);
        await localDb.wages.put(updatedWage);
        await localDb.syncQueue.add(
          createQueueItem(companyId, payment.id, "wage_payments", "insert", payment, timestamp)
        );
        await localDb.syncQueue.add(
          createQueueItem(companyId, wage.id, "wages", "update", updatedWage, timestamp)
        );

        return { wage: updatedWage, payment };
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تسجيل دفعة الأجر: " + reason);
  }
}

export function getWageRemainingAmount(wage: LocalWage): number {
  return roundMoney(wage.net_due - wage.paid_amount);
}

export function getTodayForWageForm(): string {
  return localDate();
}
