<script setup lang="ts">
import { useToast } from "../composables/toast";
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  createAdvance,
  deleteAdvance,
  listAdvances,
  listWorkerAdvanceBalances,
  updateAdvance,
  listWorkers
} from "@taher/db";
import type { LocalAdvance, LocalWorker, WorkerAdvanceBalance } from "@taher/db";
import type { AdvanceInput, AdvanceType } from "@taher/core";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();
const toast = useToast();
const companyId = computed(() => auth.activeMembership?.company_id ?? "");
const canManage = computed(
  () => auth.activeRole === "company_admin" || auth.activeRole === "manager"
);
const canCreate = computed(
  () => canManage.value || auth.activeRole === "data_entry"
);
const canView = computed(
  () => canCreate.value || auth.activeRole === "accountant"
);

function today(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

const workers = ref<LocalWorker[]>([]);
const movements = ref<LocalAdvance[]>([]);
const balances = ref<WorkerAdvanceBalance[]>([]);
const search = ref("");
const typeFilter = ref<AdvanceType | "all">("all");
const workerFilter = ref("all");
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
watch([errorMessage, successMessage], ([failure, success]) => { if (failure) toast.error(failure); if (success) toast.success(success); });
const formOpen = ref(false);
const editingId = ref<string | null>(null);

const emptyForm = (): AdvanceInput => ({
  worker_id: "",
  movement_date: today(),
  advance_type: "advance_issued",
  amount: 0,
  description: null,
  document_number: null
});
const form = reactive<AdvanceInput>(emptyForm());

const workerById = computed(() => new Map(workers.value.map((worker) => [worker.id, worker])));
const totalOutstanding = computed(() =>
  balances.value.reduce((sum, balance) => sum + balance.outstanding, 0)
);
const visibleMovements = computed(() =>
  movements.value.filter((movement) =>
    workerFilter.value === "all" || movement.worker_id === workerFilter.value
  )
);

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "currency",
    currency: auth.activeCompany?.currency_code || "DZD",
    maximumFractionDigits: 2
  }).format(value);
}

function typeLabel(type: AdvanceType): string {
  switch (type) {
    case "advance_issued": return "تسبيق نقدي";
    case "purchase_expense": return "مشتريات للعامل";
    case "repayment": return "تسديد";
    case "wage_deduction": return "خصم من الأجر";
  }
}

