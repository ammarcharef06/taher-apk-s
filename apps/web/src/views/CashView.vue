<script setup lang="ts">
import { useToast } from "../composables/toast";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  createCashTransaction,
  deleteCashTransaction,
  getCashOverview,
  saveCashOpeningBalance,
  updateCashTransaction
} from "@taher/db";
import type { CashOverview } from "@taher/db";
import type { CashTransactionInput, CashTransactionRecord, CashTransactionType } from "@taher/core";
import { useAuthStore } from "../stores/auth.store";
import CashReceipt from "../components/cash/CashReceipt.vue";

const auth = useAuthStore();
const toast = useToast();
const companyId = computed(() => auth.activeMembership?.company_id ?? "");
const canCreate = computed(
  () =>
    auth.activeRole === "company_admin" ||
    auth.activeRole === "manager" ||
    auth.activeRole === "data_entry"
);
const canManage = computed(
  () => auth.activeRole === "company_admin" || auth.activeRole === "manager"
);
const canView = computed(
  () => canManage.value || auth.activeRole === "data_entry"
);

function today(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function firstDayOfMonth(): string {
  return today().slice(0, 8) + "01";
}

const overview = ref<CashOverview | null>(null);
const search = ref("");
const typeFilter = ref<CashTransactionType | "all">("all");
const dateFrom = ref(firstDayOfMonth());
const dateTo = ref(today());
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
watch([errorMessage, successMessage], ([failure, success]) => { if (failure) toast.error(failure); if (success) toast.success(success); });
const formOpen = ref(false);
const openingFormOpen = ref(false);
const editingId = ref<string | null>(null);
const selectedReceipt = ref<CashTransactionRecord | null>(null);

const emptyCashForm = (): CashTransactionInput => ({
  transaction_date: today(),
  transaction_type: "income",
  description: "",
  beneficiary: null,
  amount: 0,
  document_number: null,
  notes: null
});

const form = reactive<CashTransactionInput>(emptyCashForm());
const openingForm = reactive({
  period_start: firstDayOfMonth(),
  period_end: null as string | null,
  opening_amount: 0,
  notes: ""
});

const displayRows = computed(() => overview.value?.rows.slice().reverse() ?? []);
const openingBalances = computed(() => overview.value?.openingBalances ?? []);

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "currency",
    currency: auth.activeCompany?.currency_code || "DZD",
    maximumFractionDigits: 2
  }).format(value);
}

function setCashForm(transaction?: CashTransactionRecord): void {
  const values = transaction
    ? {
        transaction_date: transaction.transaction_date,
        transaction_type: transaction.transaction_type,
        description: transaction.description,
        beneficiary: transaction.beneficiary,
        amount: transaction.amount,
        document_number: transaction.document_number,
        notes: transaction.notes
      }
    : emptyCashForm();

  Object.assign(form, values);
}

async function loadCash(): Promise<void> {
  if (!canView.value) {
    overview.value = null;
    return;
  }
  if (!companyId.value) {
    overview.value = null;
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    overview.value = await getCashOverview(companyId.value, {
      search: search.value,
      type: typeFilter.value,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value
    });
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تحميل حركات الصندوق.";
  } finally {
    loading.value = false;
  }
}

