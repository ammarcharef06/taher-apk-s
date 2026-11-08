<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();

const navigation = [
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
</script>

<template>
  <aside class="hidden w-64 shrink-0 lg:block">
    <nav class="panel sticky top-24 space-y-1 p-3" aria-label="القائمة الرئيسية">
      <p class="px-3 pb-3 pt-2 text-xs font-bold text-slate-400">القائمة الرئيسية</p>
      <RouterLink
        v-for="item in navigation"
        :key="item.name"
        :to="{ name: item.name }"
        class="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition"
        :class="route.name === item.name ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'"
      >
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base">{{ item.icon }}</span>
        {{ item.label }}
      </RouterLink>
    </nav>
  </aside>
</template>
