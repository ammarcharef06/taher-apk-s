<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabaseConfigured, useAuthStore } from "../../stores/auth.store";

const router = useRouter();
const auth = useAuthStore();
const email = ref("");
const password = ref("");
const localError = ref("");
const submitting = ref(false);

async function submitLogin(): Promise<void> {
  localError.value = "";

  if (!supabaseConfigured) {
    localError.value =
      "إعداد Supabase غير مكتمل. أضف متغيرات البيئة ثم أعد تشغيل خادم التطوير.";
    return;
  }

  submitting.value = true;
  try {
    await auth.signIn(email.value, password.value);
    await router.replace({ name: auth.needsSetup ? "setup" : "dashboard" });
  } catch (error: unknown) {
    localError.value =
      error instanceof Error ? error.message : "تعذر تسجيل الدخول.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
    <section class="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-10">
      <RouterLink to="/" class="inline-flex items-center gap-3">
        <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">T</span>
        <span>
          <span class="block font-bold text-slate-900">Taher Accounting NG</span>
          <span class="block text-xs text-slate-500">نظامك المحاسبي</span>
        </span>
      </RouterLink>

      <div class="mt-9">
        <h1 class="text-2xl font-bold text-slate-900">مرحباً بعودتك</h1>
        <p class="mt-2 text-sm leading-6 text-slate-500">سجّل الدخول للوصول إلى مساحة عمل شركتك.</p>
      </div>

      <form class="mt-7 space-y-5" @submit.prevent="submitLogin">
        <label class="form-field">
          البريد الإلكتروني
          <input v-model.trim="email" class="form-input" type="email" autocomplete="username" required placeholder="name@example.com" />
        </label>

        <label class="form-field">
          كلمة المرور
          <input v-model="password" class="form-input" type="password" autocomplete="current-password" required placeholder="كلمة المرور" />
        </label>

        <p v-if="localError || auth.errorMessage" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {{ localError || auth.errorMessage }}
        </p>

        <button class="primary-button w-full" type="submit" :disabled="submitting || auth.loading">
          {{ submitting ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول" }}
        </button>
      </form>

      <div class="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
        أول مرة تستخدم النظام؟
        <RouterLink to="/setup" class="font-semibold text-brand-600 hover:text-brand-700">إنشاء شركة جديدة</RouterLink>
      </div>
    </section>
  </main>
</template>
