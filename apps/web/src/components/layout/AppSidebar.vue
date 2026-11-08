<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../../stores/auth.store";

const route = useRoute();
const auth = useAuthStore();

const allNavigation = [
  { name: "dashboard", label: "لوحة التحكم", icon: "◫" },
  { name: "workers", label: "العمال", icon: "♙" },
  { name: "cash", label: "الصندوق", icon: "▣" },
  { name: "wages", label: "الأجور", icon: "د" },
  { name: "advances", label: "التسبيقات", icon: "↗" },
  { name: "expenses", label: "المصاريف والمشتريات", icon: "▤" },
  { name: "archives", label: "الأرشيف", icon: "▧" },
  { name: "reports", label: "التقارير", icon: "▥" },
  { name: "settings", label: "الإعدادات", icon: "⚙" }
] as const;

const navigation = computed(() =>
  allNavigation.filter((item) => {
    if (item.name === "workers") {
      return auth.activeRole === "company_admin" || auth.activeRole === "manager";
    }
    if (item.name === "cash") {
      return (
        auth.activeRole === "company_admin" ||
        auth.activeRole === "manager" ||
        auth.activeRole === "data_entry"
      );
    }
    return true;
  })
);
</script>

<template>
  <aside class="w-full shrink-0 lg:w-64">
    <nav class="panel flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-24 lg:flex-col lg:space-y-1 lg:p-3" aria-label="القائمة الرئيسية">
      <p class="hidden px-3 pb-3 pt-2 text-xs font-bold text-slate-400 lg:block">القائمة الرئيسية</p>
      <RouterLink
        v-for="item in navigation"
        :key="item.name"
        :to="{ name: item.name }"
        class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-medium transition lg:gap-3"
        :class="route.name === item.name ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'"
      >
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base">{{ item.icon }}</span>
        {{ item.label }}
      </RouterLink>
    </nav>
  </aside>
</template>
