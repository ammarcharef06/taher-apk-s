<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth.store";
import FinanceChart from "../components/charts/FinanceChart.vue";
import { buildCompanyReport, type CompanyReport } from "../services/reporting.service";
import { exportCurrentReportAsPdf } from "../services/pdf-export.service";

const auth = useAuthStore();
const { t, locale } = useI18n({ useScope: "global" });
const companyId = computed(() => auth.activeCompany?.id ?? "");
const currency = computed(() => auth.activeCompany?.currency_code ?? "DZD");

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

const today = localDate(new Date());
const from = ref(today.slice(0, 8) + "01");
const to = ref(today);
const report = ref<CompanyReport | null>(null);
const loading = ref(false);
const errorMessage = ref("");

const isRtl = computed(() => locale.value === "ar");
const dateLocale = computed(() => locale.value === "ar" ? "ar-DZ" : locale.value === "fr" ? "fr-FR" : "en-US");

function money(value: number): string {
  return new Intl.NumberFormat(dateLocale.value, {
    style: "currency",
    currency: currency.value,
    maximumFractionDigits: 2
  }).format(value);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(dateLocale.value, { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

const monthlyLabels = computed(() => report.value?.monthly.map(item => monthLabel(item.month)) ?? []);
const monthlyDatasets = computed(() => [
  { label: t("dashboard.income"), data: report.value?.monthly.map(item => item.income) ?? [] },
  { label: t("dashboard.expenses"), data: report.value?.monthly.map(item => item.cashExpenses) ?? [] },
  { label: t("dashboard.payroll"), data: report.value?.monthly.map(item => item.payroll) ?? [] }
]);
const expenseLabels = computed(() => report.value?.expenseCategories.map(item => item.category) ?? []);
const expenseDatasets = computed(() => [
  { label: t("reports.amount"), data: report.value?.expenseCategories.map(item => item.amount) ?? [] }
]);

const indicators = computed(() => {
  if (!report.value) return [];
  return [
    { label: t("reports.cashBalance"), value: money(report.value.cashBalance), icon: "▣" },
    { label: t("reports.cashIncome"), value: money(report.value.cashIncome), icon: "↗" },
    { label: t("reports.cashOutflow"), value: money(report.value.cashOutflow), icon: "↘" },
    { label: t("reports.expensesTotal"), value: money(report.value.expensesTotal), icon: "▤" },
    { label: t("reports.payrollTotal"), value: money(report.value.payrollTotal), icon: "د" },
    { label: t("reports.advancesOutstanding"), value: money(report.value.advancesOutstanding), icon: "↔" },
    { label: t("reports.socialDue"), value: money(report.value.socialDue), icon: "▧" },
    { label: t("reports.workers"), value: report.value.workersCount.toLocaleString(dateLocale.value), icon: "♙" },
    { label: t("reports.archivePending"), value: report.value.archivePending.toLocaleString(dateLocale.value), icon: "▥" }
  ];
});

async function loadReport(): Promise<void> {
  if (!companyId.value) {
    report.value = null;
    return;
  }
  if (from.value > to.value) {
    errorMessage.value = t("reports.loadError");
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    report.value = await buildCompanyReport(companyId.value, currency.value, from.value, to.value);
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : t("reports.loadError");
    report.value = null;
  } finally {
    loading.value = false;
  }
}

async function exportPdf(): Promise<void> {
  const companyName = auth.activeCompany?.name ?? "Taher Accounting";
  await exportCurrentReportAsPdf(companyName + " - " + t("reports.printTitle") + " - " + from.value + " - " + to.value);
}

const generatedAt = computed(() => report.value
  ? new Intl.DateTimeFormat(dateLocale.value, { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.value.generatedAt))
  : "");

onMounted(() => void loadReport());
watch(companyId, () => void loadReport());
</script>

<template>
  <section class="reports-page space-y-6">
    <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="text-sm font-medium text-brand-600">{{ auth.activeCompany?.name }}</p>
        <h1 class="mt-1 text-2xl font-bold text-slate-900">{{ t("reports.title") }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ t("reports.subtitle") }}</p>
      </div>
      <div class="no-print flex flex-wrap gap-2">
        <button class="secondary-button" type="button" :disabled="loading" @click="loadReport">
          {{ t("reports.refresh") }}
        </button>
        <button class="primary-button" type="button" :disabled="!report || loading" @click="exportPdf">
          {{ t("reports.exportPdf") }}
        </button>
      </div>
    </div>

    <div class="no-print panel grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label class="form-field">
        {{ t("reports.from") }}
        <input v-model="from" class="form-input" type="date" :max="to">
      </label>
      <label class="form-field">
        {{ t("reports.to") }}
        <input v-model="to" class="form-input" type="date" :min="from">
      </label>
      <button class="secondary-button" type="button" :disabled="loading" @click="loadReport">
        {{ t("reports.refresh") }}
      </button>
    </div>

    <p v-if="errorMessage" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
      {{ errorMessage }}
    </p>
    <div v-if="loading" class="panel p-8 text-center text-sm text-slate-500">{{ t("common.loading") }}</div>

    <template v-else-if="report">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article v-for="item in indicators" :key="item.label" class="panel p-4">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium text-slate-500">{{ item.label }}</span>
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-lg text-brand-700">{{ item.icon }}</span>
          </div>
          <p class="mt-4 break-words text-xl font-bold text-slate-900">{{ item.value }}</p>
        </article>
      </div>

      <div class="grid gap-5 xl:grid-cols-5">
        <section class="panel min-w-0 p-5 xl:col-span-3">
          <h2 class="font-bold text-slate-900">{{ t("reports.monthlyTrend") }}</h2>
          <div v-if="report.monthly.length" class="mt-4">
            <FinanceChart :labels="monthlyLabels" :datasets="monthlyDatasets" :rtl="isRtl" :currency="currency" />
          </div>
          <p v-else class="py-16 text-center text-sm text-slate-400">{{ t("reports.noRecords") }}</p>
        </section>

        <section class="panel min-w-0 p-5 xl:col-span-2">
          <h2 class="font-bold text-slate-900">{{ t("reports.expenseBreakdown") }}</h2>
          <div v-if="report.expenseCategories.length" class="mt-4">
            <FinanceChart kind="doughnut" :labels="expenseLabels" :datasets="expenseDatasets" :rtl="isRtl" :currency="currency" />
          </div>
          <p v-else class="py-16 text-center text-sm text-slate-400">{{ t("reports.noRecords") }}</p>
        </section>
      </div>

      <section class="panel overflow-hidden">
        <div class="border-b border-slate-100 p-5">
          <h2 class="font-bold text-slate-900">{{ t("reports.expenseBreakdown") }}</h2>
        </div>
        <div v-if="report.expenseCategories.length" class="overflow-x-auto">
          <table class="w-full min-w-[420px] text-sm">
            <thead class="bg-slate-50 text-slate-500">
              <tr>
                <th class="px-5 py-3 text-start font-semibold">{{ t("reports.category") }}</th>
                <th class="px-5 py-3 text-start font-semibold">{{ t("reports.records") }}</th>
                <th class="px-5 py-3 text-end font-semibold">{{ t("reports.amount") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in report.expenseCategories" :key="item.category" class="border-t border-slate-100">
                <td class="px-5 py-3 font-medium text-slate-800">{{ item.category }}</td>
                <td class="px-5 py-3 text-slate-500">{{ item.count.toLocaleString(dateLocale) }}</td>
                <td class="px-5 py-3 text-end font-semibold tabular-nums">{{ money(item.amount) }}</td>
              </tr>
            </tbody>
            <tfoot class="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colspan="2" class="px-5 py-3 font-bold">{{ t("reports.expensesTotal") }}</td>
                <td class="px-5 py-3 text-end font-bold tabular-nums">{{ money(report.expensesTotal) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="p-8 text-center text-sm text-slate-400">{{ t("reports.noRecords") }}</p>
      </section>

      <footer class="report-footer text-xs leading-6 text-slate-400">
        <p>{{ t("reports.generated") }}: {{ generatedAt }}</p>
        <p>{{ t("reports.localNote") }}</p>
      </footer>
    </template>
  </section>
</template>
