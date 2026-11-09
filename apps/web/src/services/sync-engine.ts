import type { Table } from "dexie";
import {
  chooseSyncWinner,
  sanitizeSyncPayload,
  syncCursorStart,
  type SyncEntity
} from "@taher/core";
import {
  localDb,
  type LocalArchive,
  type LocalCorrectionLog,
  type LocalSyncState,
  type SyncQueueItem
} from "@taher/db";
import { supabase } from "../stores/auth.store";
import { syncPendingArchiveFiles } from "./archive-storage";

const PAGE_SIZE = 500;
const TABLES: Record<SyncEntity, Table<any, any>> = {
  workers: localDb.workers,
  cash_transactions: localDb.cashTransactions,
  cash_opening_balances: localDb.cashOpeningBalances,
  wages: localDb.wages,
  wage_payments: localDb.wagePayments,
  advances: localDb.advances,
  social_security_declarations: localDb.socialSecurityDeclarations,
  expenses: localDb.expenses,
  archives: localDb.archives,
  clients: localDb.clients,
  invoices: localDb.invoices,
  invoice_items: localDb.invoiceItems,
  invoice_payments: localDb.invoicePayments
};
const PULL_FIELD: Record<SyncEntity, "updated_at" | "created_at"> = {
  workers: "updated_at",
  cash_transactions: "updated_at",
  cash_opening_balances: "updated_at",
  wages: "updated_at",
  wage_payments: "created_at",
  advances: "updated_at",
  social_security_declarations: "updated_at",
  expenses: "updated_at",
  archives: "updated_at",
  clients: "updated_at",
  invoices: "updated_at",
  invoice_items: "created_at",
  invoice_payments: "created_at"
};

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  pending: number;
  failed: number;
  completedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("بيانات المزامنة غير صالحة.");
  }
  return value as Record<string, unknown>;
}

function allowedPullEntities(role: string): SyncEntity[] {
  if (role === "company_admin" || role === "manager" || role === "super_admin") {
    return Object.keys(TABLES) as SyncEntity[];
  }
  if (role === "accountant") {
    return [
      "workers", "wages", "wage_payments", "advances",
      "social_security_declarations", "expenses", "archives",
      "clients", "invoices", "invoice_items", "invoice_payments"
    ];
  }
  if (role === "data_entry") {
    return ["workers", "cash_transactions", "advances", "expenses", "archives", "clients", "invoices", "invoice_items", "invoice_payments"];
  }
  return [];
}

async function recordLocalConflict(
  companyId: string,
  entity: string,
  recordId: string,
  local: unknown,
  remote: unknown
): Promise<void> {
  const row: LocalCorrectionLog = {
    id: globalThis.crypto.randomUUID(),
    company_id: companyId,
    actor_user_id: null,
    table_name: entity,
    record_id: recordId,
    conflict_resolution: "server_wins_newer_updated_at",
    previous_data: local,
    accepted_data: remote,
    created_at: new Date().toISOString(),
    _synced: 1,
    _updated_at: new Date().toISOString(),
    _deleted: null
  };
  await localDb.correctionLogs.put(row);
}

