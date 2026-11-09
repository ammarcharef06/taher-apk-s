import {
  localDb,
  type LocalClient,
  type LocalInvoice,
  type LocalInvoiceItem,
  type LocalInvoicePayment,
  type LocalCashTransaction,
  type SyncQueueItem
} from "./local.db";

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
}
export interface CreateInvoiceInput {
  client_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  currency_code: string;
  notes: string | null;
  items: InvoiceLineInput[];
}
export interface RecordInvoicePaymentInput {
  payment_date: string;
  amount: number;
  payment_method: "cash" | "bank";
  reference: string | null;
  notes: string | null;
}
export interface InvoiceWithClient extends LocalInvoice {
  client: Pick<LocalClient, "id" | "name" | "email"> | null;
}
export interface InvoicePaymentResult {
  invoice: LocalInvoice;
  payment: LocalInvoicePayment;
  cash_transaction: LocalCashTransaction | null;
}

function nowIso(): string { return new Date().toISOString(); }
function newId(): string { return globalThis.crypto.randomUUID(); }
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function queueItem(companyId: string, entity: string, recordId: string, payload: unknown, timestamp: string): SyncQueueItem {
  return { company_id: companyId, entity, record_id: recordId, operation: "insert", payload, status: "pending", retry_count: 0, last_error: null, created_at: timestamp, updated_at: timestamp };
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

export async function listLocalClients(companyId: string): Promise<LocalClient[]> {
  if (!companyId.trim()) return [];
  return localDb.clients.where("company_id").equals(companyId)
    .and((row) => row.deleted_at === null && row._deleted === null)
    .toArray().then(rows => rows.sort((a,b)=>a.name.localeCompare(b.name)));
}

export async function createLocalClient(companyId: string, input: { name: string; email: string; phone: string }): Promise<LocalClient> {
  const name=input.name.trim();
  if (!companyId.trim() || name.length<2) throw new Error("اسم العميل مطلوب ويجب ألا يقل عن حرفين.");
  const timestamp=nowIso();
  const record: LocalClient = {
    id:newId(), company_id:companyId, user_id:null, name,
    email:input.email.trim().toLowerCase()||null, phone:input.phone.trim()||null, notes:null,
    created_at:timestamp, updated_at:timestamp, deleted_at:null,
    _synced:0, _updated_at:timestamp, _deleted:null
  };
  await localDb.transaction("rw",[localDb.clients,localDb.syncQueue],async()=>{
    await localDb.clients.add(record);
    await localDb.syncQueue.add(queueItem(companyId,"clients",record.id,record,timestamp));
  });
  return record;
}

export async function listLocalInvoices(companyId: string): Promise<InvoiceWithClient[]> {
  if (!companyId.trim()) return [];
  const [invoices,clients]=await Promise.all([
    localDb.invoices.where("company_id").equals(companyId).and(row=>row.deleted_at===null&&row._deleted===null).toArray(),
    listLocalClients(companyId)
  ]);
  const byId=new Map(clients.map(client=>[client.id,client]));
  return invoices.sort((a,b)=>b.issue_date.localeCompare(a.issue_date)||b.created_at.localeCompare(a.created_at))
    .map(invoice=>({ ...invoice, client: byId.has(invoice.client_id) ? {id:byId.get(invoice.client_id)!.id,name:byId.get(invoice.client_id)!.name,email:byId.get(invoice.client_id)!.email} : null }));
}

export async function createLocalInvoice(companyId: string, input: CreateInvoiceInput, createdBy: string | null): Promise<LocalInvoice> {
  if (!companyId.trim() || !input.client_id.trim()) throw new Error("الشركة والعميل مطلوبان.");
  if (!input.invoice_number.trim() || !validDate(input.issue_date) || (input.due_date && !validDate(input.due_date))) throw new Error("رقم الفاتورة أو التاريخ غير صالح.");
  if (!Array.isArray(input.items) || input.items.length===0) throw new Error("يجب إضافة بند واحد على الأقل.");
  const normalized=input.items.map(item=>{
    const description=item.description.trim(), quantity=Number(item.quantity), unitPrice=Number(item.unit_price), rate=Number(item.tva_rate);
    if(!description||description.length>500||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<0||!Number.isFinite(rate)||rate<0||rate>100) throw new Error("تحقق من وصف وكمية وسعر ونسبة TVA لكل بند.");
    const normalizedQuantity=Math.round(quantity*1000)/1000;
    const normalizedPrice=roundMoney(unitPrice);
    const normalizedRate=Math.round(rate*100)/100;
    if(normalizedQuantity<=0) throw new Error("كمية البند يجب أن تكون أكبر من صفر بعد التقريب.");
    const lineSubtotal=roundMoney(normalizedQuantity*normalizedPrice);
    return {description,quantity:normalizedQuantity,unit_price:normalizedPrice,tva_rate:normalizedRate,line_subtotal:lineSubtotal,line_tax:roundMoney(normalizedQuantity*normalizedPrice*normalizedRate/100)};
  });
  const timestamp=nowIso(), invoiceId=newId();
  const subtotal=roundMoney(normalized.reduce((sum,item)=>sum+item.line_subtotal,0));
  const taxTotal=roundMoney(normalized.reduce((sum,item)=>sum+item.line_tax,0));
  const invoice: LocalInvoice={
    id:invoiceId,company_id:companyId,client_id:input.client_id,invoice_number:input.invoice_number.trim(),
    issue_date:input.issue_date,due_date:input.due_date,currency_code:input.currency_code.toUpperCase(),
    status:"sent",subtotal,tax_total:taxTotal,total:roundMoney(subtotal+taxTotal),paid_amount:0,
    notes:input.notes?.trim()||null,archive_id:null,created_by:createdBy,
    created_at:timestamp,updated_at:timestamp,deleted_at:null,_synced:0,_updated_at:timestamp,_deleted:null
  };
  const items:LocalInvoiceItem[]=normalized.map(item=>({
    id:newId(),company_id:companyId,invoice_id:invoiceId,...item,created_at:timestamp,
    _synced:0,_updated_at:timestamp,_deleted:null
  }));
  await localDb.transaction("rw",[localDb.clients,localDb.invoices,localDb.invoiceItems,localDb.syncQueue],async()=>{
    const client=await localDb.clients.get(input.client_id);
    if(!client||client.company_id!==companyId||client.deleted_at!==null) throw new Error("العميل غير موجود محلياً في هذه الشركة.");
    const duplicate=await localDb.invoices.where("company_id").equals(companyId).and(row=>row.invoice_number===invoice.invoice_number&&row.deleted_at===null).first();
    if(duplicate) throw new Error("رقم الفاتورة مستخدم بالفعل في هذه الشركة.");
    await localDb.invoices.add(invoice);
    await localDb.syncQueue.add(queueItem(companyId,"invoices",invoice.id,invoice,timestamp));
    await localDb.invoiceItems.bulkAdd(items);
    await localDb.syncQueue.bulkAdd(items.map(item=>queueItem(companyId,"invoice_items",item.id,item,timestamp)));
  });
  return invoice;
}

export async function listLocalInvoicePayments(companyId: string, invoiceId: string): Promise<LocalInvoicePayment[]> {
  return localDb.invoicePayments.where("[company_id+invoice_id]").equals([companyId,invoiceId]).toArray()
    .then(rows=>rows.sort((a,b)=>b.payment_date.localeCompare(a.payment_date)||b.created_at.localeCompare(a.created_at)));
}

export async function recordLocalInvoicePayment(companyId: string, invoiceId: string, input: RecordInvoicePaymentInput, createdBy: string | null): Promise<InvoicePaymentResult> {
  if(!validDate(input.payment_date)) throw new Error("تاريخ الدفعة غير صالح.");
  if(input.payment_method!=="cash"&&input.payment_method!=="bank") throw new Error("طريقة الدفع غير صالحة.");
  const amount=roundMoney(Number(input.amount));
  if(!Number.isFinite(Number(input.amount))||amount<=0) throw new Error("مبلغ الدفعة يجب أن يكون أكبر من صفر.");
  const timestamp=nowIso(), paymentId=newId(), cashId=input.payment_method==="cash"?newId():null;
  try {
    return await localDb.transaction("rw",[localDb.clients,localDb.invoices,localDb.invoicePayments,localDb.cashTransactions,localDb.syncQueue],async()=>{
      const invoice=await localDb.invoices.get(invoiceId);
      if(!invoice||invoice.company_id!==companyId||invoice.deleted_at!==null) throw new Error("الفاتورة غير موجودة في هذه الشركة.");
      const client=await localDb.clients.get(invoice.client_id);
      if(!client||client.company_id!==companyId) throw new Error("العميل المرتبط بالفاتورة غير متاح.");
      const remaining=roundMoney(invoice.total-invoice.paid_amount);
      if(amount>remaining) throw new Error("مبلغ الدفعة يتجاوز الرصيد المتبقي.");
      const payment:LocalInvoicePayment={
        id:paymentId,company_id:companyId,invoice_id:invoiceId,payment_date:input.payment_date,amount,
        payment_method:input.payment_method,reference:input.reference?.trim()||null,notes:input.notes?.trim()||null,
        created_by:createdBy,created_at:timestamp,cash_transaction_id:cashId,_synced:0,_updated_at:timestamp,_deleted:null
      };
      let cash:LocalCashTransaction|null=null;
      if(cashId){
        cash={
          id:cashId,company_id:companyId,transaction_date:input.payment_date,transaction_type:"income",
          description:"تحصيل فاتورة: "+invoice.invoice_number,beneficiary:client.name,amount,
          document_number:payment.reference||invoice.invoice_number,notes:payment.notes,created_by:createdBy,
          created_at:timestamp,updated_at:timestamp,deleted_at:null,_synced:0,_updated_at:timestamp,_deleted:null
        };
        await localDb.cashTransactions.add(cash);
      }
      const paid=roundMoney(invoice.paid_amount+amount);
      const updated:LocalInvoice={...invoice,paid_amount:paid,status:paid>=invoice.total?"paid":"partial",updated_at:timestamp,_updated_at:timestamp,_synced:0};
      await localDb.invoicePayments.add(payment);
      await localDb.invoices.put(updated);
      await localDb.syncQueue.add(queueItem(companyId,"invoice_payments",payment.id,payment,timestamp));
      return {invoice:updated,payment,cash_transaction:cash};
    });
  } catch(error) {
    const reason=error instanceof Error?error.message:"سبب غير معروف";
    throw new Error("تعذر تسجيل دفعة الفاتورة محلياً: "+reason);
  }
}
