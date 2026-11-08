import { calculateExpenseTotals, filterExpenses, validateExpenseInput, type ExpenseFilters, type ExpenseInput } from "@taher/core";
import { localDb, type LocalExpense, type LocalArchive, type LocalCashTransaction, type SyncQueueItem } from "./local.db";

const now = () => new Date().toISOString();
const id = () => globalThis.crypto.randomUUID();
function queue(companyId:string, entity:string, recordId:string, operation:SyncQueueItem["operation"], payload:unknown, timestamp:string):SyncQueueItem {
  return { company_id:companyId, entity, record_id:recordId, operation, payload, status:"pending", retry_count:0, last_error:null, created_at:timestamp, updated_at:timestamp };
}
function active(row:{deleted_at:string|null;_deleted:string|null}):boolean { return row.deleted_at===null && row._deleted===null; }

export async function listExpenses(companyId:string, filters:ExpenseFilters = {}):Promise<LocalExpense[]> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");
  const rows = await localDb.expenses.where("company_id").equals(companyId).and(active).toArray();
  return filterExpenses(rows as never, filters) as LocalExpense[];
}
export async function getExpenseTotals(companyId:string) {
  return calculateExpenseTotals(await listExpenses(companyId) as never);
}
export async function saveExpense(companyId:string,input:ExpenseInput,userId:string|null,expenseId?:string):Promise<LocalExpense> {
  if (!companyId.trim()) throw new Error("معرّف الشركة مطلوب.");
  const data=validateExpenseInput(input); const timestamp=now();
  return localDb.transaction("rw",[localDb.expenses,localDb.cashTransactions,localDb.archives,localDb.syncQueue],async()=>{
    const previous=expenseId?await localDb.expenses.get(expenseId):undefined;
    if(expenseId&&(!previous||previous.company_id!==companyId||!active(previous)))throw new Error("المصروف غير موجود في هذه الشركة.");
    const record:LocalExpense={
      ...(previous??{} as LocalExpense),...data,id:previous?.id??id(),company_id:companyId,
      amount_ttc:data.amount_ht+data.tax_amount,cash_transaction_id:previous?.cash_transaction_id??null,
      created_by:previous?.created_by??userId,created_at:previous?.created_at??timestamp,
      updated_at:timestamp,deleted_at:null,_synced:0 as const,_updated_at:timestamp,_deleted:null
    };
    const oldCash=record.cash_transaction_id?await localDb.cashTransactions.get(record.cash_transaction_id):undefined;
    if(data.payment_method==="cash"){
      const cashData={company_id:companyId,transaction_date:data.expense_date,transaction_type:"expense" as const,
        description:"مصروف: "+data.expense_type,beneficiary:data.supplier,amount:record.amount_ttc,
        document_number:data.invoice_number??record.id,notes:data.notes,created_by:userId};
      if(oldCash&&oldCash.company_id===companyId&&oldCash.deleted_at===null){
        const updated:LocalCashTransaction={...oldCash,...cashData,updated_at:timestamp,_updated_at:timestamp,_synced:0 as const};
        await localDb.cashTransactions.put(updated);
        await localDb.syncQueue.add(queue(companyId,"cash_transactions",updated.id,"update",updated,timestamp));
      }else{
        const created:LocalCashTransaction={...cashData,id:id(),created_at:timestamp,updated_at:timestamp,deleted_at:null,_synced:0 as const,_updated_at:timestamp,_deleted:null};
        await localDb.cashTransactions.add(created);
        await localDb.syncQueue.add(queue(companyId,"cash_transactions",created.id,"insert",created,timestamp));
        record.cash_transaction_id=created.id;
      }
    }else if(oldCash&&oldCash.company_id===companyId&&oldCash.deleted_at===null){
      const deleted={...oldCash,deleted_at:timestamp,updated_at:timestamp,_updated_at:timestamp,_deleted:timestamp,_synced:0 as const};
      await localDb.cashTransactions.put(deleted);
      await localDb.syncQueue.add(queue(companyId,"cash_transactions",deleted.id,"update",deleted,timestamp));
      record.cash_transaction_id=null;
    }
    await localDb.expenses.put(record);
    await localDb.syncQueue.add(queue(companyId,"expenses",record.id,previous?"update":"insert",record,timestamp));
    const archive=await localDb.archives.where("[company_id+source_id]").equals([companyId,record.id]).first();
    if(archive){
      const updated:LocalArchive={...archive,document_type:"مصروف",counterparty:data.supplier,invoice_number:data.invoice_number,
        document_date:data.expense_date,amount:record.amount_ttc,notes:data.notes,updated_at:timestamp,_updated_at:timestamp,_synced:0 as const};
      await localDb.archives.put(updated);
      await localDb.syncQueue.add(queue(companyId,"archives",updated.id,"update",{...updated,file_blob:null},timestamp));
    }else if(!previous){
      const created:LocalArchive={id:id(),company_id:companyId,source_table:"expenses",source_id:record.id,document_type:"مصروف",
        counterparty:data.supplier,invoice_number:data.invoice_number,document_date:data.expense_date,amount:record.amount_ttc,
        cabinet:null,shelf:null,storage_path:null,delivered_to_accountant:false,delivered_at:null,notes:data.notes,file_blob:null,
        original_file_name:null,mime_type:null,file_size:null,created_at:timestamp,updated_at:timestamp,deleted_at:null,
        _synced:0 as const,_updated_at:timestamp,_deleted:null};
      await localDb.archives.add(created);
      await localDb.syncQueue.add(queue(companyId,"archives",created.id,"insert",created,timestamp));
    }
    return record;
  });
}
export async function deleteExpense(companyId:string,expenseId:string):Promise<void>{
  const timestamp=now();
  await localDb.transaction("rw",[localDb.expenses,localDb.cashTransactions,localDb.archives,localDb.syncQueue],async()=>{
    const row=await localDb.expenses.get(expenseId);
    if(!row||row.company_id!==companyId||!active(row))throw new Error("المصروف غير موجود.");
    const deleted={...row,deleted_at:timestamp,updated_at:timestamp,_updated_at:timestamp,_deleted:timestamp,_synced:0 as const};
    await localDb.expenses.put(deleted);
    await localDb.syncQueue.add(queue(companyId,"expenses",row.id,"update",deleted,timestamp));
    if(row.cash_transaction_id){
      const cash=await localDb.cashTransactions.get(row.cash_transaction_id);
      if(cash&&cash.company_id===companyId&&cash.deleted_at===null){
        const d={...cash,deleted_at:timestamp,updated_at:timestamp,_updated_at:timestamp,_deleted:timestamp,_synced:0 as const};
        await localDb.cashTransactions.put(d);await localDb.syncQueue.add(queue(companyId,"cash_transactions",cash.id,"update",d,timestamp));
      }
    }
    const archive=await localDb.archives.where("[company_id+source_id]").equals([companyId,row.id]).first();
    if(archive&&archive.deleted_at===null){
      const d={...archive,deleted_at:timestamp,updated_at:timestamp,_updated_at:timestamp,_deleted:timestamp,_synced:0 as const};
      await localDb.archives.put(d);await localDb.syncQueue.add(queue(companyId,"archives",archive.id,"update",{...d,file_blob:null},timestamp));
    }
  });
}
