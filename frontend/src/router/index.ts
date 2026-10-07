import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.store";
import { useFeedbackStore } from "../stores/feedback.store";
import { administrationPermissions, administrationRoute, administrationSections, type AdministrationSectionId } from '../config/administration.config';
import { operationsPermissions, operationsRoute } from '../config/operations.config';
import { purchasingPermissions, purchasingRoute } from '../config/purchasing.config';
import { salesPermissions, salesRoute } from '../config/sales.config';

const administrationViews: Record<AdministrationSectionId, () => Promise<unknown>> = {
  users: () => import('../views/UsersView.vue'),
  roles: () => import('../views/RolesView.vue'),
  permissions: () => import('../views/PermissionsView.vue'),
  audit: () => import('../views/AuditView.vue'),
  trash: () => import('../views/TrashView.vue'),
  warehouse: () => import('../views/WarehouseSettingsView.vue'),
};

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0 };
  },
  routes: [
    { path: salesRoute, name: 'sales', component: () => import('../views/SalesView.vue'), meta: { permissionsAny: salesPermissions } },
    { path: '/sales/customers', name: 'customers', component: () => import('../views/CustomersView.vue'), meta: { permission: 'customers.view' } },
    { path: '/customers', redirect: to => ({ path: '/sales/customers', query: to.query, hash: to.hash }) },
    { path: purchasingRoute, name: 'purchasing', component: () => import('../views/PurchasingView.vue'), meta: { permissionsAny: purchasingPermissions } },
    { path: operationsRoute, name: 'operations', component: () => import('../views/OperationsView.vue'), meta: { permissionsAny: operationsPermissions } },
    { path: administrationRoute, name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { permissionsAny: administrationPermissions } },
    ...administrationSections.map(section => ({
      path: section.route,
      name: section.id,
      component: administrationViews[section.id],
      meta: { permission: section.permission },
    })),
    ...administrationSections.map(section => ({
      path: section.previousRoute,
      redirect: (to: import('vue-router').RouteLocationGeneric) => ({ path: section.route, query: to.query, hash: to.hash }),
    })),
    { path: '/purchases/quotations/manage', name: 'quotation-workspace', component: () => import('../views/QuotationWorkspaceView.vue'), meta: { permissionsAny: ['purchase_quotations.view','purchase_orders.approve'] } },
    { path: '/purchases/consolidations', redirect: to => ({ path: '/purchases/quotations/manage', query: to.query }) },
    { path: '/inventory/warehouse', name: 'warehouse-operations', beforeEnter: to => to.query.tab==='configuration' && !to.query.purchaseId && !to.query.requestId ? {path:'/administration/settings/warehouse'} : true, component: () => import('../views/WarehouseOperationsView.vue'), meta: { permission: 'inventory.view' } },
    { path: "/inventory", name: "inventory", component: () => import("../views/InventoryView.vue"), meta: { permission: "inventory.view" } },
    { path: "/purchases/comparison", name: "quotation-comparison", component: () => import("../views/QuotationComparisonView.vue"), meta: { permission: "purchase_quotations.view" } },
    { path: "/purchases/expense-types", name: "expense-types", component: () => import("../views/ExpenseTypesView.vue"), meta: { permission: "expense_types.view" } },
    { path: "/purchases/receipts", name: "purchase-receipts", component: () => import("../views/PurchaseReceiptsView.vue"), meta: { permission: "purchases.view" } },
    { path: "/account/security", name: "account-security", component: () => import("../views/AccountSecurityView.vue") },
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
      path: "/organization",
      name: "organization",
      component: () => import("../views/OrganizationView.vue"),
      meta: { permission: "companies.view" },
    },
    ...[
      { section: "branches", permission: "branches.view" },
      { section: "warehouses", permission: "warehouses.view" },
      { section: "locations", permission: "locations.view" },
      { section: "categories", permission: "warehouse_categories.view" },
    ].map(({ section, permission }) => ({
      path: `/organization/${section}`,
      name: `organization-${section}`,
      component: () => import("../views/OrganizationView.vue"),
      meta: { permission },
    })),
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
      path: "/purchases/requests",
      name: "purchase-requests",
      component: () => import("../views/PurchasesView.vue"),
      props: { section: "requests" },
      meta: { permission: "purchase_requests.view" },
    },
    {
      path: "/purchases/quotations",
      name: "purchase-quotations",
      component: () => import("../views/PurchasesView.vue"),
      props: { section: "quotations" },
      meta: { permission: "purchase_quotations.view" },
    },
    {
      path: "/purchases/orders",
      name: "purchase-orders",
      component: () => import("../views/PurchasesView.vue"),
      props: { section: "orders" },
      meta: { permission: "purchase_orders.view" },
    },
    {
      path: "/purchases/retaceos",
      name: "retaceos",
      component: () => import("../views/RetaceosView.vue"),
      meta: { permission: "retaceos.view" },
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
  const permissionsAny = to.meta.permissionsAny as readonly string[] | undefined;
  const isSuperadmin = authStore.user?.roles.includes("superadmin") ?? false;
  if (permission && !isSuperadmin && !authStore.user?.permissions.includes(permission)) {
    return { name: "dashboard" };
  }
  if (permissionsAny && !isSuperadmin && !permissionsAny.some(item => authStore.user?.permissions.includes(item))) {
    return { name: "dashboard" };
  }

  return true;
});

export default router;
