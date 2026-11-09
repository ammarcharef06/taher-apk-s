<script setup lang="ts">
import { useToast } from "../composables/toast";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  createWage,
  deleteWage,
  getWageDraftContext,
  getWageRemainingAmount,
  getTodayForWageForm,
  listWagePayments,
  listWages,
  recordWagePayment,
  updateWage,
  listWorkers
} from "@taher/db";
import type { LocalWage, LocalWagePayment, LocalWorker } from "@taher/db";
import {
  calculateWageAmounts,
  type WageInput
} from "@taher/core";
import { useAuthStore } from "../stores/auth.store";
import WageReceipt from "../components/wages/WageReceipt.vue";

const auth = useAuthStore();
const toast = useToast();
const companyId = computed(() => auth.activeMembership?.company_id ?? "");
const canManage = computed(
  () => auth.activeRole === "company_admin" || auth.activeRole === "manager"
);
const canView = computed(
  () => canManage.value || auth.activeRole === "accountant"
);

function currentMonth(): string {
  return getTodayForWageForm().slice(0, 7) + "-01";
}

const wageMonthFilter = ref(currentMonth());
const wageMonthFilterInput = computed({
  get: () => wageMonthFilter.value.slice(0, 7),
  set: (value: string) => {
    if (value) wageMonthFilter.value = value + "-01";
  }
});
const workers = ref<LocalWorker[]>([]);
const wages = ref<LocalWage[]>([]);
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
watch([errorMessage, successMessage], ([failure, success]) => { if (failure) toast.error(failure); if (success) toast.success(success); });
const formOpen = ref(false);
const paymentOpen = ref(false);
const historyOpen = ref(false);
const editingId = ref<string | null>(null);
const selectedWage = ref<LocalWage | null>(null);
const paymentHistory = ref<LocalWagePayment[]>([]);
const selectedReceipt = ref<{
  wage: LocalWage;
  payment: LocalWagePayment;
  workerName: string;
} | null>(null);

const selectedWorkerId = ref("");
const draftContext = ref({ carried_balance: 0, advance_balance: 0 });
const emptyForm = (): WageInput => ({
  wage_month: currentMonth(),
  work_days: 0,
  daily_rate: 0,
  overtime_hours: 0,
  overtime_amount: 0,
  bonuses: 0,
  deductions: 0,
  advances_deducted: 0,
  notes: null
});
const form = reactive<WageInput>(emptyForm());
const wageMonthInput = computed({
  get: () => form.wage_month.slice(0, 7),
  set: (value: string) => {
    if (value) form.wage_month = value + "-01";
  }
});
const paymentForm = reactive({
  payment_date: getTodayForWageForm(),
  amount: 0,
  payment_method: "cash" as "cash" | "bank",
  notes: ""
});

const workerById = computed(() => new Map(workers.value.map((worker) => [worker.id, worker])));
const preview = computed(() => {
  try {
    const current = editingId.value
      ? wages.value.find((wage) => wage.id === editingId.value)
      : null;
    return calculateWageAmounts(
      form,
      current?.carried_balance ?? draftContext.value.carried_balance,
      current?.paid_amount ?? 0
    );
  } catch {
    return null;
  }
});

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "currency",
    currency: auth.activeCompany?.currency_code || "DZD",
    maximumFractionDigits: 2
  }).format(value);
}

async function loadPage(): Promise<void> {
  if (!companyId.value || !canView.value) {
    workers.value = [];
    wages.value = [];
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    const [workerRows, wageRows] = await Promise.all([
      listWorkers(companyId.value),
      listWages(companyId.value, wageMonthFilter.value)
    ]);
    workers.value = workerRows;
    wages.value = wageRows;
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تحميل بيانات الأجور.";
  } finally {
    loading.value = false;
  }
}

async function refreshDraftContext(): Promise<void> {
  if (!companyId.value || !selectedWorkerId.value) {
    draftContext.value = { carried_balance: 0, advance_balance: 0 };
    return;
  }

  try {
    const context = await getWageDraftContext(
      companyId.value,
      selectedWorkerId.value,
      form.wage_month
    );
    const current = editingId.value
      ? wages.value.find((wage) => wage.id === editingId.value)
      : null;
    draftContext.value = {
      carried_balance: current?.carried_balance ?? context.carried_balance,
      advance_balance: context.advance_balance
    };
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تحميل الرصيد المرحّل والتسبيقات.";
  }
}

