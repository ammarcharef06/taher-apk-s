<script setup lang="ts">
import { useToast } from "../composables/toast";
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  createSocialSecurityDeclaration,
  deleteSocialSecurityDeclaration,
  listSocialSecurityDeclarations,
  updateSocialSecurityDeclaration
} from "@taher/db";
import type { LocalSocialSecurityDeclaration } from "@taher/db";
import type {
  SocialSecurityAgency,
  SocialSecurityInput,
  SocialSecurityPaymentStatus
} from "@taher/core";
import { calculateSocialSecurityAmounts } from "@taher/core";
import { useAuthStore } from "../stores/auth.store";

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
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    "01"
  ].join("-");
}

const declarations = ref<LocalSocialSecurityDeclaration[]>([]);
const agencyFilter = ref<SocialSecurityAgency | "all">("all");
const statusFilter = ref<SocialSecurityPaymentStatus | "all">("all");
const periodFilter = ref(currentMonth());
const periodFilterInput = computed({
  get: () => periodFilter.value.slice(0, 7),
  set: (value: string) => {
    periodFilter.value = value ? value + "-01" : "";
  }
});
const search = ref("");
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
watch([errorMessage, successMessage], ([failure, success]) => { if (failure) toast.error(failure); if (success) toast.success(success); });
const formOpen = ref(false);
const editingId = ref<string | null>(null);

const emptyForm = (): SocialSecurityInput => ({
  agency: "CNAS",
  declaration_period: currentMonth(),
  declaration_type: "اشتراكات شهرية",
  amount_due: 0,
  amount_paid: 0,
  payment_date: null,
  receipt_number: null,
  archive_location: null,
  notes: null
});
const form = reactive<SocialSecurityInput>(emptyForm());
const declarationMonthInput = computed({
  get: () => form.declaration_period.slice(0, 7),
  set: (value: string) => {
    if (value) form.declaration_period = value + "-01";
  }
});

const totalDue = computed(() =>
  declarations.value.reduce((sum, row) => sum + row.amount_due, 0)
);
const totalPaid = computed(() =>
  declarations.value.reduce((sum, row) => sum + row.amount_paid, 0)
);
const totalRemaining = computed(() =>
  declarations.value.reduce(
    (sum, row) => sum + calculateSocialSecurityAmounts(row.amount_due, row.amount_paid).remaining_amount,
    0
  )
);

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "currency",
    currency: auth.activeCompany?.currency_code || "DZD",
    maximumFractionDigits: 2
  }).format(value);
}

function statusLabel(status: SocialSecurityPaymentStatus): string {
  switch (status) {
    case "paid": return "مدفوع";
    case "partial": return "مدفوع جزئياً";
    case "unpaid": return "غير مدفوع";
  }
}

async function loadDeclarations(): Promise<void> {
  if (!companyId.value || !canView.value) {
    declarations.value = [];
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    declarations.value = await listSocialSecurityDeclarations(companyId.value, {
      agency: agencyFilter.value,
      status: statusFilter.value,
      periodFrom: periodFilter.value || undefined,
      periodTo: periodFilter.value || undefined,
      search: search.value
    });
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تحميل تصريحات الضمان الاجتماعي.";
  } finally {
    loading.value = false;
  }
}

