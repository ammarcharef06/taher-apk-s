<script setup lang="ts">
import { useToast } from "../composables/toast";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth.store";
import {
  addClient, listClients, listInvoices, mintPortalUrl, recordInvoicePayment, saveInvoice,
  type InvoiceLine
} from "../services/invoicing.service";

const auth = useAuthStore();
const toast = useToast();
const companyId = computed(() => auth.activeMembership?.company_id ?? "");
const allowed = computed(() => ["company_admin", "manager"].includes(auth.activeRole ?? ""));
const clients = ref<any[]>([]);
const invoices = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const message = ref("");
watch([error, message], ([failure, success]) => { if (failure) toast.error(failure); if (success) toast.success(success); });
const open = ref(false);
const newClient = ref(false);
const portal = ref("");
const paymentInvoice = ref<any | null>(null);
const cform = reactive({ name: "", email: "", phone: "" });
const today = new Date().toISOString().slice(0, 10);
const form = reactive({
  clientId: "", number: "", issueDate: today, dueDate: "", notes: "",
  items: [{ description: "", quantity: 1, unit_price: 0, tva_rate: 19 }] as InvoiceLine[]
});
const paymentForm = reactive({
  paymentDate: today, amount: 0, paymentMethod: "cash" as "cash" | "bank", reference: "", notes: ""
});
const sums = computed(() => form.items.reduce((a, x) => {
  const n = Math.max(0, Number(x.quantity) || 0) * Math.max(0, Number(x.unit_price) || 0);
  return { sub: a.sub + n, tax: a.tax + n * (Number(x.tva_rate) || 0) / 100 };
}, { sub: 0, tax: 0 }));
const money = (n: number, cur = auth.activeCompany?.currency_code || "DZD") =>
  new Intl.NumberFormat("ar-DZ", { style: "currency", currency: cur }).format(Number(n) || 0);

