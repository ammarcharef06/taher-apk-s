import { filterWorkers, validateWorkerInput, type WorkerFilters, type WorkerInput } from "@taher/core";
import { localDb, type LocalWorker, type SyncQueueItem } from "./local.db";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function createQueueItem(
  companyId: string,
  recordId: string,
  operation: SyncQueueItem["operation"],
  payload: unknown,
  timestamp: string
): SyncQueueItem {
  return {
    company_id: companyId,
    entity: "workers",
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

export async function listWorkers(
  companyId: string,
  filters: WorkerFilters = {}
): Promise<LocalWorker[]> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");

  try {
    const records = await localDb.workers
      .where("company_id")
      .equals(companyId)
      .and((worker) => worker._deleted === null && worker.deleted_at === null)
      .toArray();

    return filterWorkers(records, filters);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تحميل قائمة العمال: " + reason);
  }
}

export async function createWorker(
  companyId: string,
  input: WorkerInput
): Promise<LocalWorker> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");
  const validated = validateWorkerInput(input);
  const timestamp = nowIso();

  const record: LocalWorker = {
    ...validated,
    id: newId(),
    company_id: companyId,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    _synced: 0,
    _updated_at: timestamp,
    _deleted: null
  };

  try {
    await localDb.transaction("rw", [localDb.workers, localDb.syncQueue], async () => {
      await localDb.workers.add(record);
      await localDb.syncQueue.add(
        createQueueItem(companyId, record.id, "insert", record, timestamp)
      );
    });
    return record;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر حفظ العامل محلياً: " + reason);
  }
}

export async function updateWorker(
  companyId: string,
  workerId: string,
  input: WorkerInput
): Promise<LocalWorker> {
  const validated = validateWorkerInput(input);
  const timestamp = nowIso();

  try {
    return await localDb.transaction("rw", [localDb.workers, localDb.syncQueue], async () => {
      const current = await localDb.workers.get(workerId);
      if (!current || current.company_id !== companyId || current.deleted_at !== null) {
        throw new Error("العامل غير موجود في هذه الشركة.");
      }

      const updated: LocalWorker = {
        ...current,
        ...validated,
        updated_at: timestamp,
        _updated_at: timestamp,
        _synced: 0
      };

      await localDb.workers.put(updated);
      await localDb.syncQueue.add(
        createQueueItem(companyId, workerId, "update", updated, timestamp)
      );
      return updated;
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تحديث بيانات العامل: " + reason);
  }
}

export async function deleteWorker(companyId: string, workerId: string): Promise<void> {
  const timestamp = nowIso();

  try {
    await localDb.transaction(
      "rw",
      [localDb.workers, localDb.wages, localDb.advances, localDb.archives, localDb.syncQueue],
      async () => {
        const worker = await localDb.workers.get(workerId);
        if (!worker || worker.company_id !== companyId || worker.deleted_at !== null) {
          throw new Error("العامل غير موجود في هذه الشركة.");
        }

        const deletedWorker: LocalWorker = {
          ...worker,
          deleted_at: timestamp,
          updated_at: timestamp,
          _updated_at: timestamp,
          _deleted: timestamp,
          _synced: 0
        };

        const wages = await localDb.wages
          .where("worker_id")
          .equals(workerId)
          .and((wage) => wage.company_id === companyId && wage.deleted_at === null)
          .toArray();

        const advances = await localDb.advances
          .where("worker_id")
          .equals(workerId)
          .and((advance) => advance.company_id === companyId && advance.deleted_at === null)
          .toArray();

        const relatedRecordIds = new Set([
          ...wages.map((wage) => wage.id),
          ...advances.map((advance) => advance.id)
        ]);
        const relatedArchives = await localDb.archives
          .where("company_id")
          .equals(companyId)
          .and((archive) =>
            archive.deleted_at === null &&
            (archive.source_table === "wages" || archive.source_table === "advances") &&
            archive.source_id !== null &&
            relatedRecordIds.has(archive.source_id)
          )
          .toArray();

        await localDb.workers.put(deletedWorker);
        await localDb.syncQueue.add(
          createQueueItem(companyId, workerId, "update", deletedWorker, timestamp)
        );

        for (const wage of wages) {
          const deletedWage = {
            ...wage,
            deleted_at: timestamp,
            updated_at: timestamp,
            _updated_at: timestamp,
            _deleted: timestamp,
            _synced: 0 as const
          };
          await localDb.wages.put(deletedWage);
          await localDb.syncQueue.add({
            ...createQueueItem(companyId, wage.id, "update", deletedWage, timestamp),
            entity: "wages"
          });
        }

        for (const advance of advances) {
          const deletedAdvance = {
            ...advance,
            deleted_at: timestamp,
            updated_at: timestamp,
            _updated_at: timestamp,
            _deleted: timestamp,
            _synced: 0 as const
          };
          await localDb.advances.put(deletedAdvance);
          await localDb.syncQueue.add({
            ...createQueueItem(companyId, advance.id, "update", deletedAdvance, timestamp),
            entity: "advances"
          });
        }

        for (const archive of relatedArchives) {
          const deletedArchive = {
            ...archive,
            deleted_at: timestamp,
            updated_at: timestamp,
            _updated_at: timestamp,
            _deleted: timestamp,
            _synced: 0 as const
          };
          await localDb.archives.put(deletedArchive);
          await localDb.syncQueue.add({
            ...createQueueItem(companyId, archive.id, "update", deletedArchive, timestamp),
            entity: "archives"
          });
        }
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر حذف العامل وبياناته المرتبطة: " + reason);
  }
}
