import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { countPendingSync, runCompanySync, type SyncResult } from "../services/sync-engine";

export type SyncStatus = "idle" | "syncing" | "online" | "offline" | "error";

export const useSyncStore = defineStore("sync", () => {
  const status = ref<SyncStatus>("idle");
  const pending = ref(0);
  const lastResult = ref<SyncResult | null>(null);
  const errorMessage = ref("");
  const companyId = ref("");
  const role = ref("");
  const isBusy = computed(() => status.value === "syncing");
  let activeRun: Promise<void> | null = null;
  let listenersAttached = false;

  async function refreshPending(): Promise<void> {
    pending.value = await countPendingSync(companyId.value);
  }

  async function syncNow(): Promise<void> {
    if (!companyId.value) return;
    if (!navigator.onLine) {
      status.value = "offline";
      await refreshPending();
      return;
    }
    if (activeRun) return activeRun;
    activeRun = (async () => {
      status.value = "syncing";
      errorMessage.value = "";
      try {
        lastResult.value = await runCompanySync(companyId.value, role.value);
        pending.value = lastResult.value.pending;
        status.value = lastResult.value.failed > 0 ? "error" : "online";
        if (lastResult.value.failed > 0) {
          errorMessage.value = "بعض السجلات لم تتم مزامنتها. ستتم إعادة المحاولة عند المزامنة التالية.";
        }
      } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "تعذرت المزامنة.";
        status.value = navigator.onLine ? "error" : "offline";
        await refreshPending();
      } finally {
        activeRun = null;
      }
    })();
    return activeRun;
  }

  function handleOnline(): void {
    void syncNow();
  }

  function handleOffline(): void {
    status.value = "offline";
    void refreshPending();
  }

  function handleFocus(): void {
    if (document.visibilityState === "visible") void syncNow();
  }

  function attachListeners(): void {
    if (listenersAttached) return;
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    listenersAttached = true;
  }

  async function initialize(nextCompanyId: string, nextRole: string): Promise<void> {
    companyId.value = nextCompanyId;
    role.value = nextRole;
    attachListeners();
    await refreshPending();
    if (navigator.onLine) await syncNow();
    else status.value = "offline";
  }

  return {
    status, pending, lastResult, errorMessage, isBusy,
    initialize, syncNow, refreshPending
  };
});
