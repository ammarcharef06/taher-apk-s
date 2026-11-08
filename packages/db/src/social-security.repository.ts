import {
  deriveSocialSecurityStatus,
  filterSocialSecurityDeclarations,
  validateSocialSecurityInput,
  type SocialSecurityFilters,
  type SocialSecurityInput,
  type SocialSecurityRecord
} from "@taher/core";
import {
  localDb,
  type LocalSocialSecurityDeclaration,
  type SyncQueueItem
} from "./local.db";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function queueItem(
  companyId: string,
  recordId: string,
  operation: SyncQueueItem["operation"],
  payload: unknown,
  timestamp: string
): SyncQueueItem {
  return {
    company_id: companyId,
    entity: "social_security_declarations",
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

export async function listSocialSecurityDeclarations(
  companyId: string,
  filters: SocialSecurityFilters = {}
): Promise<LocalSocialSecurityDeclaration[]> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");

  const records = await localDb.socialSecurityDeclarations
    .where("company_id")
    .equals(companyId)
    .and((record) => record.deleted_at === null)
    .toArray();

  return filterSocialSecurityDeclarations(
    records as SocialSecurityRecord[],
    filters
  );
}

export async function createSocialSecurityDeclaration(
  companyId: string,
  input: SocialSecurityInput,
  createdBy: string | null
): Promise<LocalSocialSecurityDeclaration> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");
  const validated = validateSocialSecurityInput(input);
  const timestamp = nowIso();

  const record: LocalSocialSecurityDeclaration = {
    ...validated,
    id: newId(),
    company_id: companyId,
    payment_status: deriveSocialSecurityStatus(
      validated.amount_due,
      validated.amount_paid
    ),
    created_by: createdBy,
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
      [localDb.socialSecurityDeclarations, localDb.syncQueue],
      async () => {
        await localDb.socialSecurityDeclarations.add(record);
        await localDb.syncQueue.add(
          queueItem(companyId, record.id, "insert", record, timestamp)
        );
      }
    );
    return record;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر إنشاء تصريح الضمان الاجتماعي: " + reason);
  }
}

export async function updateSocialSecurityDeclaration(
  companyId: string,
  declarationId: string,
  input: SocialSecurityInput
): Promise<LocalSocialSecurityDeclaration> {
  const validated = validateSocialSecurityInput(input);
  const timestamp = nowIso();

  try {
    return await localDb.transaction(
      "rw",
      [localDb.socialSecurityDeclarations, localDb.syncQueue],
      async () => {
        const current = await localDb.socialSecurityDeclarations.get(declarationId);
        if (
          !current ||
          current.company_id !== companyId ||
          current.deleted_at !== null
        ) {
          throw new Error("تصريح الضمان الاجتماعي غير موجود في هذه الشركة.");
        }

        const updated: LocalSocialSecurityDeclaration = {
          ...current,
          ...validated,
          payment_status: deriveSocialSecurityStatus(
            validated.amount_due,
            validated.amount_paid
          ),
          updated_at: timestamp,
          _updated_at: timestamp,
          _synced: 0
        };

        await localDb.socialSecurityDeclarations.put(updated);
        await localDb.syncQueue.add(
          queueItem(companyId, declarationId, "update", updated, timestamp)
        );
        return updated;
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر تعديل تصريح الضمان الاجتماعي: " + reason);
  }
}

export async function deleteSocialSecurityDeclaration(
  companyId: string,
  declarationId: string
): Promise<void> {
  const timestamp = nowIso();

  try {
    await localDb.transaction(
      "rw",
      [localDb.socialSecurityDeclarations, localDb.syncQueue],
      async () => {
        const current = await localDb.socialSecurityDeclarations.get(declarationId);
        if (
          !current ||
          current.company_id !== companyId ||
          current.deleted_at !== null
        ) {
          throw new Error("تصريح الضمان الاجتماعي غير موجود في هذه الشركة.");
        }

        const deleted: LocalSocialSecurityDeclaration = {
          ...current,
          deleted_at: timestamp,
          updated_at: timestamp,
          _updated_at: timestamp,
          _deleted: timestamp,
          _synced: 0
        };

        await localDb.socialSecurityDeclarations.put(deleted);
        await localDb.syncQueue.add(
          queueItem(companyId, declarationId, "update", deleted, timestamp)
        );
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر حذف تصريح الضمان الاجتماعي: " + reason);
  }
}