function openCreateForm(): void {
  editingId.value = null;
  setCashForm();
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function openEditForm(transaction: CashTransactionRecord): void {
  if (!canManage.value) return;
  editingId.value = transaction.id;
  setCashForm(transaction);
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function closeForm(): void {
  formOpen.value = false;
  editingId.value = null;
}

async function saveTransaction(): Promise<void> {
  if (!companyId.value) return;
  if (editingId.value && !canManage.value) return;
  if (!editingId.value && !canCreate.value) return;

  submitting.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  const payload: CashTransactionInput = {
    transaction_date: form.transaction_date,
    transaction_type: form.transaction_type,
    description: form.description,
    beneficiary: form.beneficiary,
    amount: Number(form.amount),
    document_number: form.document_number,
    notes: form.notes
  };

  try {
    if (editingId.value) {
      await updateCashTransaction(companyId.value, editingId.value, payload);
      successMessage.value = "تم تعديل حركة الصندوق محلياً.";
    } else {
      await createCashTransaction(companyId.value, payload, auth.user?.id ?? null);
      successMessage.value = "تم تسجيل حركة الصندوق محلياً.";
    }
    closeForm();
    await loadCash();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حفظ حركة الصندوق.";
  } finally {
    submitting.value = false;
  }
}

async function removeTransaction(transaction: CashTransactionRecord): Promise<void> {
  if (!canManage.value || !companyId.value) return;
  if (!window.confirm("هل تريد حذف حركة الصندوق؟ سيُسجّل الحذف كحذف ناعم.")) return;

  errorMessage.value = "";
  successMessage.value = "";
  try {
    await deleteCashTransaction(companyId.value, transaction.id);
    successMessage.value = "تم حذف الحركة محلياً.";
    await loadCash();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حذف حركة الصندوق.";
  }
}

function openOpeningForm(): void {
  Object.assign(openingForm, {
    period_start: firstDayOfMonth(),
    period_end: null,
    opening_amount: 0,
    notes: ""
  });
  openingFormOpen.value = true;
}

async function saveOpening(): Promise<void> {
  if (!companyId.value || !canManage.value) return;

  submitting.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    await saveCashOpeningBalance(companyId.value, {
      period_start: openingForm.period_start,
      period_end: openingForm.period_end,
      opening_amount: Number(openingForm.opening_amount),
      notes: openingForm.notes
    });
    openingFormOpen.value = false;
    successMessage.value = "تم حفظ الرصيد الافتتاحي محلياً.";
    await loadCash();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حفظ الرصيد الافتتاحي.";
  } finally {
    submitting.value = false;
  }
}

async function printReceipt(transaction: CashTransactionRecord): Promise<void> {
  selectedReceipt.value = transaction;
  await nextTick();
  window.print();
}

function clearReceipt(): void {
  selectedReceipt.value = null;
}

watch([search, typeFilter, dateFrom, dateTo], () => {
  void loadCash();
});

onMounted(() => {
  void loadCash();
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
        <p class="text-sm font-semibold text-brand-600">الحسابات المالية</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">الصندوق</h1>
        <p class="mt-1 text-sm text-slate-500">تسجيل المقبوضات والمدفوعات ومتابعة الرصيد التراكمي.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button v-if="canManage" class="secondary-button" type="button" @click="openOpeningForm">الرصيد الافتتاحي</button>
        <button v-if="canCreate" class="primary-button" type="button" @click="openCreateForm">
          <span class="ml-2 text-lg">＋</span>
          تسجيل حركة
        </button>
      </div>
    </header>

    <div v-if="!companyId" class="panel p-5 text-sm leading-7 text-amber-800">
      لا توجد شركة نشطة مرتبطة بهذا الحساب. يلزم اختيار شركة قبل عرض الصندوق.
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <article class="panel p-5 sm:col-span-1">
        <p class="text-sm text-slate-500">الرصيد الحالي</p>
        <p class="mt-3 text-2xl font-bold text-slate-900">{{ formatMoney(overview?.currentBalance ?? 0) }}</p>
        <p class="mt-2 text-xs text-slate-400">محسوب حتى تاريخ اليوم</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">عدد الحركات المعروضة</p>
        <p class="mt-3 text-2xl font-bold text-slate-900">{{ overview?.rows.length ?? 0 }}</p>
        <p class="mt-2 text-xs text-slate-400">حسب عوامل التصفية</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">أحدث رصيد افتتاحي</p>
        <p class="mt-3 text-2xl font-bold text-slate-900">
          {{ openingBalances[0] ? formatMoney(openingBalances[0].opening_amount) : formatMoney(0) }}
        </p>
        <p class="mt-2 text-xs text-slate-400">
          {{ openingBalances[0]?.period_start || "لم يُسجل رصيد افتتاحي" }}
        </p>
      </article>
    </div>

    <div class="panel overflow-hidden">
      <div class="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <input v-model="search" class="form-input" type="search" placeholder="ابحث في البيان أو المستفيد..." aria-label="البحث في الحركات" />
        <select v-model="typeFilter" class="form-input" aria-label="نوع الحركة">
          <option value="all">كل الحركات</option>
          <option value="income">مقبوضات</option>
          <option value="expense">مدفوعات</option>
        </select>
        <label class="form-field !gap-1">
          <span class="text-xs text-slate-500">من تاريخ</span>
          <input v-model="dateFrom" class="form-input" type="date" />
        </label>
        <label class="form-field !gap-1">
          <span class="text-xs text-slate-500">إلى تاريخ</span>
          <input v-model="dateTo" class="form-input" type="date" />
        </label>
      </div>

      <p v-if="errorMessage" role="alert" class="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMessage }}</p>
      <p v-if="successMessage" role="status" class="mx-4 mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{{ successMessage }}</p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[900px] text-right text-sm">
          <thead class="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-5 py-4">التاريخ</th>
              <th class="px-5 py-4">النوع</th>
              <th class="px-5 py-4">البيان</th>
              <th class="px-5 py-4">المستفيد</th>
              <th class="px-5 py-4">المبلغ</th>
              <th class="px-5 py-4">الرصيد بعد الحركة</th>
              <th class="px-5 py-4">رقم الوثيقة</th>
              <th class="px-5 py-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in displayRows" :key="row.transaction.id" class="hover:bg-slate-50/70">
              <td class="whitespace-nowrap px-5 py-4 text-slate-500">{{ row.transaction.transaction_date }}</td>
              <td class="px-5 py-4">
                <span
                  class="rounded-full px-3 py-1 text-xs font-semibold"
                  :class="row.transaction.transaction_type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'"
                >
                  {{ row.transaction.transaction_type === "income" ? "مقبوضات" : "مدفوعات" }}
                </span>
              </td>
              <td class="max-w-xs px-5 py-4 font-semibold text-slate-800">{{ row.transaction.description }}</td>
              <td class="px-5 py-4 text-slate-500">{{ row.transaction.beneficiary || "—" }}</td>
              <td class="whitespace-nowrap px-5 py-4 font-semibold" :class="row.transaction.transaction_type === 'income' ? 'text-emerald-700' : 'text-red-700'">
                {{ row.transaction.transaction_type === "income" ? "+" : "−" }} {{ formatMoney(row.transaction.amount) }}
              </td>
              <td class="whitespace-nowrap px-5 py-4 font-bold text-slate-800">{{ formatMoney(row.balance_after) }}</td>
              <td class="px-5 py-4 text-slate-500">{{ row.transaction.document_number || "—" }}</td>
              <td class="px-5 py-4">
                <div class="flex flex-wrap gap-2">
                  <button class="secondary-button !px-3 !py-2" type="button" @click="printReceipt(row.transaction)">طباعة</button>
                  <template v-if="canManage">
                    <button class="secondary-button !px-3 !py-2" type="button" @click="openEditForm(row.transaction)">تعديل</button>
                    <button class="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" type="button" @click="removeTransaction(row.transaction)">حذف</button>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && displayRows.length === 0">
              <td colspan="8" class="px-5 py-14 text-center text-slate-400">لا توجد حركات ضمن عوامل التصفية الحالية.</td>
            </tr>
            <tr v-if="loading">
              <td colspan="8" class="px-5 py-10 text-center text-slate-400">جارٍ تحميل الحركات...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-400">
        كل حركة تُحفظ محلياً أولاً وتُضاف إلى طابور المزامنة. المزامنة السحابية التلقائية تُنفّذ في المرحلة الخامسة.
      </footer>
    </div>

    <section v-if="canManage && openingBalances.length" class="panel p-5">
      <h2 class="font-bold text-slate-900">الأرصدة الافتتاحية المسجلة</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article v-for="balance in openingBalances" :key="balance.id" class="rounded-xl border border-slate-100 p-4">
          <p class="text-xs text-slate-400">بداية الفترة: {{ balance.period_start }}</p>
          <p class="mt-2 text-lg font-bold text-slate-800">{{ formatMoney(balance.opening_amount) }}</p>
          <p v-if="balance.period_end" class="mt-1 text-xs text-slate-400">نهاية الفترة: {{ balance.period_end }}</p>
          <p v-if="balance.notes" class="mt-2 text-xs text-slate-500">{{ balance.notes }}</p>
        </article>
      </div>
    </section>

    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="closeForm">
      <section class="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-slate-900">{{ editingId ? "تعديل حركة الصندوق" : "تسجيل حركة جديدة" }}</h2>
          <button class="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" type="button" aria-label="إغلاق" @click="closeForm">✕</button>
        </div>
        <form class="mt-6 grid gap-4 sm:grid-cols-2" @submit.prevent="saveTransaction">
          <label class="form-field">
            التاريخ
            <input v-model="form.transaction_date" class="form-input" type="date" required />
          </label>
          <label class="form-field">
            نوع الحركة
            <select v-model="form.transaction_type" class="form-input">
              <option value="income">مقبوضات</option>
              <option value="expense">مدفوعات</option>
            </select>
          </label>
          <label class="form-field sm:col-span-2">
            البيان
            <input v-model="form.description" class="form-input" required minlength="2" maxlength="500" />
          </label>
          <label class="form-field">
            المستفيد / الجهة
            <input v-model="form.beneficiary" class="form-input" />
          </label>
          <label class="form-field">
            المبلغ
            <input v-model.number="form.amount" class="form-input" type="number" min="0.01" step="0.01" required />
          </label>
          <label class="form-field">
            رقم الوثيقة
            <input v-model="form.document_number" class="form-input" />
          </label>
          <label class="form-field sm:col-span-2">
            ملاحظات
            <textarea v-model="form.notes" class="form-input min-h-20 resize-y" rows="2"></textarea>
          </label>
          <div class="flex justify-end gap-3 pt-2 sm:col-span-2">
            <button class="secondary-button" type="button" @click="closeForm">إلغاء</button>
            <button class="primary-button" type="submit" :disabled="submitting">{{ submitting ? "جارٍ الحفظ..." : "حفظ الحركة" }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="openingFormOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="openingFormOpen = false">
      <section class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 class="text-xl font-bold text-slate-900">تسجيل رصيد افتتاحي</h2>
        <p class="mt-2 text-sm leading-6 text-slate-500">يُستخدم هذا الرصيد كبداية للحسابات في تاريخ الفترة المحدد، ويحل محل رصيد الفترات السابقة عند حساب الرصيد بعده.</p>
        <form class="mt-6 space-y-4" @submit.prevent="saveOpening">
          <label class="form-field">
            بداية الفترة
            <input v-model="openingForm.period_start" class="form-input" type="date" required />
          </label>
          <label class="form-field">
            نهاية الفترة (اختياري)
            <input v-model="openingForm.period_end" class="form-input" type="date" />
          </label>
          <label class="form-field">
            الرصيد الافتتاحي
            <input v-model.number="openingForm.opening_amount" class="form-input" type="number" step="0.01" required />
          </label>
          <label class="form-field">
            ملاحظات
            <textarea v-model="openingForm.notes" class="form-input min-h-20 resize-y" rows="2"></textarea>
          </label>
          <div class="flex justify-end gap-3">
            <button class="secondary-button" type="button" @click="openingFormOpen = false">إلغاء</button>
            <button class="primary-button" type="submit" :disabled="submitting">حفظ الرصيد</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="selectedReceipt" class="print-receipt-host">
      <CashReceipt
        :transaction="selectedReceipt"
        :company-name="auth.activeCompany?.name || 'الشركة'"
        :currency-code="auth.activeCompany?.currency_code || 'DZD'"
      />
    </div>
  </section>
</template>

<style>
@media print {
  .print-receipt-host {
    display: block !important;
  }
}
</style>
