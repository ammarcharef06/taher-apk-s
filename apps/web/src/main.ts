import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth.store";
import { openLocalDatabase } from "@taher/db";
import { logger } from "./utils/logger";
import "./assets/main.css";

async function bootstrap(): Promise<void> {
  try {
    await openLocalDatabase();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "تعذر فتح التخزين المحلي.";
    logger.error(message, error);
  }

  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);

  const authStore = useAuthStore(pinia);
  try {
    await authStore.initialize();
  } catch (error: unknown) {
    authStore.errorMessage =
      error instanceof Error ? error.message : "تعذر تهيئة جلسة المستخدم.";
  }

  app.use(router);
  await router.isReady();
  app.mount("#app");
}

void bootstrap();
