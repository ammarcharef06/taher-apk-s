import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { clearLocalCompanyData, localDb } from "@taher/db";

export type AppRole =
  | "super_admin"
  | "company_admin"
  | "manager"
  | "accountant"
  | "data_entry"
  | "client";

interface MembershipRecord {
  id: string;
  company_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  companies: {
    id: string;
    name: string;
    owner_name: string;
    logo_path: string | null;
    fiscal_year_start_month: number;
    currency_code: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  } | null;
}

interface ProfileRecord {
  id: string;
  display_name: string;
  phone: string | null;
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

export const supabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/.test(supabaseUrl)
);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: "taher-accounting-auth"
      }
    })
  : null;

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const profile = ref<ProfileRecord | null>(null);
  const memberships = ref<MembershipRecord[]>([]);
  const loading = ref(true);
  const initialized = ref(false);
  const errorMessage = ref("");

  const isAuthenticated = computed(() => user.value !== null);
  const isSuperAdmin = computed(() => profile.value?.is_super_admin === true);
  const activeMembership = computed(
    () => memberships.value.find((membership) => membership.is_active) ?? null
  );
  const activeCompany = computed(() => activeMembership.value?.companies ?? null);
  const activeRole = computed<AppRole | null>(() => {
    if (isSuperAdmin.value) return "super_admin";
    return activeMembership.value?.role ?? null;
  });
  const needsSetup = computed(
    () => isAuthenticated.value && !isSuperAdmin.value && memberships.value.length === 0
  );

  function requireSupabase(): SupabaseClient {
    if (!supabase) {
      throw new Error(
        "لم يتم إعداد Supabase. انسخ apps/web/.env.example إلى apps/web/.env.local وأدخل رابط المشروع ومفتاحه العام."
      );
    }
    return supabase;
  }

  async function loadAccountState(currentUser: User): Promise<void> {
    const client = requireSupabase();
    let remoteFailure: Error | null = null;

    try {
      const [profileResult, membershipResult] = await Promise.all([
        client
          .from("profiles")
          .select("id, display_name, phone, is_super_admin, created_at, updated_at")
          .eq("id", currentUser.id)
          .maybeSingle(),
        client
          .from("company_memberships")
          .select(
            "id, company_id, user_id, role, is_active, created_at, updated_at, deleted_at, companies(id, name, owner_name, logo_path, fiscal_year_start_month, currency_code, created_at, updated_at, deleted_at)"
          )
          .eq("user_id", currentUser.id)
          .eq("is_active", true)
          .is("deleted_at", null)
      ]);

      if (profileResult.error) {
        throw new Error("تعذر تحميل الملف الشخصي: " + profileResult.error.message);
      }
      if (membershipResult.error) {
        throw new Error("تعذر تحميل عضويات الشركات: " + membershipResult.error.message);
      }
      if (!profileResult.data) {
        throw new Error("لم يُعثر على الملف الشخصي لهذا الحساب.");
      }

      const nextProfile = profileResult.data as ProfileRecord;
      const nextMemberships = (membershipResult.data ?? []) as unknown as MembershipRecord[];
      const cachedProfile = {
        ...nextProfile,
        _synced: 1 as const,
        _updated_at: nextProfile.updated_at,
        _deleted: null
      };
      const cachedMemberships = nextMemberships.map((membership) => ({
        ...membership,
        _synced: 1 as const,
        _updated_at: membership.updated_at,
        _deleted: membership.deleted_at
      }));
      const cachedCompanies = nextMemberships
        .map((membership) => membership.companies)
        .filter((company) => company !== null)
        .map((company) => ({
          ...company,
          _synced: 1 as const,
          _updated_at: company.updated_at,
          _deleted: company.deleted_at
        }));

      profile.value = nextProfile;
      memberships.value = nextMemberships;

      try {
        await localDb.transaction(
          "rw",
          [localDb.profiles, localDb.memberships, localDb.companies],
          async () => {
            await localDb.profiles.put(cachedProfile);
            if (cachedMemberships.length > 0) {
              await localDb.memberships.bulkPut(cachedMemberships);
            }
            if (cachedCompanies.length > 0) {
              await localDb.companies.bulkPut(cachedCompanies);
            }
          }
        );
      } catch {
        // Keep the authenticated cloud session usable if local caching is unavailable.
      }

      return;
    } catch (error: unknown) {
      remoteFailure =
        error instanceof Error ? error : new Error("تعذر تحميل بيانات الحساب من السحابة.");
    }

    try {
      const [cachedProfile, cachedMemberships] = await Promise.all([
        localDb.profiles.get(currentUser.id),
        localDb.memberships
          .where("user_id")
          .equals(currentUser.id)
          .and((membership) => membership.is_active && membership._deleted === null)
          .toArray()
      ]);

      if (!cachedProfile) {
        throw remoteFailure ?? new Error("لا توجد بيانات حساب محفوظة على هذا الجهاز.");
      }

      const cachedCompanies = await localDb.companies.bulkGet(
        cachedMemberships.map((membership) => membership.company_id)
      );

      profile.value = cachedProfile;
      memberships.value = cachedMemberships.map((membership, index) => ({
        ...membership,
        companies: cachedCompanies[index]
          ? {
              id: cachedCompanies[index]!.id,
              name: cachedCompanies[index]!.name,
              owner_name: cachedCompanies[index]!.owner_name,
              logo_path: cachedCompanies[index]!.logo_path,
              fiscal_year_start_month: cachedCompanies[index]!.fiscal_year_start_month,
              currency_code: cachedCompanies[index]!.currency_code,
              created_at: cachedCompanies[index]!.created_at,
              updated_at: cachedCompanies[index]!.updated_at,
              deleted_at: cachedCompanies[index]!.deleted_at
            }
          : null
      }));
    } catch {
      throw remoteFailure ?? new Error("تعذر تحميل بيانات الحساب محلياً.");
    }
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return;
    loading.value = true;
    errorMessage.value = "";

    try {
      if (!supabase) {
        initialized.value = true;
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      session.value = data.session;
      user.value = data.session?.user ?? null;

      if (user.value) {
        await loadAccountState(user.value);
      }

      supabase.auth.onAuthStateChange((_event, nextSession) => {
        session.value = nextSession;
        user.value = nextSession?.user ?? null;

        if (!nextSession) {
          profile.value = null;
          memberships.value = [];
          return;
        }

        window.setTimeout(() => {
          const currentUser = nextSession.user;
          void loadAccountState(currentUser).catch((error: unknown) => {
            errorMessage.value =
              error instanceof Error ? error.message : "تعذر تحديث بيانات الحساب.";
          });
        }, 0);
      });

      initialized.value = true;
    } catch (error: unknown) {
      errorMessage.value =
        error instanceof Error ? error.message : "تعذر تهيئة المصادقة.";
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function signIn(email: string, password: string): Promise<void> {
    const client = requireSupabase();
    loading.value = true;
    errorMessage.value = "";

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      if (error) throw error;

      session.value = data.session;
      user.value = data.user;
      await loadAccountState(data.user);
    } catch (error: unknown) {
      errorMessage.value =
        error instanceof Error ? error.message : "تعذر تسجيل الدخول.";
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function signUpAndCreateCompany(input: {
    fullName: string;
    email: string;
    password: string;
    companyName: string;
    currencyCode: string;
  }): Promise<void> {
    const client = requireSupabase();
    loading.value = true;
    errorMessage.value = "";

    try {
      const { data, error } = await client.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim()
          }
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error("لم يُرجع Supabase حساب مستخدم صالحاً.");

      if (!data.session) {
        throw new Error(
          "تم إنشاء الحساب، لكن تأكيد البريد الإلكتروني مطلوب قبل إنشاء الشركة. افتح رابط التأكيد ثم سجّل الدخول."
        );
      }

      session.value = data.session;
      user.value = data.user;

      const { error: setupError } = await client.rpc("bootstrap_company", {
        p_company_name: input.companyName.trim(),
        p_owner_name: input.fullName.trim(),
        p_currency_code: input.currencyCode
      });

      if (setupError) {
        throw new Error("تم إنشاء الحساب لكن تعذر إنشاء الشركة: " + setupError.message);
      }

      await loadAccountState(data.user);
    } catch (error: unknown) {
      errorMessage.value =
        error instanceof Error ? error.message : "تعذر إكمال إعداد الحساب والشركة.";
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function createCompanyForCurrentUser(input: {
    fullName: string;
    companyName: string;
    currencyCode: string;
  }): Promise<void> {
    const client = requireSupabase();
    if (!user.value) {
      throw new Error("يجب تسجيل الدخول قبل إنشاء الشركة.");
    }

    loading.value = true;
    errorMessage.value = "";

    try {
      const { error } = await client.rpc("bootstrap_company", {
        p_company_name: input.companyName.trim(),
        p_owner_name: input.fullName.trim(),
        p_currency_code: input.currencyCode
      });
      if (error) throw error;

      await loadAccountState(user.value);
    } catch (error: unknown) {
      errorMessage.value =
        error instanceof Error ? error.message : "تعذر إنشاء الشركة.";
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function signOut(): Promise<void> {
    const client = requireSupabase();
    loading.value = true;
    const companyId = activeCompany.value?.id ?? null;

    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;

      // Never discard unsynchronized work. Keep it partitioned by company until
      // a later authenticated session can safely resume synchronization.
      if (companyId) {
        const pendingChanges = await localDb.syncQueue
          .where("company_id")
          .equals(companyId)
          .count();
        if (pendingChanges === 0) {
          await clearLocalCompanyData(companyId);
        }
      }

      user.value = null;
      session.value = null;
      profile.value = null;
      memberships.value = [];
    } catch (error: unknown) {
      errorMessage.value =
        error instanceof Error ? error.message : "تعذر تسجيل الخروج.";
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function refreshAccountState(): Promise<void> {
    if (!user.value) return;
    await loadAccountState(user.value);
  }

  return {
    user,
    session,
    profile,
    memberships,
    loading,
    initialized,
    errorMessage,
    isAuthenticated,
    isSuperAdmin,
    activeMembership,
    activeCompany,
    activeRole,
    needsSetup,
    initialize,
    signIn,
    signUpAndCreateCompany,
    createCompanyForCurrentUser,
    signOut,
    refreshAccountState
  };
});
