<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
} from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppButton from "../components/base/AppButton.vue";
import { http } from "../services/http.service";
import { usePermissions } from "../composables/usePermissions";

type Activity = {
  id: number;
  recordId: number;
  controller: string;
  action: string;
  createdAt: string;
  user?: { username: string } | null;
};

const { currentUser, can } = usePermissions();
const loading = ref(false);
const errorMessage = ref("");
const counts = ref({
  users: 0,
  roles: 0,
  permissions: 0,
  companies: 0,
  branches: 0,
  warehouses: 0,
  locations: 0,
  suppliers: 0,
  contacts: 0,
});
const recentActivity = ref<Activity[]>([]);

const displayName = computed(() => currentUser.value?.employee?.fullName || currentUser.value?.username || "Administrador");

const metrics = computed(() => [
  { label: "Usuarios activos", value: counts.value.users, detail: `${counts.value.roles} ${counts.value.roles === 1 ? "rol configurado" : "roles configurados"}`, icon: Users, to: "/users", tone: "bg-accent-soft text-accent" },
  { label: "Empresas", value: counts.value.companies, detail: `${counts.value.branches} ${counts.value.branches === 1 ? "sucursal operativa" : "sucursales operativas"}`, icon: Building2, to: "/organization", tone: "bg-success/10 text-success" },
  { label: "Ubicaciones", value: counts.value.locations, detail: `${counts.value.warehouses} ${counts.value.warehouses === 1 ? "almacen" : "almacenes"}`, icon: Warehouse, to: "/organization", tone: "bg-warning/10 text-warning" },
  { label: "Proveedores", value: counts.value.suppliers, detail: `${counts.value.contacts} ${counts.value.contacts === 1 ? "contacto" : "contactos"}`, icon: Truck, to: "/suppliers", tone: "bg-danger/10 text-danger" },
]);

const hierarchy = computed(() => [
  { label: "Empresas", value: counts.value.companies },
  { label: "Sucursales", value: counts.value.branches },
  { label: "Almacenes", value: counts.value.warehouses },
  { label: "Espacios", value: counts.value.locations },
]);

const quickLinks = computed(() => [
  { label: "Organizacion", detail: "Empresas y ubicaciones", icon: Building2, to: "/organization", visible: can("companies.view") },
  { label: "Usuarios", detail: "Accesos del equipo", icon: Users, to: "/users", visible: can("users.view") },
  { label: "Roles y permisos", detail: "Politicas de acceso", icon: ShieldCheck, to: "/roles", visible: can("roles.view") },
  { label: "Proveedores", detail: "Directorio comercial", icon: Truck, to: "/suppliers", visible: can("suppliers.view") },
]);

const actionLabels: Record<string, string> = {
  CREATE: "Creo",
  UPDATE: "Actualizo",
  DELETE: "Elimino",
  ACTIVATE: "Activo",
  DEACTIVATE: "Desactivo",
  LOGIN: "Inicio sesion",
  LOGIN_FAILED: "Intento de acceso",
  ASSIGN_ROLES: "Asigno roles",
  ASSIGN_PERMISSIONS: "Asigno permisos",
  CHANGE_PASSWORD: "Cambio una contrasena",
  UNLOCK: "Desbloqueo",
};

