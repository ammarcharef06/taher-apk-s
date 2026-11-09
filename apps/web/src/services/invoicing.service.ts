import {
  createLocalClient,
  createLocalInvoice,
  listLocalClients,
  listLocalInvoices,
  recordLocalInvoicePayment,
  type CreateInvoiceInput,
  type RecordInvoicePaymentInput
} from "@taher/db";
import { supabase } from "../stores/auth.store";

function client() {
  if (!supabase) throw new Error("Supabase غير مهيأ.");
  return supabase;
}
export type InvoiceLine = { description: string; quantity: number; unit_price: number; tva_rate: number };
export async function listClients(companyId: string) {
  return listLocalClients(companyId);
}
export async function addClient(companyId: string, input: { name: string; email: string; phone: string }) {
  return createLocalClient(companyId, input);
}
export async function listInvoices(companyId: string) {
  return listLocalInvoices(companyId);
}
export async function saveInvoice(p: {
  companyId: string; clientId: string; number: string; issueDate: string;
  dueDate: string | null; currency: string; notes: string; items: InvoiceLine[]; createdBy: string | null;
}) {
  const input: CreateInvoiceInput = {
    client_id: p.clientId,
    invoice_number: p.number,
    issue_date: p.issueDate,
    due_date: p.dueDate,
    currency_code: p.currency,
    notes: p.notes,
    items: p.items
  };
  return createLocalInvoice(p.companyId, input, p.createdBy);
}
export async function recordInvoicePayment(p: {
  companyId: string; invoiceId: string; payment: RecordInvoicePaymentInput; createdBy: string | null;
}) {
  return recordLocalInvoicePayment(p.companyId, p.invoiceId, p.payment, p.createdBy);
}
export async function mintPortalUrl(companyId: string, clientId: string) {
  const { data, error } = await client().rpc("issue_client_portal_token", {
    p_company_id: companyId,
    p_client_id: clientId,
    p_expires_at: null
  });
  if (error) throw error;
  return window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "") + "/portal/" + encodeURIComponent(data as string);
}