function openCreateForm(): void {
  if (!canCreate.value) return;
  editingId.value = null;
  Object.assign(form, emptyForm());
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function openEditForm(movement: LocalAdvance): void {
  if (!canManage.value) return;
  editingId.value = movement.id;
  Object.assign(form, {
    worker_id: movement.worker_id,
    movement_date: movement.movement_date,
    advance_type: movement.advance_type,
    amount: movement.amount,
    description: movement.description,
    document_number: movement.document_number
  });
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function closeForm(): void {
  formOpen.value = false;
  editingId.value = null;
}

async function loadPage(): Promise<void> {
  if (!companyId.value || !canView.value) {
    workers.value = [];
    movements.value = [];
    balances.value = [];
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    const [workerRows, advanceRows, balanceRows] = await Promise.all([
      listWorkers(companyId.value),
      listAdvances(companyId.value, {
        search: search.value,
        type: typeFilter.value
      }),
      listWorkerAdvanceBalances(companyId.value)
    ]);
    workers.value = workerRows;
    movements.value = advanceRows;
    balances.value = balanceRows;
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تحميل بيانات التسبيقات.";
  } finally {
    loading.value = false;
  }
}

async function saveMovement(): Promise<void> {
  if (!companyId.value || !canCreate.value) return;
  if (editingId.value && !canManage.value) return;

  submitting.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    if (editingId.value) {
      await updateAdvance(companyId.value, editingId.value, form);
      successMessage.value = "تم تعديل حركة التسبيق محلياً.";
    } else {
      await createAdvance(companyId.value, form, auth.user?.id ?? null);
      successMessage.value = "تم تسجيل حركة التسبيق محلياً.";
    }
    closeForm();
    await loadPage();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حفظ حركة التسبيق.";
  } finally {
    submitting.value = false;
  }
}

async function removeMovement(movement: LocalAdvance): Promise<void> {
  if (!canManage.value || !companyId.value) return;
  if (!window.confirm("هل تريد إلغاء حركة التسبيق؟ سيُعاد احتساب الرصيد بعد الإلغاء.")) return;

  errorMessage.value = "";
  successMessage.value = "";
  try {
    await deleteAdvance(companyId.value, movement.id);
    successMessage.value = "تم إلغاء الحركة وإعادة احتساب الرصيد.";
    await loadPage();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر إلغاء حركة التسبيق.";
  }
}

watch([search, typeFilter], () => {
  void loadPage();
});

onMounted(() => {
  void loadPage();
});
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="text-sm font-semibold text-brand-600">حسابات العمال</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">التسبيقات والسلف</h1>
        <p class="mt-1 text-sm text-slate-500">تسجيل التسبيقات والمشتريات والتسديدات وخصومات الأجور.</p>
      </div>
      <button v-if="canCreate" class="primary-button" type="button" @click="openCreateForm">
        <span class="ml-2 text-lg">＋</span>
        تسجيل حركة
      </button>
    </header>

    <div v-if="!companyId" class="panel p-5 text-sm text-amber-800">لا توجد شركة نشطة مرتبطة بهذا الحساب.</div>
    <div class="grid gap-4 sm:grid-cols-3">
      <article class="panel p-5">
        <p class="text-sm text-slate-500">إجمالي رصيد التسبيقات</p>
        <p class="mt-2 text-2xl font-bold text-amber-700">{{ formatMoney(totalOutstanding) }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">عدد العمال ذوي الرصيد</p>
        <p class="mt-2 text-3xl font-bold text-slate-900">{{ balances.filter(item => item.outstanding > 0).length }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">عدد الحركات</p>
        <p class="mt-2 text-3xl font-bold text-slate-900">{{ movements.length }}</p>
      </article>
    </div>

    <section class="panel p-5">
      <h2 class="font-bold text-slate-900">رصيد التسبيقات حسب العامل</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article v-for="balance in balances.filter(item => item.total_issued > 0)" :key="balance.worker_id" class="rounded-xl border border-slate-100 p-4">
          <p class="font-semibold text-slate-800">{{ workerById.get(balance.worker_id)?.full_name || "عامل غير متاح" }}</p>
          <div class="mt-3 flex justify-between text-xs text-slate-500">
            <span>الممنوح: {{ formatMoney(balance.total_issued) }}</span>
            <span>المسدّد: {{ formatMoney(balance.total_repaid) }}</span>
          </div>
          <p class="mt-2 text-lg font-bold" :class="balance.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'">
            المتبقي: {{ formatMoney(balance.outstanding) }}
          </p>
        </article>
        <p v-if="balances.every(item => item.total_issued === 0)" class="py-6 text-sm text-slate-400">
          لا توجد تسبيقات مسجلة.
        </p>
      </div>
    </section>

    <div class="panel overflow-hidden">
      <div class="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
        <input v-model="search" class="form-input" type="search" placeholder="بحث في البيان ورقم الوثيقة..." />
        <select v-model="typeFilter" class="form-input">
          <option value="all">كل أنواع الحركات</option>
          <option value="advance_issued">تسبيق نقدي</option>
          <option value="purchase_expense">مشتريات للعامل</option>
          <option value="repayment">تسديد</option>
        </select>
        <select v-model="workerFilter" class="form-input">
          <option value="all">كل العمال</option>
          <option v-for="worker in workers" :key="worker.id" :value="worker.id">{{ worker.full_name }}</option>
        </select>
      </div>

      <p v-if="errorMessage" role="alert" class="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMessage }}</p>
      <p v-if="successMessage" role="status" class="mx-4 mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{{ successMessage }}</p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[850px] text-right text-sm">
          <thead class="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-5 py-4">التاريخ</th>
              <th class="px-5 py-4">العامل</th>
              <th class="px-5 py-4">نوع الحركة</th>
              <th class="px-5 py-4">البيان</th>
              <th class="px-5 py-4">المبلغ</th>
              <th class="px-5 py-4">رقم الوثيقة</th>
              <th class="px-5 py-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="movement in visibleMovements" :key="movement.id">
              <td class="px-5 py-4 text-slate-500">{{ movement.movement_date }}</td>
              <td class="px-5 py-4 font-semibold">{{ workerById.get(movement.worker_id)?.full_name || "—" }}</td>
              <td class="px-5 py-4">{{ typeLabel(movement.advance_type) }}</td>
              <td class="px-5 py-4 text-slate-500">{{ movement.description || "—" }}</td>
              <td class="px-5 py-4 font-bold">{{ formatMoney(movement.amount) }}</td>
              <td class="px-5 py-4 text-slate-500">{{ movement.document_number || "—" }}</td>
              <td class="px-5 py-4">
                <div v-if="canManage && movement.advance_type !== 'wage_deduction'" class="flex gap-2">
                  <button class="secondary-button !px-3 !py-2" type="button" @click="openEditForm(movement)">تعديل</button>
                  <button class="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" type="button" @click="removeMovement(movement)">إلغاء</button>
                </div>
                <span v-else class="text-xs text-slate-400">عرض فقط / من الأجور</span>
              </td>
            </tr>
            <tr v-if="!loading && visibleMovements.length === 0">
              <td colspan="7" class="px-5 py-14 text-center text-slate-400">لا توجد حركات مطابقة.</td>
            </tr>
            <tr v-if="loading">
              <td colspan="7" class="px-5 py-10 text-center text-slate-400">جارٍ تحميل الحركات...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-400">
        الخصومات التي تتم عبر قسائم الأجور تُخصم تلقائياً من رصيد التسبيقات ولا تحتاج إلى إدخال حركة يدوية.
      </footer>
    </div>

    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="closeForm">
      <section class="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-slate-900">{{ editingId ? "تعديل حركة التسبيق" : "تسجيل حركة تسبيق" }}</h2>
          <button class="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" type="button" @click="closeForm">✕</button>
        </div>
        <form class="mt-6 grid gap-4 sm:grid-cols-2" @submit.prevent="saveMovement">
          <label class="form-field sm:col-span-2">
            العامل
            <select v-model="form.worker_id" class="form-input" :disabled="Boolean(editingId)" required>
              <option value="" disabled>اختر العامل</option>
              <option v-for="worker in workers" :key="worker.id" :value="worker.id">{{ worker.full_name }}</option>
            </select>
          </label>
          <label class="form-field">
            نوع الحركة
            <select v-model="form.advance_type" class="form-input">
              <option value="advance_issued">تسبيق نقدي</option>
              <option value="purchase_expense">مشتريات للعامل</option>
              <option value="repayment">تسديد من العامل</option>
            </select>
          </label>
          <label class="form-field">
            التاريخ
            <input v-model="form.movement_date" class="form-input" type="date" required />
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
            البيان
            <textarea v-model="form.description" class="form-input min-h-20 resize-y" rows="2"></textarea>
          </label>
          <div class="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2">
            الرصيد الحالي للعامل:
            <strong>{{ formatMoney(balances.find(item => item.worker_id === form.worker_id)?.outstanding || 0) }}</strong>
          </div>
          <div class="flex justify-end gap-3 pt-2 sm:col-span-2">
            <button class="secondary-button" type="button" @click="closeForm">إلغاء</button>
            <button class="primary-button" type="submit" :disabled="submitting">{{ submitting ? "جارٍ الحفظ..." : "حفظ الحركة" }}</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>