const controllerLabels: Record<string, string> = {
  auth: "el acceso",
  users: "un usuario",
  roles: "un rol",
  permissions: "un permiso",
  companies: "una empresa",
  branches: "una sucursal",
  warehouses: "un almacen",
  warehouse_category: "una categoria",
  locations: "un espacio",
  suppliers: "un proveedor",
  supplier_contacts: "un contacto",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function describeActivity(row: Activity) {
  const action = actionLabels[row.action] ?? row.action.toLowerCase();
  return `${action} ${controllerLabels[row.controller] ?? row.controller} #${row.recordId}`;
}

async function loadDashboard() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await http.get("/dashboard/summary");
    counts.value = { ...counts.value, ...response.data.data.counts };
    recentActivity.value = response.data.data.recentActivity ?? [];
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message ?? "No se pudo cargar el resumen";
  } finally {
    loading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <AdminLayout title="Dashboard">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-accent">Resumen operativo</p>
        <h1 class="page-title mt-1">Hola, {{ displayName }}</h1>
        <p class="page-subtitle">Todo lo importante del ERP, en una vista rapida.</p>
      </div>
      <AppButton variant="outline" :disabled="loading" @click="loadDashboard">
        <RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" />
        Actualizar
      </AppButton>
    </div>

    <p v-if="errorMessage" class="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {{ errorMessage }}
    </p>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <RouterLink
        v-for="metric in metrics"
        :key="metric.label"
        :to="metric.to"
        class="group rounded-lg border border-border/80 bg-surface p-4 shadow-subtle transition hover:border-accent/40"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-medium text-muted-fg">{{ metric.label }}</p>
            <p class="mt-2 text-3xl font-semibold text-fg">{{ loading ? "..." : metric.value }}</p>
            <p class="mt-1 truncate text-xs text-muted-fg">{{ metric.detail }}</p>
          </div>
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-lg" :class="metric.tone">
            <component :is="metric.icon" class="h-5 w-5" />
          </div>
        </div>
      </RouterLink>
    </div>

    <section class="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h2 class="font-semibold text-fg">Estructura organizacional</h2>
          <p class="text-sm text-muted-fg">Relacion fisica de la operacion</p>
        </div>
        <RouterLink to="/organization" class="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          Gestionar <ArrowRight class="h-4 w-4" />
        </RouterLink>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="(step, index) in hierarchy"
          :key="step.label"
          class="relative flex items-center justify-between border-b border-border px-4 py-4 last:border-b-0 sm:px-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
        >
          <div>
            <p class="text-xs font-semibold uppercase text-muted-fg">{{ step.label }}</p>
            <p class="mt-1 text-2xl font-semibold text-fg">{{ loading ? "..." : step.value }}</p>
          </div>
          <ChevronRight v-if="index < hierarchy.length - 1" class="hidden h-4 w-4 text-muted-fg lg:block" />
        </div>
      </div>
    </section>

    <div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
      <section class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 class="font-semibold text-fg">Actividad reciente</h2>
            <p class="text-sm text-muted-fg">Ultimos cambios registrados</p>
          </div>
          <RouterLink v-if="can('logs.view')" to="/audit" class="text-sm font-medium text-accent hover:underline">Ver bitacora</RouterLink>
        </div>
        <div class="divide-y divide-border">
          <div v-for="row in recentActivity" :key="row.id" class="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-secondary text-muted-fg">
              <KeyRound class="h-4 w-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-fg">{{ describeActivity(row) }}</p>
              <p class="truncate text-xs text-muted-fg">{{ row.user?.username ?? "Sistema" }} · {{ formatDate(row.createdAt) }}</p>
            </div>
          </div>
          <p v-if="!loading && !recentActivity.length" class="px-5 py-10 text-center text-sm text-muted-fg">Aun no hay actividad registrada.</p>
        </div>
      </section>

      <section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 class="font-semibold text-fg">Accesos directos</h2>
        <p class="mb-3 text-sm text-muted-fg">Tareas frecuentes</p>
        <div class="divide-y divide-border">
          <RouterLink
            v-for="link in quickLinks.filter((item) => item.visible)"
            :key="link.to"
            :to="link.to"
            class="group flex items-center gap-3 py-3 first:pt-1 last:pb-0"
          >
            <component :is="link.icon" class="h-4 w-4 shrink-0 text-muted-fg group-hover:text-accent" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-fg">{{ link.label }}</p>
              <p class="truncate text-xs text-muted-fg">{{ link.detail }}</p>
            </div>
            <ChevronRight class="h-4 w-4 text-muted-fg" />
          </RouterLink>
        </div>
      </section>
    </div>
  </AdminLayout>
</template>
