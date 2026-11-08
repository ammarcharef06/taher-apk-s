<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth.store";
import FinanceChart from "../../components/charts/FinanceChart.vue";
import { buildCompanyReport, type CompanyReport } from "../../services/reporting.service";

const auth = useAuthStore();
const { t, locale } = useI18n({ useScope: "global" });
const companyId = computed(() => auth.activeCompany?.id ?? "");
const currency = computed(() => auth.activeCompany?.currency_code ?? "DZD");
const currentMonthReport = ref<CompanyReport | null>(null);
const trendReport = ref<CompanyReport | null>(null);
const loading = ref(false);
const isRtl = computed(() => locale.value === "ar");
const localeCode = computed(() => locale.value === "ar" ? "ar-DZ" : locale.value === "fr" ? "fr-FR" : "en-US");

function localDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

const today = computed(() => new Intl.DateTimeFormat(localeCode.value, { dateStyle: "full" }).format(new Date()));
function money(value: number): string {
  return new Intl.NumberFormat(localeCode.value, { style: "currency", currency: currency.value, maximumFractionDigits: 2 }).format(value);
}

const monthlyLabels = computed(() => trendReport.value?.monthly.map(item => {
  const [year, month] = item.month.split("-").map(Number);
  return new Intl.DateTimeFormat(localeCode.value, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}) ?? []);
const monthlyDatasets = computed(() => [
  { label: t("dashboard.income"), data: trendReport.value?.monthly.map(item => item.income) ?? [] },
  { label: t("dashboard.expenses"), data: trendReport.value?.monthly.map(item => item.cashExpenses) ?? [] },
  { label: t("dashboard.payroll"), data: trendReport.value?.monthly.map(item => item.payroll) ?? [] }
]);

const indicators = computed(() => {
  if (!currentMonthReport.value) return [];
  const data = currentMonthReport.value;
  return [
    { label: t("dashboard.cashBalance"), value: money(data.cashBalance), icon: "▣" },
    { label: t("dashboard.monthlyExpenses"), value: money(data.expensesTotal), icon: "↘" },
    { label: t("dashboard.openAdvances"), value: money(data.advancesOutstanding), icon: "↗" },
    { label: t("dashboard.archivePending"), value: data.archivePending.toLocaleString(localeCode.value), icon: "▧" }
  ];
});

async function loadDashboard(): Promise<void> {
  if (!companyId.value) return;
  loading.value = true;
  const now = new Date();
  const todayValue = localDate(now);
  const monthStart = todayValue.slice(0, 8) + "01";
  const trendStartDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const trendStart = localDate(trendStartDate);
  try {
    const [current, trend] = await Promise.all([
      buildCompanyReport(companyId.value, currency.value, monthStart, todayValue),
      buildCompanyReport(companyId.value, currency.value, trendStart, todayValue)
    ]);
    currentMonthReport.value = current;
    trendReport.value = trend;
  } finally {
    loading.value = false;
  }
}

watch(companyId, () => void loadDashboard(), { immediate: true });
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p class="text-sm text-slate-500">{{ today }}</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">{{ t("dashboard.title") }}</h1>
        <p class="mt-1 text-sm text-slate-500">
          {{ t("dashboard.welcome", { name: auth.profile?.display_name || t("common.unknown") }) }}
        </p>
      </div>
      <span class="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
        <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
        {{ t("app.synced") }}
      </span>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="item in indicators" :key="item.label" class="panel p-5">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-slate-500">{{ item.label }}</span>
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg text-brand-700">{{ item.icon }}</span>
        </div>
        <p class="mt-5 break-words text-2xl font-bold text-slate-900">{{ loading ? "…" : item.value }}</p>
      </article>
      <article v-if="!indicators.length" class="panel p-5 text-sm text-slate-500 sm:col-span-2 xl:col-span-4">
        {{ loading ? t("common.loading") : t("dashboard.noData") }}
      </article>
    </div>

    <div class="grid gap-5 xl:grid-cols-3">
      <section class="panel min-w-0 p-6 xl:col-span-2">
        <h2 class="font-bold text-slate-900">{{ t("dashboard.activity") }}</h2>
        <div v-if="trendReport?.monthly.length" class="mt-4">
          <FinanceChart :labels="monthlyLabels" :datasets="monthlyDatasets" :rtl="isRtl" :currency="currency" />
        </div>
        <p v-else class="py-16 text-center text-sm text-slate-400">{{ t("dashboard.noData") }}</p>
      </section>

      <section class="panel p-6">
        <h2 class="font-bold text-slate-900">{{ t("dashboard.company") }}</h2>
        <dl class="mt-5 space-y-4 text-sm">
          <div><dt class="text-slate-400">{{ t("dashboard.companyName") }}</dt><dd class="mt-1 font-semibold text-slate-800">{{ auth.activeCompany?.name || t("common.unknown") }}</dd></div>
          <div><dt class="text-slate-400">{{ t("dashboard.owner") }}</dt><dd class="mt-1 font-semibold text-slate-800">{{ auth.activeCompany?.owner_name || auth.profile?.display_name || t("common.unknown") }}</dd></div>
          <div><dt class="text-slate-400">{{ t("dashboard.currency") }}</dt><dd class="mt-1 font-semibold text-slate-800">{{ currency }}</dd></div>
          <div><dt class="text-slate-400">{{ t("dashboard.role") }}</dt><dd class="mt-1 font-semibold text-slate-800">{{ auth.activeRole || t("common.unknown") }}</dd></div>
        </dl>
      </section>
    </div>
  </section>
</template>
