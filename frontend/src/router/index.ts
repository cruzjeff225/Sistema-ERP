import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.store";
import { useFeedbackStore } from "../stores/feedback.store";

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0 };
  },
  routes: [
    {
      path: "/",
      redirect: "/dashboard",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: () => import("../views/DashboardView.vue"),
    },
    {
      path: "/users",
      name: "users",
      component: () => import("../views/UsersView.vue"),
      meta: { permission: "users.view" },
    },
    {
      path: "/roles",
      name: "roles",
      component: () => import("../views/RolesView.vue"),
      meta: { permission: "roles.view" },
    },
    {
      path: "/permissions",
      name: "permissions",
      component: () => import("../views/PermissionsView.vue"),
      meta: { permission: "permissions.view" },
    },
    {
      path: "/organization",
      name: "organization",
      component: () => import("../views/OrganizationView.vue"),
      meta: { permission: "companies.view" },
    },
    {
      path: "/suppliers",
      name: "suppliers",
      component: () => import("../views/SuppliersView.vue"),
      meta: { permission: "suppliers.view" },
    },
    {
      path: "/products",
      name: "products",
      component: () => import("../views/ProductsView.vue"),
      meta: { permission: "products.view" },
    },
    {
      path: "/customers",
      name: "customers",
      component: () => import("../views/CustomersView.vue"),
      meta: { permission: "customers.view" },
    },
    {
      path: "/audit",
      name: "audit",
      component: () => import("../views/AuditView.vue"),
      meta: { permission: "logs.view" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
  ],
});

router.onError((error) => {
  console.error("No se pudo cargar la ruta", error);
  useFeedbackStore().error("No se pudo abrir esta pantalla. Inténtalo nuevamente.");
});

router.beforeEach((to) => {
  const authStore = useAuthStore();

  if (!to.meta.public && !authStore.isAuthenticated) {
    return { name: "login" };
  }

  if (to.name === "login" && authStore.isAuthenticated) {
    return { name: "dashboard" };
  }

  const permission = to.meta.permission as string | undefined;
  const isSuperadmin = authStore.user?.roles.includes("superadmin") ?? false;
  if (permission && !isSuperadmin && !authStore.user?.permissions.includes(permission)) {
    return { name: "dashboard" };
  }

  return true;
});

export default router;
