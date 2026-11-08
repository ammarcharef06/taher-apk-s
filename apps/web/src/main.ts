import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth.store";
import { openLocalDatabase } from "@taher/db";
import "./assets/main.css";

async function bootstrap(): Promise<void> {
  try {
    await openLocalDatabase();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "تعذر فتح التخزين المحلي.";
    console.error(message);
  }

  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  const authStore = useAuthStore(pinia);
  await authStore.initialize();

  await router.isReady();
  app.mount("#app");
}

void bootstrap();
