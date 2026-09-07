<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Download, Eye, RefreshCw, Search, SlidersHorizontal, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import { http } from "../services/http.service";
import { usePermissions } from "../composables/usePermissions";

type AuditRow = {
  id: number;
  recordId: number;
  controller: string;
  action: string;
  originalData: unknown;
  modifiedData: unknown;
  createdAt: string;
  user?: { username: string; email: string } | null;
};

type AuditUser = { id: number; username: string; email: string };

const { can } = usePermissions();
const rows = ref<AuditRow[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const selected = ref<AuditRow | null>(null);
const showFilters = ref(false);
const meta = ref({ page: 1, totalPages: 1, total: 0 });
const auditUsers = ref<AuditUser[]>([]);
const filters = reactive({ userId: "", controller: "", action: "", dateFrom: "", dateTo: "" });

function params(page = meta.value.page) {
  return Object.fromEntries(Object.entries({ ...filters, page, limit: 25 }).filter(([, value]) => value !== ""));
}

async function load(page = 1) {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await http.get("/logs", { params: params(page) });
    rows.value = response.data.data;
    meta.value = response.data.meta;
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message ?? "No se pudo cargar la bitacora";
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  try {
    const response = await http.get("/logs/users");
    auditUsers.value = response.data.data;
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message ?? "No se pudieron cargar los usuarios de bitacora";
  }
}

async function exportCsv() {
  try {
    const response = await http.get("/logs/export", { params: params(), responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bitacora-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message ?? "No se pudo exportar la bitacora";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "Sin datos";
}

onMounted(async () => {
  await loadUsers();
  await load();
});
</script>

<template>
  <AdminLayout title="Bitacora">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <AppBadge>Solo lectura</AppBadge>
        <h1 class="page-title mt-3">Bitacora del sistema</h1>
        <p class="page-subtitle">Trazabilidad completa de accesos y operaciones.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <AppButton class="md:hidden" variant="outline" @click="showFilters = !showFilters"><SlidersHorizontal class="h-4 w-4" />Filtros</AppButton>
        <AppButton v-if="can('logs.export')" variant="outline" @click="exportCsv"><Download class="h-4 w-4" />Exportar</AppButton>
        <AppButton variant="outline" :disabled="loading" @click="load(meta.page)"><RefreshCw class="h-4 w-4" />Actualizar</AppButton>
      </div>
    </div>

    <div class="mb-4 gap-3 border-y border-border bg-surface py-4 md:grid md:grid-cols-3 xl:grid-cols-6" :class="showFilters ? 'grid' : 'hidden'">
      <label class="text-sm font-medium text-fg">Usuario<select v-model="filters.userId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3"><option value="">Todos</option><option v-for="user in auditUsers" :key="user.id" :value="String(user.id)">{{ user.username }} - {{ user.email }}</option></select></label>
      <label class="text-sm font-medium text-fg">Modulo<input v-model="filters.controller" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3" placeholder="users, companies..." /></label>
      <label class="text-sm font-medium text-fg">Accion<select v-model="filters.action" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3"><option value="">Todas</option><option v-for="action in ['CREATE','UPDATE','DELETE','ACTIVATE','DEACTIVATE','LOGIN','LOGIN_FAILED','CHANGE_PASSWORD','ASSIGN_ROLES','ASSIGN_PERMISSIONS']" :key="action">{{ action }}</option></select></label>
      <label class="text-sm font-medium text-fg">Desde<input v-model="filters.dateFrom" type="date" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3" /></label>
      <label class="text-sm font-medium text-fg">Hasta<input v-model="filters.dateTo" type="date" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3" /></label>
      <div class="flex items-end"><AppButton class="w-full" @click="load(1); showFilters = false"><Search class="h-4 w-4" />Filtrar</AppButton></div>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>

    <div class="overflow-hidden rounded-lg border border-border bg-surface">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border bg-surface-secondary text-xs uppercase text-muted-fg"><tr><th class="px-4 py-3">Fecha</th><th class="px-4 py-3">Usuario</th><th class="px-4 py-3">Modulo</th><th class="px-4 py-3">Accion</th><th class="px-4 py-3">Registro</th><th class="w-16 px-4 py-3"></th></tr></thead>
          <tbody class="divide-y divide-border">
            <tr v-for="row in rows" :key="row.id" class="hover:bg-surface-secondary/60"><td class="whitespace-nowrap px-4 py-3 text-muted-fg">{{ formatDate(row.createdAt) }}</td><td class="px-4 py-3"><p class="font-medium text-fg">{{ row.user?.username ?? 'Sistema' }}</p><p class="text-xs text-muted-fg">{{ row.user?.email }}</p></td><td class="px-4 py-3 font-medium text-fg">{{ row.controller }}</td><td class="px-4 py-3"><AppBadge>{{ row.action }}</AppBadge></td><td class="px-4 py-3 text-muted-fg">#{{ row.recordId }}</td><td class="px-4 py-3"><button v-if="can('logs.detail')" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Ver detalle" @click="selected = row"><Eye class="h-4 w-4" /></button></td></tr>
            <tr v-if="!loading && !rows.length"><td colspan="6" class="px-4 py-12 text-center text-muted-fg">No hay eventos para los filtros seleccionados.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-fg"><span>{{ meta.total }} eventos</span><div class="flex items-center gap-2"><AppButton variant="outline" :disabled="meta.page <= 1" @click="load(meta.page - 1)">Anterior</AppButton><span>{{ meta.page }} / {{ Math.max(meta.totalPages, 1) }}</span><AppButton variant="outline" :disabled="meta.page >= meta.totalPages" @click="load(meta.page + 1)">Siguiente</AppButton></div></div>
    </div>

    <div v-if="selected" class="fixed inset-0 z-50 flex justify-end bg-black/35" @click.self="selected = null">
      <aside class="h-full w-full max-w-2xl overflow-y-auto bg-surface p-6 shadow-xl">
        <div class="flex items-start justify-between"><div><AppBadge>{{ selected.action }}</AppBadge><h2 class="mt-3 text-xl font-semibold text-fg">{{ selected.controller }} #{{ selected.recordId }}</h2><p class="text-sm text-muted-fg">{{ formatDate(selected.createdAt) }} por {{ selected.user?.username ?? 'Sistema' }}</p></div><button class="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-secondary" title="Cerrar" @click="selected = null"><X class="h-5 w-5" /></button></div>
        <div class="mt-6 grid gap-4"><section><h3 class="mb-2 text-sm font-semibold text-fg">Informacion anterior</h3><pre class="max-h-72 overflow-auto rounded-lg border border-border bg-surface-secondary p-4 text-xs text-fg">{{ pretty(selected.originalData) }}</pre></section><section><h3 class="mb-2 text-sm font-semibold text-fg">Informacion modificada</h3><pre class="max-h-72 overflow-auto rounded-lg border border-border bg-surface-secondary p-4 text-xs text-fg">{{ pretty(selected.modifiedData) }}</pre></section></div>
      </aside>
    </div>
  </AdminLayout>
</template>