function openCreateForm(): void {
  if (!canManage.value) return;
  editingId.value = null;
  selectedWorkerId.value = "";
  Object.assign(form, emptyForm());
  draftContext.value = { carried_balance: 0, advance_balance: 0 };
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

async function openEditForm(wage: LocalWage): Promise<void> {
  if (!canManage.value) return;
  editingId.value = wage.id;
  selectedWorkerId.value = wage.worker_id;
  Object.assign(form, {
    wage_month: wage.wage_month,
    work_days: wage.work_days,
    daily_rate: wage.daily_rate,
    overtime_hours: wage.overtime_hours,
    overtime_amount: wage.overtime_amount,
    bonuses: wage.bonuses,
    deductions: wage.deductions,
    advances_deducted: wage.advances_deducted,
    notes: wage.notes
  });
  draftContext.value = {
    carried_balance: wage.carried_balance,
    advance_balance: 0
  };
  formOpen.value = true;
  void refreshDraftContext();
  errorMessage.value = "";
  successMessage.value = "";
}

function closeForm(): void {
  formOpen.value = false;
  editingId.value = null;
}

function selectWorker(): void {
  const worker = workerById.value.get(selectedWorkerId.value);
  if (worker && !editingId.value) {
    form.daily_rate = worker.daily_wage;
  }
  void refreshDraftContext();
}

async function saveWage(): Promise<void> {
  if (!companyId.value || !canManage.value || !selectedWorkerId.value) {
    errorMessage.value = "اختر العامل أولاً.";
    return;
  }

  submitting.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    if (editingId.value) {
      const wage = await updateWage(companyId.value, editingId.value, form);
      successMessage.value = "تم تحديث قسيمة الأجر محلياً.";
      selectedWage.value = wage;
    } else {
      const wage = await createWage(
        companyId.value,
        selectedWorkerId.value,
        form,
        auth.user?.id ?? null
      );
      successMessage.value = "تم إنشاء قسيمة الأجر محلياً.";
      selectedWage.value = wage;
    }
    closeForm();
    await loadPage();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حفظ قسيمة الأجر.";
  } finally {
    submitting.value = false;
  }
}

async function removeWage(wage: LocalWage): Promise<void> {
  if (!canManage.value || !companyId.value) return;
  if (!window.confirm("هل تريد إلغاء قسيمة الأجر؟ لا يمكن حذف القسائم المدفوعة أو التي رُحّل رصيدها لشهر لاحق.")) return;

  errorMessage.value = "";
  successMessage.value = "";
  try {
    await deleteWage(companyId.value, wage.id);
    successMessage.value = "تم إلغاء قسيمة الأجر محلياً.";
    await loadPage();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر إلغاء قسيمة الأجر.";
  }
}

function openPaymentDialog(wage: LocalWage): void {
  if (!canManage.value) return;
  selectedWage.value = wage;
  Object.assign(paymentForm, {
    payment_date: getTodayForWageForm(),
    amount: getWageRemainingAmount(wage),
    payment_method: "cash",
    notes: ""
  });
  paymentOpen.value = true;
  errorMessage.value = "";
}

async function savePayment(): Promise<void> {
  if (!companyId.value || !selectedWage.value || !canManage.value) return;
  const worker = workerById.value.get(selectedWage.value.worker_id);
  if (!worker) {
    errorMessage.value = "تعذر العثور على العامل المرتبط بهذه القسيمة.";
    return;
  }

  submitting.value = true;
  errorMessage.value = "";
  try {
    const result = await recordWagePayment(
      companyId.value,
      selectedWage.value.id,
      {
        payment_date: paymentForm.payment_date,
        amount: Number(paymentForm.amount),
        payment_method: paymentForm.payment_method,
        notes: paymentForm.notes
      },
      auth.user?.id ?? null
    );

    paymentOpen.value = false;
    selectedWage.value = result.wage;
    selectedReceipt.value = {
      wage: result.wage,
      payment: result.payment,
      workerName: worker.full_name
    };
    await loadPage();
    await nextTick();
    window.print();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تسجيل دفعة الأجر.";
  } finally {
    submitting.value = false;
  }
}