async function applyRemoteRecord(
  companyId: string,
  entity: SyncEntity,
  remoteInput: Record<string, unknown>,
  forceServer: boolean = false,
  acceptedClientUpdatedAt?: string
): Promise<"applied" | "local_wins" | "unchanged"> {
  const remote = { ...remoteInput };
  const recordId = String(remote.id ?? "");
  if (!recordId || String(remote.company_id ?? "") !== companyId) {
    throw new Error("تجاهل سجل وارد لا يطابق الشركة الحالية.");
  }
  const table = TABLES[entity];
  return localDb.transaction("rw", [table, localDb.syncQueue, localDb.correctionLogs, localDb.invoicePayments], async () => {
    let local = await table.get(recordId);
    // Financial inserts may create their archive row server-side before the local
    // archive queue item arrives. Match that row by its natural source key.
    if (entity === "archives" && !local && remote.source_id) {
      local = await localDb.archives
        .where("[company_id+source_id]")
        .equals([companyId, String(remote.source_id)])
        .first();
    }
    const localRecordId = String(local?.id ?? recordId);
    const queued = await localDb.syncQueue
      .where("company_id").equals(companyId)
      .and((item) => item.entity === entity && item.record_id === localRecordId)
      .toArray();

    if (local && queued.length > 0 && acceptedClientUpdatedAt) {
      const localTime = Date.parse(String(local.updated_at ?? local._updated_at ?? local.created_at ?? ""));
      const acceptedTime = Date.parse(acceptedClientUpdatedAt);
      if (Number.isFinite(localTime) && Number.isFinite(acceptedTime) && localTime > acceptedTime) {
        return "local_wins";
      }
    }

    if (local && queued.length > 0 && !forceServer) {
      const winner = chooseSyncWinner(
        { updated_at: local.updated_at, _updated_at: local._updated_at, created_at: local.created_at },
        { updated_at: remote.updated_at as string | undefined, created_at: remote.created_at as string | undefined }
      );
      if (winner === "local") return "local_wins";
      await recordLocalConflict(companyId, entity, recordId, local, remote);
      await localDb.syncQueue.bulkDelete(queued.flatMap((item) => item.id === undefined ? [] : [item.id]));
    } else if (forceServer && queued.length > 0) {
      await localDb.syncQueue.bulkDelete(queued.flatMap((item) => item.id === undefined ? [] : [item.id]));
    }

    if (local && String(local.id) !== recordId) await table.delete(String(local.id));
    const updatedAt = String(remote.updated_at ?? remote.created_at ?? new Date().toISOString());
    const localArchive = entity === "archives" && local ? local as LocalArchive : null;
    const localOnly = localArchive ? {
      file_blob: localArchive.file_blob,
      original_file_name: remote.original_file_name ?? localArchive.original_file_name,
      mime_type: remote.mime_type ?? localArchive.mime_type,
      file_size: remote.file_size ?? localArchive.file_size,
      storage_path: remote.storage_path ?? localArchive.storage_path
    } : {};
    let acceptedRemote = remote;
    if (entity === "invoices") {
      // Keep unpushed local payments visible if a pull races a failed/interrupted
      // payment push. Once the payment RPC is accepted, its row is marked synced.
      const pendingPayments = await localDb.invoicePayments
        .where("[company_id+invoice_id]").equals([companyId, recordId])
        .and((payment) => payment._synced === 0)
        .toArray();
      if (pendingPayments.length > 0) {
        const paid = Number(remote.paid_amount ?? 0) +
          pendingPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const total = Number(remote.total ?? 0);
        acceptedRemote = {
          ...remote,
          paid_amount: Math.round((paid + Number.EPSILON) * 100) / 100,
          status: total > 0 && paid >= total ? "paid" : paid > 0 ? "partial" : remote.status
        };
      }
    }
    await table.put({
      ...acceptedRemote,
      ...localOnly,
      _synced: 1,
      _updated_at: updatedAt,
      _deleted: (remote.deleted_at as string | null | undefined) ?? null
    });
    return local ? "applied" : "unchanged";
  });
}

