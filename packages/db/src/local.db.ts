import Dexie, { type Table } from "dexie";

export type SyncFlag = 0 | 1;

export interface SyncMetadata {
  _synced: SyncFlag;
  _updated_at: string;
  _deleted: string | null;
}

export interface LocalCompany {
  id: string;
  name: string;
  owner_name: string;
  logo_path: string | null;
  fiscal_year_start_month: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  _synced: SyncFlag;
  _updated_at: string;
  _deleted: string | null;
}

export interface LocalProfile extends SyncMetadata {
  id: string;
  display_name: string;
  phone: string | null;
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalMembership extends SyncMetadata {
  id: string;
  company_id: string;
  user_id: string;
  role: "super_admin" | "company_admin" | "manager" | "accountant" | "data_entry" | "client";
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalWorker extends SyncMetadata {
  id: string;
  company_id: string;
  full_name: string;
  phone: string | null;
  job_title: string | null;
  start_date: string;
  daily_wage: number;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalCashTransaction extends SyncMetadata {
  id: string;
  company_id: string;
  transaction_date: string;
  transaction_type: "income" | "expense";
  description: string;
  beneficiary: string | null;
  amount: number;
  document_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalCashOpeningBalance extends SyncMetadata {
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

export interface LocalWage extends SyncMetadata {
  id: string;
  company_id: string;
  worker_id: string;
  wage_month: string;
  work_days: number;
  daily_rate: number;
  base_amount: number;
  overtime_hours: number;
  overtime_amount: number;
  bonuses: number;
  deductions: number;
  advances_deducted: number;
  carried_balance: number;
  net_due: number;
  paid_amount: number;
  receipt_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalWagePayment {
  id: string;
  company_id: string;
  wage_id: string;
  worker_id: string;
  payment_date: string;
  amount: number;
  payment_method: "cash" | "bank";
  cash_transaction_id: string | null;
  receipt_number: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LocalAdvance extends SyncMetadata {
  id: string;
  company_id: string;
  worker_id: string;
  advance_type: "advance_issued" | "purchase_expense" | "repayment" | "wage_deduction";
  movement_date: string;
  amount: number;
  description: string | null;
  document_number: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalSocialSecurityDeclaration extends SyncMetadata {
  id: string;
  company_id: string;
  agency: "CNAS" | "CASNOS";
  declaration_period: string;
  declaration_type: string;
  amount_due: number;
  amount_paid: number;
  payment_date: string | null;
  payment_status: "paid" | "unpaid" | "partial";
  receipt_number: string | null;
  archive_location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalExpense extends SyncMetadata {
  id: string;
  company_id: string;
  expense_date: string;
  expense_type: string;
  supplier: string | null;
  invoice_number: string | null;
  amount_ht: number;
  tax_amount: number;
  amount_ttc: number;
  cash_transaction_id: string | null;
  payment_method: "cash" | "bank" | "credit";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalArchive extends SyncMetadata {
  id: string;
  company_id: string;
  source_table: string | null;
  source_id: string | null;
  document_type: string;
  counterparty: string | null;
  invoice_number: string | null;
  document_date: string;
  amount: number;
  cabinet: string | null;
  shelf: string | null;
  storage_path: string | null;
  delivered_to_accountant: boolean;
  delivered_at: string | null;
  notes: string | null;
  file_blob: Blob | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalAuditLog extends SyncMetadata {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
}

export interface LocalCorrectionLog extends SyncMetadata {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  table_name: string;
  record_id: string;
  conflict_resolution: string;
  previous_data: unknown;
  accepted_data: unknown;
  created_at: string;
}

export interface LocalClient extends SyncMetadata {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalClientAccessToken extends SyncMetadata {
  id: string;
  company_id: string;
  client_id: string;
  token_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalClientSignature extends SyncMetadata {
  id: string;
  company_id: string;
  client_id: string;
  archive_id: string | null;
  signer_name: string;
  signature_storage_path: string | null;
  signed_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SyncQueueItem {
  id?: number;
  company_id: string;
  entity: string;
  record_id: string;
  operation: "insert" | "update" | "delete";
  payload: unknown;
  status: "pending" | "processing" | "failed";
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

class TaherLocalDatabase extends Dexie {
  companies!: Table<LocalCompany, string>;
  profiles!: Table<LocalProfile, string>;
  memberships!: Table<LocalMembership, string>;
  clients!: Table<LocalClient, string>;
  workers!: Table<LocalWorker, string>;
  cashTransactions!: Table<LocalCashTransaction, string>;
  cashOpeningBalances!: Table<LocalCashOpeningBalance, string>;
  wages!: Table<LocalWage, string>;
  wagePayments!: Table<LocalWagePayment, string>;
  advances!: Table<LocalAdvance, string>;
  socialSecurityDeclarations!: Table<LocalSocialSecurityDeclaration, string>;
  expenses!: Table<LocalExpense, string>;
  archives!: Table<LocalArchive, string>;
  auditLogs!: Table<LocalAuditLog, string>;
  correctionLogs!: Table<LocalCorrectionLog, string>;
  clientAccessTokens!: Table<LocalClientAccessToken, string>;
  clientSignatures!: Table<LocalClientSignature, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("taher-accounting-ng");

    this.version(1).stores({
      companies: "&id, name, updated_at, _synced",
      profiles: "&id, display_name, updated_at",
      memberships: "&id, company_id, user_id, role, is_active, [company_id+user_id], _synced",
      clients: "&id, company_id, user_id, name, updated_at, _synced, _deleted",
      workers: "&id, company_id, full_name, status, [company_id+status], updated_at, _synced, _deleted",
      cashTransactions: "&id, company_id, transaction_date, transaction_type, [company_id+transaction_date], updated_at, _synced, _deleted",
      cashOpeningBalances: "&id, company_id, period_start, [company_id+period_start], updated_at, _synced, _deleted",
      wages: "&id, company_id, worker_id, wage_month, [worker_id+wage_month], [company_id+wage_month], updated_at, _synced, _deleted",
      advances: "&id, company_id, worker_id, movement_date, advance_type, [company_id+worker_id], updated_at, _synced, _deleted",
      socialSecurityDeclarations: "&id, company_id, agency, declaration_period, [company_id+declaration_period], updated_at, _synced, _deleted",
      expenses: "&id, company_id, expense_date, expense_type, payment_method, [company_id+expense_date], updated_at, _synced, _deleted",
      archives: "&id, company_id, document_date, document_type, [company_id+document_date], source_id, updated_at, _synced, _deleted",
      auditLogs: "&id, company_id, created_at, table_name, record_id",
      correctionLogs: "&id, company_id, created_at, table_name, record_id",
      clientAccessTokens: "&id, company_id, client_id, token_hash, expires_at, revoked_at, _synced, _deleted",
      clientSignatures: "&id, company_id, client_id, archive_id, signed_at, _synced, _deleted",
      syncQueue: "++id, company_id, entity, record_id, operation, status, created_at"
    });

    this.version(2).stores({
      wagePayments: "&id, company_id, wage_id, worker_id, payment_date, receipt_number, [company_id+wage_id], [worker_id+payment_date]"
    });

    this.version(3).stores({
      archives: "&id, company_id, document_date, document_type, [company_id+document_date], [company_id+source_id], source_id, updated_at, _synced, _deleted"
    });
  }
}

export const localDb = new TaherLocalDatabase();

export async function openLocalDatabase(): Promise<void> {
  try {
    await localDb.open();
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "سبب غير معروف";
    throw new Error("تعذر فتح قاعدة البيانات المحلية: " + reason);
  }
}

export async function clearLocalCompanyData(companyId: string): Promise<void> {
  if (!companyId.trim()) {
    throw new Error("معرّف الشركة مطلوب لمسح البيانات المحلية.");
  }

  await localDb.transaction(
    "rw",
    [
      localDb.memberships,
      localDb.clients,
      localDb.workers,
      localDb.cashTransactions,
      localDb.cashOpeningBalances,
      localDb.wages,
      localDb.wagePayments,
      localDb.advances,
      localDb.socialSecurityDeclarations,
      localDb.expenses,
      localDb.archives,
      localDb.auditLogs,
      localDb.correctionLogs,
      localDb.clientAccessTokens,
      localDb.clientSignatures,
      localDb.syncQueue
    ],
    async () => {
      await Promise.all([
        localDb.memberships.where("company_id").equals(companyId).delete(),
        localDb.clients.where("company_id").equals(companyId).delete(),
        localDb.workers.where("company_id").equals(companyId).delete(),
        localDb.cashTransactions.where("company_id").equals(companyId).delete(),
        localDb.cashOpeningBalances.where("company_id").equals(companyId).delete(),
        localDb.wages.where("company_id").equals(companyId).delete(),
        localDb.wagePayments.where("company_id").equals(companyId).delete(),
        localDb.advances.where("company_id").equals(companyId).delete(),
        localDb.socialSecurityDeclarations.where("company_id").equals(companyId).delete(),
        localDb.expenses.where("company_id").equals(companyId).delete(),
        localDb.archives.where("company_id").equals(companyId).delete(),
        localDb.auditLogs.where("company_id").equals(companyId).delete(),
        localDb.correctionLogs.where("company_id").equals(companyId).delete(),
        localDb.clientAccessTokens.where("company_id").equals(companyId).delete(),
        localDb.clientSignatures.where("company_id").equals(companyId).delete(),
        localDb.syncQueue.where("company_id").equals(companyId).delete()
      ]);
    }
  );
}