async function load() {
  if (!companyId.value) return;
  loading.value = true;
  error.value = "";
  try {
    [clients.value, invoices.value] = await Promise.all([
      listClients(companyId.value), listInvoices(companyId.value)
    ]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "تعذر تحميل البيانات المحلية";
  } finally {
    loading.value = false;
  }
}
async function save() {
  error.value = "";
  if (!allowed.value || !form.clientId || !form.number.trim() ||
      form.items.some(x => !x.description.trim() || Number(x.quantity) <= 0 ||
        Number(x.unit_price) < 0 || Number(x.tva_rate) < 0 || Number(x.tva_rate) > 100)) {
    error.value = "تحقق من العميل ورقم الفاتورة وجميع البنود.";
    return;
  }
  saving.value = true;
  try {
    await saveInvoice({
      companyId: companyId.value, clientId: form.clientId, number: form.number,
      issueDate: form.issueDate, dueDate: form.dueDate || null,
      currency: auth.activeCompany?.currency_code || "DZD", notes: form.notes, items: form.items,
      createdBy: auth.user?.id ?? null
    });
    open.value = false;
    message.value = "تم حفظ الفاتورة والعميل محلياً؛ ستتم مزامنتهما عند عودة الاتصال.";
    form.items = [{ description: "", quantity: 1, unit_price: 0, tva_rate: 19 }];
    form.number = "";
    form.notes = "";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "فشل حفظ الفاتورة محلياً";
  } finally {
    saving.value = false;
  }
}
async function createClient() {
  if (!cform.name.trim()) return;
  saving.value = true;
  error.value = "";
  try {
    const c = await addClient(companyId.value, cform);
    await load();
    form.clientId = c.id;
    newClient.value = false;
    Object.assign(cform, { name: "", email: "", phone: "" });
    message.value = "تم حفظ العميل محلياً وسيُزامن تلقائياً.";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "تعذر إضافة العميل";
  } finally {
    saving.value = false;
  }
}
function openPayment(invoice: any) {
  paymentInvoice.value = invoice;
  paymentForm.paymentDate = today;
  paymentForm.amount = Math.max(0, Number(invoice.total) - Number(invoice.paid_amount));
  paymentForm.paymentMethod = "cash";
  paymentForm.reference = "";
  paymentForm.notes = "";
}
async function recordPayment() {
  const invoice = paymentInvoice.value;
  if (!allowed.value || !invoice || Number(paymentForm.amount) <= 0) {
    error.value = "أدخل مبلغ دفعة صحيحاً.";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const result = await recordInvoicePayment({
      companyId: companyId.value,
      invoiceId: invoice.id,
      createdBy: auth.user?.id ?? null,
      payment: {
        payment_date: paymentForm.paymentDate,
        amount: Number(paymentForm.amount),
        payment_method: paymentForm.paymentMethod,
        reference: paymentForm.reference,
        notes: paymentForm.notes
      }
    });
    paymentInvoice.value = null;
    message.value = result.cash_transaction
      ? "حُفظت الدفعة محلياً وأُضيفت حركة قبض للصندوق؛ ستتم مزامنتهما معاً."
      : "حُفظت الدفعة البنكية محلياً؛ ستتم مزامنتها دون تغيير رصيد الصندوق.";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "تعذر تسجيل الدفعة";
  } finally {
    saving.value = false;
  }
}
async function copyPortal() {
  if (portal.value) await navigator.clipboard.writeText(portal.value);
}
async function share(clientId: string) {
  try {
    portal.value = await mintPortalUrl(companyId.value, clientId);
    await navigator.clipboard.writeText(portal.value);
    message.value = "تم إنشاء الرابط ونسخه؛ أرسله للعميل عبر قناة آمنة.";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "تعذر إنشاء الرابط؛ يلزم الاتصال بالإنترنت.";
  }
}
onMounted(() => void load());
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-brand-600">الإدارة المالية</p>
        <h1 class="mt-1 text-2xl font-bold">الفواتير والعملاء</h1>
        <p class="mt-1 text-sm text-slate-500">إصدار الفواتير وتسجيل الدفعات ومتابعة بوابة العميل، مع حفظ محلي أولاً.</p>
      </div>
      <button v-if="allowed" class="primary-button" @click="open = !open">＋ فاتورة جديدة</button>
    </header>

    <p v-if="error" role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="message" role="status" class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{{ message }}</p>
    <div v-if="portal" class="panel break-all p-4">
      <b>رابط خاص بالعميل</b>
      <p class="my-2 text-brand-700">{{ portal }}</p>
      <button class="secondary-button" @click="copyPortal">نسخ</button>
    </div>

    <form v-if="open" class="panel space-y-4 p-5" @submit.prevent="save">
      <div class="flex justify-between">
        <h2 class="font-bold">فاتورة جديدة</h2>
        <button type="button" class="secondary-button" @click="newClient = !newClient">＋ عميل</button>
      </div>
      <div v-if="newClient" class="grid gap-2 sm:grid-cols-3">
        <input v-model="cform.name" required class="form-input" placeholder="اسم العميل" />
        <input v-model="cform.email" class="form-input" type="email" placeholder="البريد" />
        <input v-model="cform.phone" class="form-input" placeholder="الهاتف" />
        <button type="button" class="primary-button sm:col-span-3" :disabled="saving" @click="createClient">حفظ العميل محلياً</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="form-field">العميل
          <select v-model="form.clientId" required class="form-input">
            <option value="">اختر العميل</option>
            <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }} — {{ c.email || "—" }}</option>
          </select>
        </label>
        <label class="form-field">رقم الفاتورة
          <input v-model="form.number" required class="form-input" placeholder="INV-2026-001" />
        </label>
        <label class="form-field">تاريخ الإصدار
          <input v-model="form.issueDate" type="date" required class="form-input" />
        </label>
        <label class="form-field">تاريخ الاستحقاق
          <input v-model="form.dueDate" type="date" class="form-input" />
        </label>
      </div>
      <div class="space-y-3">
        <div class="flex justify-between">
          <b>بنود الفاتورة</b>
          <button type="button" class="secondary-button" @click="form.items.push({ description: '', quantity: 1, unit_price: 0, tva_rate: 19 })">إضافة بند</button>
        </div>
        <div v-for="(x, i) in form.items" :key="i" class="grid gap-2 rounded-xl border p-3 sm:grid-cols-12">
          <input v-model="x.description" required class="form-input sm:col-span-4" placeholder="الوصف" />
          <input v-model.number="x.quantity" required type="number" min="0.001" step="0.001" class="form-input sm:col-span-2" placeholder="الكمية" />
          <input v-model.number="x.unit_price" required type="number" min="0" step="0.01" class="form-input sm:col-span-2" placeholder="السعر" />
          <input v-model.number="x.tva_rate" required type="number" min="0" max="100" step="0.01" class="form-input sm:col-span-2" placeholder="TVA %" />
          <button type="button" class="secondary-button sm:col-span-2" :disabled="form.items.length === 1" @click="form.items.splice(i, 1)">حذف</button>
        </div>
      </div>
      <textarea v-model="form.notes" class="form-input" rows="2" placeholder="ملاحظات" />
      <div class="ml-auto max-w-xs space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <p class="flex justify-between"><span>HT</span><b>{{ money(sums.sub) }}</b></p>
        <p class="flex justify-between"><span>TVA</span><b>{{ money(sums.tax) }}</b></p>
        <p class="flex justify-between border-t pt-2 font-bold"><span>TTC</span><b>{{ money(sums.sub + sums.tax) }}</b></p>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" class="secondary-button" @click="open = false">إلغاء</button>
        <button class="primary-button" :disabled="saving">{{ saving ? "جارٍ الحفظ…" : "حفظ الفاتورة محلياً" }}</button>
      </div>
    </form>

    <form v-if="paymentInvoice" class="panel space-y-4 p-5" @submit.prevent="recordPayment">
      <div class="flex items-center justify-between gap-3">
        <div><h2 class="font-bold">تسجيل دفعة</h2><p class="text-sm text-slate-500">{{ paymentInvoice.invoice_number }} — {{ paymentInvoice.client?.name }}</p></div>
        <button type="button" class="secondary-button" @click="paymentInvoice = null">إغلاق</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="form-field">تاريخ الدفع
          <input v-model="paymentForm.paymentDate" required type="date" class="form-input" />
        </label>
        <label class="form-field">المبلغ
          <input v-model.number="paymentForm.amount" required type="number" min="0.01" step="0.01" :max="paymentInvoice.total - paymentInvoice.paid_amount" class="form-input" />
        </label>
        <label class="form-field">طريقة الدفع
          <select v-model="paymentForm.paymentMethod" class="form-input">
            <option value="cash">نقداً — يضاف إلى الصندوق</option>
            <option value="bank">تحويل بنكي — لا يغيّر الصندوق</option>
          </select>
        </label>
        <label class="form-field">المرجع
          <input v-model="paymentForm.reference" class="form-input" placeholder="رقم الوصل أو التحويل" />
        </label>
      </div>
      <textarea v-model="paymentForm.notes" class="form-input" rows="2" placeholder="ملاحظات الدفعة" />
      <p class="text-sm text-slate-500">المتبقي: <b>{{ money(paymentInvoice.total - paymentInvoice.paid_amount, paymentInvoice.currency_code) }}</b>. تحفظ الدفعة محلياً أولاً وتُرسل عند عودة الاتصال.</p>
      <div class="flex justify-end">
        <button class="primary-button" :disabled="saving">{{ saving ? "جارٍ الحفظ…" : "حفظ الدفعة محلياً" }}</button>
      </div>
    </form>

    <div class="panel overflow-hidden">
      <div class="border-b p-4 font-bold">سجل الفواتير</div>
      <p v-if="loading" class="p-8 text-center">جارٍ التحميل…</p>
      <p v-else-if="!invoices.length" class="p-8 text-center text-slate-500">لا توجد فواتير محلية.</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[900px] text-right text-sm">
          <thead class="bg-slate-50 text-xs text-slate-500">
            <tr><th class="p-4">الرقم</th><th class="p-4">العميل</th><th class="p-4">التاريخ</th><th class="p-4">الإجمالي</th><th class="p-4">المدفوع</th><th class="p-4">الحالة</th><th class="p-4">البوابة</th><th class="p-4">الدفعات</th></tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="i in invoices" :key="i.id">
              <td class="p-4 font-semibold">{{ i.invoice_number }}</td>
              <td class="p-4">{{ i.client?.name || "—" }}</td>
              <td class="p-4">{{ i.issue_date }}</td>
              <td class="p-4">{{ money(i.total, i.currency_code) }}</td>
              <td class="p-4">{{ money(i.paid_amount, i.currency_code) }}</td>
              <td class="p-4">{{ i.status }}</td>
              <td class="p-4"><button class="secondary-button" :disabled="!i.client_id" @click="share(i.client_id)">إنشاء رابط</button></td>
              <td class="p-4"><button v-if="allowed && i.status !== 'cancelled' && i.status !== 'draft' && i.paid_amount < i.total" class="secondary-button" @click="openPayment(i)">تسجيل دفعة</button><span v-else class="text-slate-400">—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
