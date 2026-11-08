<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const title = computed(() => String(route.meta.title ?? "القسم"));
</script>

<template>
  <section class="panel p-8">
    <p class="text-sm font-semibold text-brand-600">Taher Accounting NG</p>
    <h1 class="mt-2 text-2xl font-bold text-slate-900">{{ title }}</h1>
    <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
      تم تجهيز المسار ضمن الهيكل الأساسي. تنفيذ وظائف هذا القسم يأتي في مرحلته المحددة وفق خطة المشروع.
    </p>
  </section>
</template>