async function openPaymentHistory(wage: LocalWage): Promise<void> {
  if (!companyId.value) return;
  selectedWage.value = wage;
  try {
    paymentHistory.value = await listWagePayments(companyId.value, wage.id);
    historyOpen.value = true;
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تحميل سجل الدفعات.";
  }
}

async function printExistingPayment(payment: LocalWagePayment): Promise<void> {
  if (!selectedWage.value) return;
  const worker = workerById.value.get(selectedWage.value.worker_id);
  if (!worker) return;

  const chronological = paymentHistory.value
    .slice()
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  let paidToReceipt = 0;
  for (const row of chronological) {
    paidToReceipt += row.amount;
    if (row.id === payment.id) break;
  }

  selectedReceipt.value = {
    wage: { ...selectedWage.value, paid_amount: Math.min(paidToReceipt, selectedWage.value.net_due) },
    payment,
    workerName: worker.full_name
  };
  historyOpen.value = false;
  await nextTick();
  window.print();
}

watch(selectedWorkerId, selectWorker);
watch(
  () => form.wage_month,
  () => {
    if (!editingId.value) void refreshDraftContext();
  }
);
watch(wageMonthFilter, () => {
  void loadPage();
});

function clearReceipt(): void {
  selectedReceipt.value = null;
}

onMounted(() => {
  void loadPage();
  window.addEventListener("afterprint", clearReceipt);
});

