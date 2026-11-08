<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabaseConfigured, useAuthStore } from "../../stores/auth.store";

const router = useRouter();
const auth = useAuthStore();

const fullName = ref("");
const companyName = ref("");
const email = ref("");
const password = ref("");
const currencyCode = ref("DZD");
const localError = ref("");
const submitting = ref(false);

async function submitSetup(): Promise<void> {
  localError.value = "";

  if (!supabaseConfigured) {
    localError.value =
      "إعداد Supabase غير مكتمل. أضف VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY إلى ملف البيئة.";
    return;
  }

  if (!auth.isAuthenticated && password.value.length < 8) {
    localError.value = "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.";
    return;
  }

  submitting.value = true;
  try {
    if (auth.isAuthenticated) {
      await auth.createCompanyForCurrentUser({
        fullName: fullName.value,
        companyName: companyName.value,
        currencyCode: currencyCode.value
      });
    } else {
      await auth.signUpAndCreateCompany({
        fullName: fullName.value,
        email: email.value,
        password: password.value,
        companyName: companyName.value,
        currencyCode: currencyCode.value
      });
    }
    await router.replace({ name: "dashboard" });
  } catch (error: unknown) {
    localError.value =
      error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء الحساب.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
    <section class="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-2">
      <div class="hidden flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-10 text-white lg:flex">
        <div>
          <div class="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold">T</div>
          <p class="mb-3 text-sm font-semibold text-blue-200">TAHER ACCOUNTING NG</p>
          <h1 class="text-4xl font-bold leading-tight">ابدأ إدارة أعمالك<br />من مكان واحد.</h1>
          <p class="mt-5 max-w-sm leading-8 text-slate-300">
            أنشئ حسابك وشركتك لبدء استخدام نظام محاسبي يعمل محلياً ويتصل بالسحابة عند توفر الإنترنت.
          </p>
        </div>
        <p class="text-xs text-slate-400">إدارة مالية واضحة، وبيانات منظّمة.</p>
      </div>

      <div class="p-6 sm:p-10">
        <RouterLink to="/login" class="text-sm font-semibold text-brand-600 hover:text-brand-700">
          لديك حساب؟ تسجيل الدخول
        </RouterLink>

        <div class="mt-8">
          <h2 class="text-2xl font-bold text-slate-900">الإعداد الأول</h2>
          <p class="mt-2 text-sm leading-6 text-slate-500">أنشئ حساب مدير الشركة ثم أدخل معلومات شركتك.</p>
        </div>

        <form class="mt-7 space-y-4" @submit.prevent="submitSetup">
          <label class="form-field">
            الاسم الكامل
            <input v-model.trim="fullName" class="form-input" autocomplete="name" required minlength="2" placeholder="اسم المدير" />
          </label>

          <label class="form-field">
            اسم الشركة أو الورشة
            <input v-model.trim="companyName" class="form-input" required minlength="2" placeholder="اسم الشركة" />
          </label>

          <template v-if="!auth.isAuthenticated">
            <label class="form-field">
              البريد الإلكتروني
              <input v-model.trim="email" class="form-input" type="email" autocomplete="email" required placeholder="name@example.com" />
            </label>

            <label class="form-field">
              كلمة المرور
              <input v-model="password" class="form-input" type="password" autocomplete="new-password" required minlength="8" placeholder="8 أحرف على الأقل" />
            </label>
          </template>

          <label class="form-field">
            العملة
            <select v-model="currencyCode" class="form-input">
              <option value="DZD">الدينار الجزائري (DZD)</option>
              <option value="EUR">اليورو (EUR)</option>
              <option value="USD">الدولار الأمريكي (USD)</option>
            </select>
          </label>

          <p v-if="localError" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {{ localError }}
          </p>

          <button class="primary-button w-full" type="submit" :disabled="submitting || auth.loading">
            {{ submitting ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب والشركة" }}
          </button>
          <p class="text-center text-xs leading-5 text-slate-400">
            يتطلب الإعداد الأول اتصالاً بالإنترنت وتفعيل مشروع Supabase.
          </p>
        </form>
      </div>
    </section>
  </main>
</template>