async function pushPending(companyId: string): Promise<{ pushed: number; conflicts: number; failed: number }> {
  if (!supabase) throw new Error("Supabase غير مهيأ.");
  const queue = await localDb.syncQueue
    .where("company_id").equals(companyId)
    .and((item) => item.status === "pending" || item.status === "failed")
    .sortBy("created_at");

  // Collapse multiple offline edits of the same row to the newest snapshot.
  // Sending an older queued snapshot first could advance the server timestamp
  // and incorrectly make a later local snapshot appear stale.
  const groups = new Map<string, SyncQueueItem[]>();
  for (const item of queue) {
    const key = item.entity + "\\u0000" + item.record_id;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const entityPriority: Record<string, number> = {
    clients: 0, invoices: 1, invoice_items: 2, invoice_payments: 3
  };
  const latestGroups = [...groups.values()].sort((a, b) => {
    const left = a[a.length - 1], right = b[b.length - 1];
    const timeOrder = (left?.created_at ?? "").localeCompare(right?.created_at ?? "");
    if (timeOrder !== 0) return timeOrder;
    return (entityPriority[left?.entity ?? ""] ?? 4) - (entityPriority[right?.entity ?? ""] ?? 4);
  });

  let pushed = 0;
  let conflicts = 0;
  let failed = 0;

  for (const group of latestGroups) {
    const item = group[group.length - 1];
    const ids = group.flatMap((entry) => entry.id === undefined ? [] : [entry.id]);
    if (item.id === undefined || ids.length === 0) continue;
    await localDb.syncQueue.bulkUpdate(group.flatMap((entry) =>
      entry.id === undefined ? [] : [{ key: entry.id, changes: { status: "processing" as const, updated_at: new Date().toISOString() } }]
    ));
    try {
      const payload = sanitizeSyncPayload(item.entity, asRecord(item.payload));
      let responseData: unknown;
      if (item.entity === "invoice_payments") {
        const { data, error } = await supabase.rpc("sync_apply_invoice_payment", { p_record: payload });
        if (error) throw new Error(error.message);
        responseData = data;
      } else {
        const { data, error } = await supabase.rpc("sync_apply_record", {
          p_entity: item.entity,
          p_record: payload
        });
        if (error) throw new Error(error.message);
        responseData = data;
      }
      const response = asRecord(responseData);
      const remote = asRecord(response.record);
      if (item.entity === "invoice_payments") {
        await applyRemoteRecord(companyId, "invoice_payments", remote, true);
        if (response.cash_transaction) {
          await applyRemoteRecord(companyId, "cash_transactions", asRecord(response.cash_transaction), true);
        }
      } else if (response.applied === false && item.entity !== "wage_payments") {
        conflicts += 1;
        await applyRemoteRecord(
          companyId,
          item.entity as SyncEntity,
          remote,
          false,
          String(payload.updated_at ?? payload.created_at ?? "")
        );
      } else {
        await applyRemoteRecord(
          companyId,
          item.entity as SyncEntity,
          remote,
          true,
          String(payload.updated_at ?? payload.created_at ?? "")
        );
      }
      await localDb.syncQueue.bulkDelete(ids);
      pushed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "خطأ مزامنة غير معروف.";
      await localDb.syncQueue.bulkUpdate(group.flatMap((entry) =>
        entry.id === undefined ? [] : [{
          key: entry.id,
          changes: {
            status: "failed" as const,
            retry_count: entry.retry_count + 1,
            last_error: message.slice(0, 1000),
            updated_at: new Date().toISOString()
          }
        }]
      ));
    }
  }
  return { pushed, conflicts, failed };
}

async function pullEntity(companyId: string, entity: SyncEntity, watermark: string): Promise<number> {
  if (!supabase) throw new Error("Supabase غير مهيأ.");
  const field = PULL_FIELD[entity];
  const stateId = companyId + ":" + entity;
  const state = await localDb.syncStates.get(stateId);
  const since = syncCursorStart(state?.last_pulled_at ?? null);
  let offset = 0;
  let pulled = 0;
  let pageCount = 0;

  while (true) {
    let query = supabase.from(entity).select("*").eq("company_id", companyId).lte(field, watermark);
    if (since) query = query.gte(field, since);
    const { data, error } = await query.order(field, { ascending: true }).order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("تعذر سحب " + entity + ": " + error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      const result = await applyRemoteRecord(companyId, entity, row);
      if (result === "applied" || result === "unchanged") pulled += 1;
    }
    pageCount = rows.length;
    if (pageCount < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const nextState: LocalSyncState = {
    id: stateId,
    company_id: companyId,
    entity,
    last_pulled_at: watermark,
    updated_at: new Date().toISOString()
  };
  await localDb.syncStates.put(nextState);
  return pulled;
}

export async function runCompanySync(companyId: string, role: string): Promise<SyncResult> {
  if (!companyId.trim()) throw new Error("يجب اختيار شركة قبل المزامنة.");
  if (!navigator.onLine) throw new Error("لا يوجد اتصال بالإنترنت حالياً.");
  if (!supabase) throw new Error("لم يتم إعداد اتصال Supabase.");

  // A stale processing marker means the previous tab closed during a push.
  await localDb.syncQueue
    .where("company_id").equals(companyId)
    .and((item) => item.status === "processing")
    .modify({ status: "pending", updated_at: new Date().toISOString() });

  const pushed = await pushPending(companyId);
  const watermark = new Date().toISOString();
  let pulled = 0;
  for (const entity of allowedPullEntities(role)) {
    pulled += await pullEntity(companyId, entity, watermark);
  }

  // Binary attachments stay in IndexedDB until the private Storage upload succeeds.
  // Their metadata/path then returns through the ordinary idempotent sync queue.
  await syncPendingArchiveFiles(companyId);
  const fileMetadataPush = await pushPending(companyId);

  const pending = await localDb.syncQueue
    .where("company_id").equals(companyId)
    .count();
  const failed = await localDb.syncQueue
    .where("company_id").equals(companyId)
    .and((item) => item.status === "failed")
    .count();

  return {
    pushed: pushed.pushed + fileMetadataPush.pushed,
    pulled,
    conflicts: pushed.conflicts + fileMetadataPush.conflicts,
    pending,
    failed: Math.max(failed, pushed.failed + fileMetadataPush.failed),
    completedAt: new Date().toISOString()
  };
}

export async function countPendingSync(companyId: string): Promise<number> {
  if (!companyId) return 0;
  return localDb.syncQueue.where("company_id").equals(companyId).count();
}