onBeforeUnmount(() => {
  window.removeEventListener("afterprint", clearReceipt);
});
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="text-sm font-semibold text-brand-600">الموارد البشرية</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">الأجور والرواتب</h1>
        <p class="mt-1 text-sm text-slate-500">احتساب الأجر الشهري، ترحيل المستحقات، وتسجيل الدفعات وإيصالاتها.</p>
      </div>
      <button v-if="canManage" class="primary-button" type="button" @click="openCreateForm">
        <span class="ml-2 text-lg">＋</span>
        إنشاء قسيمة أجر
      </button>
    </header>

    <div v-if="!companyId" class="panel p-5 text-sm text-amber-800">لا توجد شركة نشطة مرتبطة بهذا الحساب.</div>
    <div v-else-if="!canView" class="panel p-5 text-sm text-amber-800">ليست لديك صلاحية الوصول إلى الأجور.</div>

    <div class="grid gap-4 sm:grid-cols-3">
      <article class="panel p-5">
        <p class="text-sm text-slate-500">عدد القسائم</p>
        <p class="mt-2 text-3xl font-bold text-slate-900">{{ wages.length }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">إجمالي المستحق</p>
        <p class="mt-2 text-2xl font-bold text-slate-900">{{ formatMoney(wages.reduce((sum, wage) => sum + wage.net_due, 0)) }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">الرصيد غير المدفوع</p>
        <p class="mt-2 text-2xl font-bold text-amber-700">{{ formatMoney(wages.reduce((sum, wage) => sum + wage.net_due - wage.paid_amount, 0)) }}</p>
      </article>
    </div>

    <div class="panel overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label class="form-field !gap-1">
            <span class="text-xs text-slate-500">شهر الأجور</span>
            <input v-model="wageMonthFilterInput" class="form-input sm:w-56" type="month" />
          </label>
        </div>
        <p class="text-xs leading-6 text-slate-400">الرصيد المرحّل هو المتبقي من أحدث قسيمة سابقة للعامل.</p>
      </div>

      <p v-if="errorMessage" role="alert" class="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMessage }}</p>
      <p v-if="successMessage" role="status" class="mx-4 mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{{ successMessage }}</p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[1000px] text-right text-sm">
          <thead class="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-5 py-4">العامل</th>
              <th class="px-5 py-4">أيام العمل</th>
              <th class="px-5 py-4">الأجر الأساسي</th>
              <th class="px-5 py-4">الرصيد المرحّل</th>
              <th class="px-5 py-4">صافي المستحق</th>
              <th class="px-5 py-4">المدفوع</th>
              <th class="px-5 py-4">المتبقي</th>
              <th class="px-5 py-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="wage in wages" :key="wage.id" class="hover:bg-slate-50/70">
              <td class="px-5 py-4 font-semibold text-slate-800">{{ workerById.get(wage.worker_id)?.full_name || "عامل غير متاح" }}</td>
              <td class="px-5 py-4 text-slate-500">{{ wage.work_days }}</td>
              <td class="px-5 py-4">{{ formatMoney(wage.base_amount) }}</td>
              <td class="px-5 py-4">{{ formatMoney(wage.carried_balance) }}</td>
              <td class="px-5 py-4 font-bold">{{ formatMoney(wage.net_due) }}</td>
              <td class="px-5 py-4 text-emerald-700">{{ formatMoney(wage.paid_amount) }}</td>
              <td class="px-5 py-4 font-bold" :class="getWageRemainingAmount(wage) > 0 ? 'text-amber-700' : 'text-emerald-700'">
                {{ formatMoney(getWageRemainingAmount(wage)) }}
              </td>
              <td class="px-5 py-4">
                <div class="flex flex-wrap gap-2">
                  <button class="secondary-button !px-3 !py-2" type="button" @click="openPaymentHistory(wage)">الدفعات</button>
                  <button v-if="canManage && getWageRemainingAmount(wage) > 0" class="secondary-button !px-3 !py-2" type="button" @click="openPaymentDialog(wage)">دفع</button>
                  <button v-if="canManage" class="secondary-button !px-3 !py-2" type="button" @click="openEditForm(wage)">تعديل</button>
                  <button v-if="canManage" class="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" type="button" @click="removeWage(wage)">إلغاء</button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && wages.length === 0">
              <td colspan="8" class="px-5 py-14 text-center text-slate-400">لا توجد قسائم أجور لهذا الشهر.</td>
            </tr>
            <tr v-if="loading">
              <td colspan="8" class="px-5 py-10 text-center text-slate-400">جارٍ تحميل قسائم الأجور...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-400">
        الدفعة النقدية تُسجّل كمدفوع في الأجور وكخروج في الصندوق ضمن عملية محلية واحدة.
      </footer>
    </div>

    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="closeForm">
      <section class="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-slate-900">{{ editingId ? "تعديل قسيمة الأجر" : "إنشاء قسيمة أجر" }}</h2>
          <button class="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" type="button" @click="closeForm">✕</button>
        </div>

        <form class="mt-6 grid gap-4 sm:grid-cols-2" @submit.prevent="saveWage">
          <label class="form-field sm:col-span-2">
            العامل
            <select v-model="selectedWorkerId" class="form-input" :disabled="Boolean(editingId)" required>
              <option value="" disabled>اختر العامل</option>
              <option v-for="worker in workers" :key="worker.id" :value="worker.id">{{ worker.full_name }}</option>
            </select>
          </label>
          <label class="form-field">
            شهر الأجر
            <input v-model="wageMonthInput" class="form-input" type="month" :disabled="Boolean(editingId)" required />
          </label>
          <label class="form-field">
            أيام العمل
            <input v-model.number="form.work_days" class="form-input" type="number" min="0" max="31" step="0.5" required />
          </label>
          <label class="form-field">
            الأجر اليومي
            <input v-model.number="form.daily_rate" class="form-input" type="number" min="0" step="0.01" required />
          </label>
          <label class="form-field">
            ساعات إضافية
            <input v-model.number="form.overtime_hours" class="form-input" type="number" min="0" step="0.25" />
          </label>
          <label class="form-field">
            مبلغ العمل الإضافي
            <input v-model.number="form.overtime_amount" class="form-input" type="number" min="0" step="0.01" />
          </label>
          <label class="form-field">
            المكافآت
            <input v-model.number="form.bonuses" class="form-input" type="number" min="0" step="0.01" />
          </label>
          <label class="form-field">
            الاقتطاعات
            <input v-model.number="form.deductions" class="form-input" type="number" min="0" step="0.01" />
          </label>
          <label class="form-field">
            خصم التسبيقات
            <input v-model.number="form.advances_deducted" class="form-input" type="number" min="0" :max="draftContext.advance_balance" step="0.01" />
            <span class="text-xs text-slate-400">المتاح للخصم: {{ formatMoney(draftContext.advance_balance) }}</span>
          </label>
          <label class="form-field sm:col-span-2">
            ملاحظات
            <textarea v-model="form.notes" class="form-input min-h-20 resize-y" rows="2"></textarea>
          </label>

          <div class="rounded-xl bg-slate-50 p-4 sm:col-span-2">
            <h3 class="font-bold text-slate-800">معاينة الحساب</h3>
            <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div class="flex justify-between"><span class="text-slate-500">الرصيد المرحّل</span><strong>{{ formatMoney(editingId ? (wages.find(w => w.id === editingId)?.carried_balance || 0) : draftContext.carried_balance) }}</strong></div>
              <div class="flex justify-between"><span class="text-slate-500">الأجر الأساسي</span><strong>{{ formatMoney(preview?.base_amount || 0) }}</strong></div>
              <div class="flex justify-between"><span class="text-slate-500">الإجمالي قبل الخصم</span><strong>{{ formatMoney(preview?.gross_amount || 0) }}</strong></div>
              <div class="flex justify-between"><span class="text-slate-500">التسبيقات المخصومة</span><strong>{{ formatMoney(preview?.advances_deducted || 0) }}</strong></div>
              <div class="flex justify-between border-t border-slate-200 pt-3 sm:col-span-2"><span class="font-bold">صافي المستحق</span><strong class="text-lg text-brand-700">{{ formatMoney(preview?.net_due || 0) }}</strong></div>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-2 sm:col-span-2">
            <button class="secondary-button" type="button" @click="closeForm">إلغاء</button>
            <button class="primary-button" type="submit" :disabled="submitting || !preview">{{ submitting ? "جارٍ الحفظ..." : "حفظ القسيمة" }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="paymentOpen && selectedWage" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="paymentOpen = false">
      <section class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 class="text-xl font-bold text-slate-900">تسجيل دفعة أجر</h2>
        <p class="mt-2 text-sm text-slate-500">المتبقي: {{ formatMoney(getWageRemainingAmount(selectedWage)) }}</p>
        <form class="mt-6 space-y-4" @submit.prevent="savePayment">
          <label class="form-field">
            تاريخ الدفع
            <input v-model="paymentForm.payment_date" class="form-input" type="date" required />
          </label>
          <label class="form-field">
            المبلغ
            <input v-model.number="paymentForm.amount" class="form-input" type="number" min="0.01" :max="getWageRemainingAmount(selectedWage)" step="0.01" required />
          </label>
          <label class="form-field">
            طريقة الدفع
            <select v-model="paymentForm.payment_method" class="form-input">
              <option value="cash">نقداً من الصندوق</option>
              <option value="bank">تحويل بنكي</option>
            </select>
          </label>
          <label class="form-field">
            ملاحظات
            <textarea v-model="paymentForm.notes" class="form-input" rows="2"></textarea>
          </label>
          <p v-if="errorMessage" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMessage }}</p>
          <div class="flex justify-end gap-3">
            <button class="secondary-button" type="button" @click="paymentOpen = false">إلغاء</button>
            <button class="primary-button" type="submit" :disabled="submitting">{{ submitting ? "جارٍ التسجيل..." : "تأكيد الدفع وطباعة الوصل" }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="historyOpen && selectedWage" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="historyOpen = false">
      <section class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-slate-900">سجل دفعات الأجر</h2>
          <button class="secondary-button" type="button" @click="historyOpen = false">إغلاق</button>
        </div>
        <div class="mt-5 space-y-3">
          <article v-for="payment in paymentHistory" :key="payment.id" class="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 p-4 sm:flex-row sm:items-center">
            <div>
              <p class="font-bold text-slate-800">{{ formatMoney(payment.amount) }}</p>
              <p class="mt-1 text-xs text-slate-500">{{ payment.payment_date }} · {{ payment.payment_method === "cash" ? "نقداً" : "تحويل بنكي" }}</p>
              <p class="mt-1 text-xs text-slate-400">{{ payment.receipt_number }}</p>
            </div>
            <button class="secondary-button" type="button" @click="printExistingPayment(payment)">طباعة الوصل</button>
          </article>
          <p v-if="paymentHistory.length === 0" class="py-10 text-center text-sm text-slate-400">لا توجد دفعات مسجلة لهذه القسيمة.</p>
        </div>
      </section>
    </div>

    <div v-if="selectedReceipt" class="wage-print-host">
      <WageReceipt
        :wage="selectedReceipt.wage"
        :payment="selectedReceipt.payment"
        :worker-name="selectedReceipt.workerName"
        :company-name="auth.activeCompany?.name || 'الشركة'"
        :currency-code="auth.activeCompany?.currency_code || 'DZD'"
      />
    </div>
  </section>
</template>

<style>
@media print {
  .wage-print-host {
    display: block !important;
  }
}
</style>