function openCreateForm(): void {
  if (!canManage.value) return;
  editingId.value = null;
  Object.assign(form, emptyForm());
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function openEditForm(row: LocalSocialSecurityDeclaration): void {
  if (!canManage.value) return;
  editingId.value = row.id;
  Object.assign(form, {
    agency: row.agency,
    declaration_period: row.declaration_period,
    declaration_type: row.declaration_type,
    amount_due: row.amount_due,
    amount_paid: row.amount_paid,
    payment_date: row.payment_date,
    receipt_number: row.receipt_number,
    archive_location: row.archive_location,
    notes: row.notes
  });
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function closeForm(): void {
  formOpen.value = false;
  editingId.value = null;
}

async function saveDeclaration(): Promise<void> {
  if (!companyId.value || !canManage.value) return;
  submitting.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    if (editingId.value) {
      await updateSocialSecurityDeclaration(companyId.value, editingId.value, form);
      successMessage.value = "تم تحديث التصريح محلياً.";
    } else {
      await createSocialSecurityDeclaration(companyId.value, form, auth.user?.id ?? null);
      successMessage.value = "تم إنشاء التصريح محلياً.";
    }
    closeForm();
    await loadDeclarations();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حفظ تصريح الضمان الاجتماعي.";
  } finally {
    submitting.value = false;
  }
}

async function removeDeclaration(row: LocalSocialSecurityDeclaration): Promise<void> {
  if (!canManage.value || !companyId.value) return;
  if (!window.confirm("هل تريد إلغاء هذا التصريح؟")) return;

  errorMessage.value = "";
  successMessage.value = "";
  try {
    await deleteSocialSecurityDeclaration(companyId.value, row.id);
    successMessage.value = "تم إلغاء التصريح محلياً.";
    await loadDeclarations();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر إلغاء التصريح.";
  }
}

watch([agencyFilter, statusFilter, periodFilter, search], () => {
  void loadDeclarations();
});

onMounted(() => {
  void loadDeclarations();
});
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="text-sm font-semibold text-brand-600">الالتزامات الاجتماعية</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">CNAS / CASNOS</h1>
        <p class="mt-1 text-sm text-slate-500">متابعة التصريحات والمبالغ المستحقة والمدفوعة والمتبقية.</p>
      </div>
      <button v-if="canManage" class="primary-button" type="button" @click="openCreateForm">
        <span class="ml-2 text-lg">＋</span>
        تسجيل تصريح
      </button>
    </header>

    <div v-if="!companyId" class="panel p-5 text-sm text-amber-800">لا توجد شركة نشطة مرتبطة بهذا الحساب.</div>
    <div v-else-if="!canView" class="panel p-5 text-sm text-amber-800">ليست لديك صلاحية الوصول إلى تصريحات الضمان الاجتماعي.</div>

    <div class="grid gap-4 sm:grid-cols-3">
      <article class="panel p-5">
        <p class="text-sm text-slate-500">إجمالي المستحق</p>
        <p class="mt-2 text-2xl font-bold text-slate-900">{{ formatMoney(totalDue) }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">إجمالي المدفوع</p>
        <p class="mt-2 text-2xl font-bold text-emerald-700">{{ formatMoney(totalPaid) }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">المتبقي للدفع</p>
        <p class="mt-2 text-2xl font-bold text-amber-700">{{ formatMoney(totalRemaining) }}</p>
      </article>
    </div>

    <div class="panel overflow-hidden">
      <div class="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <input v-model="search" class="form-input" type="search" placeholder="بحث في نوع التصريح أو رقم الوصل..." />
        <select v-model="agencyFilter" class="form-input">
          <option value="all">كل الهيئات</option>
          <option value="CNAS">CNAS</option>
          <option value="CASNOS">CASNOS</option>
        </select>
        <select v-model="statusFilter" class="form-input">
          <option value="all">كل حالات الدفع</option>
          <option value="unpaid">غير مدفوع</option>
          <option value="partial">مدفوع جزئياً</option>
          <option value="paid">مدفوع</option>
        </select>
        <label class="form-field !gap-1">
          <span class="text-xs text-slate-500">فترة التصريح</span>
          <input v-model="periodFilterInput" class="form-input" type="month" />
        </label>
      </div>

      <p v-if="errorMessage" role="alert" class="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMessage }}</p>
      <p v-if="successMessage" role="status" class="mx-4 mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{{ successMessage }}</p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[1050px] text-right text-sm">
          <thead class="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-5 py-4">الهيئة</th>
              <th class="px-5 py-4">الفترة</th>
              <th class="px-5 py-4">نوع التصريح</th>
              <th class="px-5 py-4">المستحق</th>
              <th class="px-5 py-4">المدفوع</th>
              <th class="px-5 py-4">المتبقي</th>
              <th class="px-5 py-4">الحالة</th>
              <th class="px-5 py-4">تاريخ الدفع</th>
              <th class="px-5 py-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in declarations" :key="row.id">
              <td class="px-5 py-4 font-bold text-slate-800">{{ row.agency }}</td>
              <td class="px-5 py-4 text-slate-500">{{ row.declaration_period.slice(0, 7) }}</td>
              <td class="px-5 py-4">{{ row.declaration_type }}</td>
              <td class="px-5 py-4">{{ formatMoney(row.amount_due) }}</td>
              <td class="px-5 py-4 text-emerald-700">{{ formatMoney(row.amount_paid) }}</td>
              <td class="px-5 py-4 font-bold text-amber-700">{{ formatMoney(row.amount_due - row.amount_paid) }}</td>
              <td class="px-5 py-4">
                <span class="rounded-full px-3 py-1 text-xs font-semibold"
                  :class="row.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : row.payment_status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'">
                  <span class="status-pill" :class="row.payment_status === 'paid' ? 'status-positive' : row.payment_status === 'unpaid' ? 'status-negative' : 'status-pending'">{{ statusLabel(row.payment_status) }}</span>
                </span>
              </td>
              <td class="px-5 py-4 text-slate-500">{{ row.payment_date || "—" }}</td>
              <td class="px-5 py-4">
                <div v-if="canManage" class="flex gap-2">
                  <button class="secondary-button !px-3 !py-2" type="button" @click="openEditForm(row)">تعديل</button>
                  <button class="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" type="button" @click="removeDeclaration(row)">إلغاء</button>
                </div>
                <span v-else class="text-xs text-slate-400">عرض فقط</span>
              </td>
            </tr>
            <tr v-if="!loading && declarations.length === 0">
              <td colspan="9" class="px-5 py-14 text-center text-slate-400">لا توجد تصريحات مطابقة.</td>
            </tr>
            <tr v-if="loading">
              <td colspan="9" class="px-5 py-10 text-center text-slate-400">جارٍ تحميل التصريحات...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-400">
        حالة الدفع تُشتق تلقائياً من مقارنة المبلغ المدفوع بالمبلغ المستحق.
      </footer>
    </div>

    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="closeForm">
      <section class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-slate-900">{{ editingId ? "تعديل تصريح" : "تسجيل تصريح جديد" }}</h2>
          <button class="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" type="button" @click="closeForm">✕</button>
        </div>

        <form class="mt-6 grid gap-4 sm:grid-cols-2" @submit.prevent="saveDeclaration">
          <label class="form-field">
            هيئة الضمان الاجتماعي
            <select v-model="form.agency" class="form-input">
              <option value="CNAS">CNAS</option>
              <option value="CASNOS">CASNOS</option>
            </select>
          </label>
          <label class="form-field">
            شهر التصريح
            <input v-model="declarationMonthInput" class="form-input" type="month" required />
          </label>
          <label class="form-field sm:col-span-2">
            نوع التصريح
            <input v-model="form.declaration_type" class="form-input" required minlength="2" maxlength="120" placeholder="اشتراكات شهرية..." />
          </label>
          <label class="form-field">
            المبلغ المستحق
            <input v-model.number="form.amount_due" class="form-input" type="number" min="0" step="0.01" required />
          </label>
          <label class="form-field">
            المبلغ المدفوع
            <input v-model.number="form.amount_paid" class="form-input" type="number" min="0" :max="form.amount_due" step="0.01" required />
          </label>
          <label class="form-field">
            تاريخ الدفع
            <input v-model="form.payment_date" class="form-input" type="date" :required="form.amount_paid > 0" />
          </label>
          <label class="form-field">
            رقم الوصل
            <input v-model="form.receipt_number" class="form-input" />
          </label>
          <label class="form-field sm:col-span-2">
            مكان الأرشفة
            <input v-model="form.archive_location" class="form-input" placeholder="خزانة / رف / ملف..." />
          </label>
          <label class="form-field sm:col-span-2">
            ملاحظات
            <textarea v-model="form.notes" class="form-input min-h-20 resize-y" rows="2"></textarea>
          </label>
          <div class="rounded-xl bg-slate-50 p-4 text-sm sm:col-span-2">
            <div class="flex justify-between"><span class="text-slate-500">المتبقي</span><strong>{{ formatMoney(Math.max(0, Number(form.amount_due) - Number(form.amount_paid))) }}</strong></div>
            <div class="mt-2 flex justify-between"><span class="text-slate-500">الحالة</span><strong>{{ form.amount_due === 0 || form.amount_paid >= form.amount_due ? "مدفوع" : form.amount_paid > 0 ? "مدفوع جزئياً" : "غير مدفوع" }}</strong></div>
          </div>
          <div class="flex justify-end gap-3 pt-2 sm:col-span-2">
            <button class="secondary-button" type="button" @click="closeForm">إلغاء</button>
            <button class="primary-button" type="submit" :disabled="submitting">{{ submitting ? "جارٍ الحفظ..." : "حفظ التصريح" }}</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>
