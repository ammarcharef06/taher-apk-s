<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth.store";

const router = useRouter();
const auth = useAuthStore();

async function logout(): Promise<void> {
  try {
    await auth.signOut();
    await router.replace({ name: "login" });
  } catch (error: unknown) {
    auth.errorMessage =
      error instanceof Error ? error.message : "تعذر تسجيل الخروج.";
  }
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
      <RouterLink :to="{ name: 'dashboard' }" class="flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-bold text-white">T</span>
        <span>
          <span class="block text-sm font-bold text-slate-900">Taher Accounting NG</span>
          <span class="block text-[11px] text-slate-500">نظام المحاسبة والإدارة</span>
        </span>
      </RouterLink>

      <div class="flex items-center gap-3">
        <div class="hidden text-left sm:block">
          <p class="text-sm font-semibold text-slate-800">{{ auth.profile?.display_name || auth.user?.email }}</p>
          <p class="text-xs text-slate-500">{{ auth.activeCompany?.name || "مدير النظام" }}</p>
        </div>
        <button class="secondary-button" type="button" @click="logout">تسجيل الخروج</button>
      </div>
    </div>
  </header>
</template>
