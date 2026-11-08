<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth.store";
import { useSyncStore } from "../../stores/sync.store";

const router = useRouter();
const auth = useAuthStore();
const sync = useSyncStore();
const syncLabel = computed(() => ({
  idle: "غير متزامن",
  syncing: "جارٍ المزامنة",
  online: "متصل ومتزامن",
  offline: "دون اتصال",
  error: "توجد عناصر معلّقة"
}[sync.status]));
watch(
  [() => auth.activeCompany?.id, () => auth.activeRole],
  ([companyId, role]) => {
    if (companyId) void sync.initialize(companyId, role ?? "");
  },
  { immediate: true }
);

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
        <button
          v-if="auth.activeCompany"
          type="button"
          class="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:flex"
          :disabled="sync.isBusy || sync.status === 'offline'"
          :title="sync.errorMessage || 'مزامنة البيانات المحلية مع السحابة'"
          @click="sync.syncNow"
        >
          <span
            class="h-2 w-2 rounded-full"
            :class="{
              'bg-emerald-500': sync.status === 'online',
              'bg-amber-500': sync.status === 'syncing',
              'bg-slate-400': sync.status === 'offline' || sync.status === 'idle',
              'bg-red-500': sync.status === 'error'
            }"
          />
          <span>{{ syncLabel }}</span>
          <span v-if="sync.pending > 0" class="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">{{ sync.pending }}</span>
        </button>
        <div class="hidden text-left sm:block">
          <p class="text-sm font-semibold text-slate-800">{{ auth.profile?.display_name || auth.user?.email }}</p>
          <p class="text-xs text-slate-500">{{ auth.activeCompany?.name || "مدير النظام" }}</p>
        </div>
        <button class="secondary-button" type="button" @click="logout">تسجيل الخروج</button>
      </div>
    </div>
  </header>
</template>
