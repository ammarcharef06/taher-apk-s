<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth.store";

const route = useRoute();
const auth = useAuthStore();
const { t } = useI18n({ useScope: "global" });

const allNavigation = [
  { name: "dashboard", labelKey: "app.dashboard", icon: "◫" },
  { name: "workers", labelKey: "app.workers", icon: "♙" },
  { name: "cash", labelKey: "app.cash", icon: "▣" },
  { name: "wages", labelKey: "app.wages", icon: "د" },
  { name: "advances", labelKey: "app.advances", icon: "↗" },
  { name: "socialSecurity", labelKey: "app.socialSecurity", icon: "▤" },
  { name: "expenses", labelKey: "app.expenses", icon: "▤" },
  { name: "archives", labelKey: "app.archives", icon: "▧" },
  { name: "invoices", labelKey: "app.invoices", icon: "▤" },
  { name: "reports", labelKey: "app.reports", icon: "▥" },
  { name: "settings", labelKey: "app.settings", icon: "⚙" }
] as const;

const navigation = computed(() => allNavigation.filter(item => {
  if (item.name === "invoices") return auth.activeRole === "company_admin" || auth.activeRole === "manager";
  if (item.name === "workers") return auth.activeRole === "company_admin" || auth.activeRole === "manager";
  if (item.name === "cash") return ["company_admin", "manager", "data_entry"].includes(auth.activeRole ?? "");
  if (item.name === "wages" || item.name === "socialSecurity") return ["company_admin", "manager", "accountant"].includes(auth.activeRole ?? "");
  if (item.name === "expenses" || item.name === "archives") return ["company_admin", "manager", "accountant", "data_entry"].includes(auth.activeRole ?? "");
  if (item.name === "advances") return ["company_admin", "manager", "accountant", "data_entry"].includes(auth.activeRole ?? "");
  return true;
}));
</script>

<template>
  <aside class="w-full shrink-0 lg:w-64">
    <nav class="panel flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-24 lg:flex-col lg:space-y-1 lg:p-3" :aria-label="t('app.mainMenu')">
      <p class="hidden px-3 pb-3 pt-2 text-xs font-bold text-slate-400 lg:block">{{ t("app.mainMenu") }}</p>
      <RouterLink v-for="item in navigation" :key="item.name" :to="{ name: item.name }" class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-medium transition lg:gap-3" :class="route.name === item.name ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'">
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base">{{ item.icon }}</span>
        {{ t(item.labelKey) }}
      </RouterLink>
    </nav>
  </aside>
</template>
