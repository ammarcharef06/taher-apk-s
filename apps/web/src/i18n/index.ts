import { createI18n } from "vue-i18n";
import { watch } from "vue";
import ar from "./locales/ar";
import fr from "./locales/fr";
import en from "./locales/en";

export type AppLocale = "ar" | "fr" | "en";
const STORAGE_KEY = "taher-accounting-locale";
const supportedLocales: AppLocale[] = ["ar", "fr", "en"];

function readInitialLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && supportedLocales.includes(saved as AppLocale)) return saved as AppLocale;
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return "ar";
}

export const i18n = createI18n({
  legacy: false,
  locale: readInitialLocale(),
  fallbackLocale: "en",
  messages: { ar, fr, en }
});

const localeRef = i18n.global.locale;
watch(localeRef, (value) => {
  const locale = supportedLocales.includes(value as AppLocale) ? value as AppLocale : "ar";
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Language remains active for the current session if storage is unavailable.
  }
}, { immediate: true });

export function setAppLocale(locale: AppLocale): void {
  if (supportedLocales.includes(locale)) localeRef.value = locale;
}
