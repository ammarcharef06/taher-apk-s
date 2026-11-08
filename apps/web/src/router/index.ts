import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "../stores/auth.store";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("../views/auth/LoginView.vue"),
    meta: { guestOnly: true }
  },
  {
    path: "/setup",
    name: "setup",
    component: () => import("../views/auth/SetupView.vue"),
    meta: { guestOnly: true }
  },
  {
    path: "/",
    name: "dashboard",
    component: () => import("../views/dashboard/DashboardView.vue"),
    meta: { requiresAuth: true }
  },
  {
    path: "/workers",
    name: "workers",
    component: () => import("../views/WorkersView.vue"),
    meta: {
      requiresAuth: true,
      title: "العمال",
      allowedRoles: ["company_admin", "manager"]
    }
  },
  {
    path: "/cash",
    name: "cash",
    component: () => import("../views/CashView.vue"),
    meta: {
      requiresAuth: true,
      title: "الصندوق",
      allowedRoles: ["company_admin", "manager", "data_entry"]
    }
  },
  {
    path: "/wages",
    name: "wages",
    component: () => import("../views/WagesView.vue"),
    meta: {
      requiresAuth: true,
      title: "الأجور",
      allowedRoles: ["company_admin", "manager", "accountant"]
    }
  },
  {
    path: "/advances",
    name: "advances",
    component: () => import("../views/AdvancesView.vue"),
    meta: {
      requiresAuth: true,
      title: "التسبيقات",
      allowedRoles: ["company_admin", "manager", "accountant", "data_entry"]
    }
  },
  {
    path: "/social-security",
    name: "socialSecurity",
    component: () => import("../views/SocialSecurityView.vue"),
    meta: {
      requiresAuth: true,
      title: "CNAS / CASNOS",
      allowedRoles: ["company_admin", "manager", "accountant"]
    }
  },
  {
    path: "/expenses",
    name: "expenses",
    component: () => import("../views/PlaceholderView.vue"),
    meta: { requiresAuth: true, title: "المصاريف والمشتريات" }
  },
  {
    path: "/archives",
    name: "archives",
    component: () => import("../views/PlaceholderView.vue"),
    meta: { requiresAuth: true, title: "الأرشيف" }
  },
  {
    path: "/reports",
    name: "reports",
    component: () => import("../views/PlaceholderView.vue"),
    meta: { requiresAuth: true, title: "التقارير" }
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("../views/PlaceholderView.vue"),
    meta: { requiresAuth: true, title: "الإعدادات" }
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/"
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.initialized) {
    try {
      await auth.initialize();
    } catch {
      return { name: "login" };
    }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login" };
  }

  if (to.name === "login" && auth.isAuthenticated) {
    return { name: auth.needsSetup ? "setup" : "dashboard" };
  }

  if (to.name === "setup" && auth.isAuthenticated && !auth.needsSetup) {
    return { name: "dashboard" };
  }

  if (to.meta.requiresAuth && auth.needsSetup) {
    return { name: "setup" };
  }

  const allowedRoles = to.meta.allowedRoles as string[] | undefined;
  if (
    allowedRoles &&
    (!auth.activeRole || !allowedRoles.includes(auth.activeRole))
  ) {
    return { name: "dashboard" };
  }

  return true;
});

export default router;
