<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { createWorker, deleteWorker, listWorkers, updateWorker } from "@taher/db";
import type { LocalWorker } from "@taher/db";
import type { WorkerInput, WorkerStatus } from "@taher/core";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();
const companyId = computed(() => auth.activeMembership?.company_id ?? "");
const canManage = computed(
  () => auth.activeRole === "company_admin" || auth.activeRole === "manager"
);

const workers = ref<LocalWorker[]>([]);
const search = ref("");
const statusFilter = ref<WorkerStatus | "all">("all");
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const editingId = ref<string | null>(null);
const formOpen = ref(false);

const emptyForm = (): WorkerInput => ({
  full_name: "",
  phone: null,
  job_title: null,
  start_date: new Date().toISOString().slice(0, 10),
  daily_wage: 0,
  status: "active",
  notes: null
});

const form = reactive<WorkerInput>(emptyForm());

const activeCount = computed(
  () => workers.value.filter((worker) => worker.status === "active").length
);
const inactiveCount = computed(() => workers.value.length - activeCount.value);

function setForm(source?: LocalWorker): void {
  const values = source ? {
    full_name: source.full_name,
    phone: source.phone,
    job_title: source.job_title,
    start_date: source.start_date,
    daily_wage: source.daily_wage,
    status: source.status,
    notes: source.notes
  } : emptyForm();

  Object.assign(form, values);
}

