<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../../stores/auth.store";
import { useSyncStore, type SyncStatus } from "../../stores/sync.store";

const router = useRouter();
const auth = useAuthStore();
const sync = useSyncStore();
const { t, locale } = useI18n({ useScope: "global" });
const syncKeys: Record<SyncStatus, "app.idle" | "app.syncing" | "app.synced" | "app.offline" | "app.syncError"> = {
  idle: "app.idle",
  syncing: "app.syncing",
  online: "app.synced",
  offline: "app.offline",
  error: "app.syncError"
};
const syncLabel = computed(() => t(syncKeys[sync.status]));

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
    auth.errorMessage = error instanceof Error ? error.message : "تعذر تسجيل الخروج.";
  }
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
      <RouterLink :to="{ name: 'dashboard' }" class="flex min-w-0 items-center gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 font-bold text-white">T</span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-bold text-slate-900">{{ t("app.name") }}</span>
          <span class="hidden text-[11px] text-slate-500 sm:block">{{ t("app.subtitle") }}</span>
        </span>
      </RouterLink>

      <div class="flex shrink-0 items-center gap-2 sm:gap-3">
        <button v-if="auth.activeCompany" type="button" class="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:px-3" :disabled="sync.isBusy || sync.status === 'offline'" :title="sync.errorMessage || syncLabel" @click="sync.syncNow">
          <span class="h-2 w-2 rounded-full" :class="{
            'bg-emerald-500': sync.status === 'online',
            'bg-amber-500': sync.status === 'syncing',
            'bg-slate-400': sync.status === 'offline' || sync.status === 'idle',
            'bg-red-500': sync.status === 'error'
          }" />
          <span class="hidden sm:inline">{{ syncLabel }}</span>
          <span v-if="sync.pending > 0" class="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">{{ sync.pending }}</span>
        </button>
        <label class="sr-only" for="app-locale">{{ t("app.language") }}</label>
        <select id="app-locale" v-model="locale" class="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500" :aria-label="t('app.language')">
          <option value="ar">العربية</option>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
        <div class="hidden text-left sm:block">
          <p class="text-sm font-semibold text-slate-800">{{ auth.profile?.display_name || auth.user?.email }}</p>
          <p class="text-xs text-slate-500">{{ auth.activeCompany?.name || "Super Admin" }}</p>
        </div>
        <button class="secondary-button !px-2 sm:!px-4" type="button" @click="logout">{{ t("app.logout") }}</button>
      </div>
    </div>
  </header>
</template>
