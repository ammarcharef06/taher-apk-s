<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "../../stores/auth.store";

const auth = useAuthStore();
const today = computed(() =>
  new Intl.DateTimeFormat("ar-DZ", {
    dateStyle: "full"
  }).format(new Date())
);

const indicators = [
  { label: "رصيد الصندوق", value: "—", hint: "سيظهر بعد تسجيل الحركات", icon: "▣" },
  { label: "مصاريف الشهر", value: "—", hint: "ملخص المصاريف الشهرية", icon: "↘" },
  { label: "التسبيقات المفتوحة", value: "—", hint: "أرصدة العمال غير المسوّاة", icon: "↗" },
  { label: "وثائق الأرشيف", value: "—", hint: "الوثائق التي تحتاج متابعة", icon: "▧" }
] as const;
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p class="text-sm text-slate-500">{{ today }}</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">لوحة التحكم</h1>
        <p class="mt-1 text-sm text-slate-500">
          مرحباً {{ auth.profile?.display_name || "بك" }}، هذه نظرة عامة على مساحة عملك.
        </p>
      </div>
      <span class="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
        <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
        تم تسجيل الدخول
      </span>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="item in indicators" :key="item.label" class="panel p-5">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-slate-500">{{ item.label }}</span>
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg text-brand-700">{{ item.icon }}</span>
        </div>
        <p class="mt-5 text-3xl font-bold text-slate-900">{{ item.value }}</p>
        <p class="mt-2 text-xs text-slate-400">{{ item.hint }}</p>
      </article>
    </div>

    <div class="grid gap-5 xl:grid-cols-3">
      <section class="panel p-6 xl:col-span-2">
        <h2 class="font-bold text-slate-900">ملخص النشاط</h2>
        <div class="mt-5 flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
          <span class="text-3xl text-slate-300">▥</span>
          <p class="mt-3 font-semibold text-slate-600">لا توجد بيانات مالية معروضة بعد</p>
          <p class="mt-1 max-w-md text-sm leading-6 text-slate-400">
            ستظهر الرسوم والمؤشرات بعد اكتمال وحدات الصندوق والمصاريف وإدخال الحركات.
          </p>
        </div>
      </section>

      <section class="panel p-6">
        <h2 class="font-bold text-slate-900">بيانات الشركة</h2>
        <dl class="mt-5 space-y-4 text-sm">
          <div>
            <dt class="text-slate-400">اسم الشركة</dt>
            <dd class="mt-1 font-semibold text-slate-800">{{ auth.activeCompany?.name || "غير محدد" }}</dd>
          </div>
          <div>
            <dt class="text-slate-400">المالك</dt>
            <dd class="mt-1 font-semibold text-slate-800">{{ auth.activeCompany?.owner_name || auth.profile?.display_name || "غير محدد" }}</dd>
          </div>
          <div>
            <dt class="text-slate-400">العملة</dt>
            <dd class="mt-1 font-semibold text-slate-800">{{ auth.activeCompany?.currency_code || "DZD" }}</dd>
          </div>
          <div>
            <dt class="text-slate-400">الدور</dt>
            <dd class="mt-1 font-semibold text-slate-800">{{ auth.activeRole || "غير محدد" }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </section>
</template>