function openCreateForm(): void {
  editingId.value = null;
  setForm();
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function openEditForm(worker: LocalWorker): void {
  if (!canManage.value) return;
  editingId.value = worker.id;
  setForm(worker);
  formOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function closeForm(): void {
  formOpen.value = false;
  editingId.value = null;
}

async function loadWorkers(): Promise<void> {
  if (!canManage.value) {
    workers.value = [];
    return;
  }
  if (!companyId.value) {
    workers.value = [];
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    workers.value = await listWorkers(companyId.value, {
      search: search.value,
      status: statusFilter.value
    });
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر تحميل بيانات العمال.";
  } finally {
    loading.value = false;
  }
}

async function saveWorker(): Promise<void> {
  if (!companyId.value) return;
  if (!canManage.value) {
    errorMessage.value = "لا تملك صلاحية إضافة العمال أو تعديلهم.";
    return;
  }

  submitting.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  const payload: WorkerInput = {
    full_name: form.full_name,
    phone: form.phone,
    job_title: form.job_title,
    start_date: form.start_date,
    daily_wage: Number(form.daily_wage),
    status: form.status,
    notes: form.notes
  };

  try {
    if (editingId.value) {
      await updateWorker(companyId.value, editingId.value, payload);
      successMessage.value = "تم تحديث بيانات العامل محلياً.";
    } else {
      await createWorker(companyId.value, payload);
      successMessage.value = "تمت إضافة العامل محلياً.";
    }

    closeForm();
    await loadWorkers();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حفظ بيانات العامل.";
  } finally {
    submitting.value = false;
  }
}

async function removeWorker(worker: LocalWorker): Promise<void> {
  if (!canManage.value || !companyId.value) return;

  const confirmed = window.confirm(
    "سيتم إخفاء العامل وأرشفة سجلات أجوره وتسبيقاته محلياً ضمن عملية الحذف. هل تريد المتابعة؟"
  );
  if (!confirmed) return;

  errorMessage.value = "";
  successMessage.value = "";
  try {
    await deleteWorker(companyId.value, worker.id);
    successMessage.value = "تم حذف العامل وسجلاته المرتبطة محلياً.";
    await loadWorkers();
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : "تعذر حذف العامل.";
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "currency",
    currency: auth.activeCompany?.currency_code || "DZD",
    maximumFractionDigits: 2
  }).format(value);
}

watch([search, statusFilter], () => {
  void loadWorkers();
});

onMounted(() => {
  void loadWorkers();
});
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="text-sm font-semibold text-brand-600">إدارة الموارد البشرية</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">العمال</h1>
        <p class="mt-1 text-sm text-slate-500">إدارة بيانات العمال وحالاتهم وأجورهم اليومية الأساسية.</p>
      </div>
      <button v-if="canManage" class="primary-button" type="button" @click="openCreateForm">
        <span class="ml-2 text-lg">＋</span>
        إضافة عامل
      </button>
    </header>

    <div class="grid gap-4 sm:grid-cols-3">
      <article class="panel p-5">
        <p class="text-sm text-slate-500">إجمالي العمال</p>
        <p class="mt-2 text-3xl font-bold text-slate-900">{{ workers.length }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">يعملون حالياً</p>
        <p class="mt-2 text-3xl font-bold text-emerald-600">{{ activeCount }}</p>
      </article>
      <article class="panel p-5">
        <p class="text-sm text-slate-500">متوقفون</p>
        <p class="mt-2 text-3xl font-bold text-slate-500">{{ inactiveCount }}</p>
      </article>
    </div>

    <div v-if="!companyId" class="panel p-5 text-sm leading-7 text-amber-800">
      لا توجد شركة نشطة مرتبطة بهذا الحساب. يلزم اختيار شركة قبل عرض العمال.
    </div>

    <div class="panel overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
        <input
          v-model="search"
          class="form-input flex-1"
          type="search"
          placeholder="ابحث بالاسم أو الهاتف أو الوظيفة..."
          aria-label="البحث عن عامل"
        />
        <select v-model="statusFilter" class="form-input sm:w-48" aria-label="تصفية حسب الحالة">
          <option value="all">كل الحالات</option>
          <option value="active">يعمل</option>
          <option value="inactive">متوقف</option>
        </select>
      </div>

      <p v-if="errorMessage" role="alert" class="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
        {{ errorMessage }}
      </p>
      <p v-if="successMessage" role="status" class="mx-4 mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        {{ successMessage }}
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-right text-sm">
          <thead class="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-5 py-4">العامل</th>
              <th class="px-5 py-4">الهاتف</th>
              <th class="px-5 py-4">الوظيفة</th>
              <th class="px-5 py-4">تاريخ البداية</th>
              <th class="px-5 py-4">الأجر اليومي</th>
              <th class="px-5 py-4">الحالة</th>
              <th class="px-5 py-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="worker in workers" :key="worker.id" class="hover:bg-slate-50/70">
              <td class="px-5 py-4 font-semibold text-slate-800">{{ worker.full_name }}</td>
              <td class="px-5 py-4 text-slate-500">{{ worker.phone || "—" }}</td>
              <td class="px-5 py-4 text-slate-500">{{ worker.job_title || "—" }}</td>
              <td class="px-5 py-4 text-slate-500">{{ worker.start_date }}</td>
              <td class="px-5 py-4 font-semibold text-slate-700">{{ formatMoney(worker.daily_wage) }}</td>
              <td class="px-5 py-4">
                <span
                  class="rounded-full px-3 py-1 text-xs font-semibold"
                  :class="worker.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                >
                  {{ worker.status === "active" ? "يعمل" : "متوقف" }}
                </span>
              </td>
              <td class="px-5 py-4">
                <div v-if="canManage" class="flex items-center gap-2">
                  <button class="secondary-button !px-3 !py-2" type="button" @click="openEditForm(worker)">تعديل</button>
                  <button class="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" type="button" @click="removeWorker(worker)">حذف</button>
                </div>
                <span v-else class="text-xs text-slate-400">عرض فقط</span>
              </td>
            </tr>
            <tr v-if="!loading && workers.length === 0">
              <td colspan="7" class="px-5 py-14 text-center text-slate-400">
                {{ search || statusFilter !== "all" ? "لا توجد نتائج مطابقة." : "لم تتم إضافة أي عامل بعد." }}
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="7" class="px-5 py-10 text-center text-slate-400">جارٍ تحميل العمال...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
        تُحفظ التعديلات على هذا الجهاز وتُضاف إلى طابور المزامنة.
      </footer>
    </div>

    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" @click.self="closeForm">
      <section class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-slate-900">{{ editingId ? "تعديل بيانات العامل" : "إضافة عامل جديد" }}</h2>
          <button class="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" type="button" aria-label="إغلاق" @click="closeForm">✕</button>
        </div>

        <form class="mt-6 grid gap-4 sm:grid-cols-2" @submit.prevent="saveWorker">
          <label class="form-field sm:col-span-2">
            الاسم الكامل
            <input v-model="form.full_name" class="form-input" required minlength="2" maxlength="160" />
          </label>
          <label class="form-field">
            رقم الهاتف
            <input v-model="form.phone" class="form-input" type="tel" maxlength="32" placeholder="اختياري" />
          </label>
          <label class="form-field">
            الوظيفة
            <input v-model="form.job_title" class="form-input" placeholder="مثال: نجار" />
          </label>
          <label class="form-field">
            تاريخ بداية العمل
            <input v-model="form.start_date" class="form-input" type="date" required />
          </label>
          <label class="form-field">
            الأجر اليومي
            <input v-model.number="form.daily_wage" class="form-input" type="number" min="0" step="0.01" required />
          </label>
          <label class="form-field">
            الحالة
            <select v-model="form.status" class="form-input">
              <option value="active">يعمل</option>
              <option value="inactive">متوقف</option>
            </select>
          </label>
          <label class="form-field sm:col-span-2">
            ملاحظات
            <textarea v-model="form.notes" class="form-input min-h-24 resize-y" rows="3"></textarea>
          </label>
          <div class="flex justify-end gap-3 pt-2 sm:col-span-2">
            <button class="secondary-button" type="button" @click="closeForm">إلغاء</button>
            <button class="primary-button" type="submit" :disabled="submitting">
              {{ submitting ? "جارٍ الحفظ..." : "حفظ العامل" }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>
