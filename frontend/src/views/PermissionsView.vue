<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Edit2, KeyRound, Plus, Power, RefreshCw, Save, Search, Trash2, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AdministrationNav from "../components/admin/AdministrationNav.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";

type ModuleRecord = { id: number; name: string; description?: string };
type Permission = { id: number; action: string; name: string; description?: string; isActive: boolean; isSystem: boolean; module?: ModuleRecord };

const { can } = usePermissions();
const loading = ref(false);
const saving = ref(false);
const editorOpen = ref(false);
const editingId = ref<number | null>(null);
const errorMessage = ref("");
const successMessage = ref("");
const search = ref("");
const moduleFilter = ref("");
const permissions = ref<Permission[]>([]);
const modules = ref<ModuleRecord[]>([]);
const form = reactive({ action: "", name: "", description: "", moduleId: "" });
const canCreatePermissions = computed(() => can("permissions.create") && can("modules.view"));
const canEditPermissions = computed(() => can("permissions.update") && can("modules.view"));

const filteredPermissions = computed(() => {
  const term = search.value.trim().toLowerCase();
  return permissions.value.filter((permission) => {
    const matchesSearch = !term || `${permission.name} ${permission.action} ${permission.description ?? ""}`.toLowerCase().includes(term);
    const matchesModule = !moduleFilter.value || String(permission.module?.id) === moduleFilter.value;
    return matchesSearch && matchesModule;
  });
});

function apiMessage(error: any, fallback: string) {
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message[0] : message ?? fallback;
}

function resetForm() {
  editingId.value = null;
  Object.assign(form, { action: "", name: "", description: "", moduleId: modules.value[0] ? String(modules.value[0].id) : "" });
}

function openCreate() {
  if (!canCreatePermissions.value) return;
  resetForm();
  editorOpen.value = true;
  errorMessage.value = "";
}

function editPermission(permission: Permission) {
  if (permission.isSystem || !canEditPermissions.value) return;
  editingId.value = permission.id;
  Object.assign(form, { action: permission.action, name: permission.name, description: permission.description ?? "", moduleId: permission.module ? String(permission.module.id) : "" });
  editorOpen.value = true;
  errorMessage.value = "";
}

function closeEditor() {
  editorOpen.value = false;
  resetForm();
}

async function loadAll() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [permissionsRes, modulesRes] = await Promise.all([
      http.get("/permissions"),
      can("modules.view") ? http.get("/modules") : Promise.resolve(null),
    ]);
    permissions.value = permissionsRes.data.data;
    if (modulesRes) {
      modules.value = modulesRes.data.data;
    } else {
      const modulesInPermissions = new Map<number, ModuleRecord>();
      for (const permission of permissions.value) {
        if (permission.module) modulesInPermissions.set(permission.module.id, permission.module);
      }
      modules.value = Array.from(modulesInPermissions.values()).sort((left, right) => left.name.localeCompare(right.name, "es"));
    }
    if (!form.moduleId && modules.value[0]) form.moduleId = String(modules.value[0].id);
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudieron cargar los permisos");
  } finally {
    loading.value = false;
  }
}

async function submitPermission() {
  if (editingId.value ? !canEditPermissions.value : !canCreatePermissions.value) return;
  saving.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const payload = { name: form.name, description: form.description, moduleId: Number(form.moduleId) };
    if (editingId.value) await http.patch(`/permissions/${editingId.value}`, payload);
    else await http.post("/permissions", { ...payload, action: form.action });
    successMessage.value = editingId.value ? "Permiso actualizado correctamente" : "Permiso creado correctamente";
    closeEditor();
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo guardar el permiso");
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(permission: Permission) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.patch(`/permissions/${permission.id}/status`, { isActive: !permission.isActive });
    successMessage.value = permission.isActive ? "Permiso desactivado" : "Permiso activado";
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo actualizar el estado");
  } finally {
    saving.value = false;
  }
}

async function removePermission(permission: Permission) {
  if (permission.isSystem) return;
  if (!window.confirm(`Eliminar el permiso ${permission.action}? Podrá recuperarse desde Administración / Configuración / Papelera durante 30 días.`)) return;

  saving.value = true;
  errorMessage.value = "";
  try {
    await http.delete(`/permissions/${permission.id}`);
    successMessage.value = "Permiso eliminado correctamente";
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo enviar el permiso a la papelera.");
  } finally {
    saving.value = false;
  }
}

onMounted(loadAll);
</script>

<template>
  <AdminLayout title="Configuración · Permisos">
    <AdministrationNav section="permissions" />
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 class="page-title">Permisos</h1><p class="page-subtitle">Catalogo de acciones disponibles, organizado por modulo.</p></div><div class="flex gap-2"><AppButton variant="outline" :disabled="loading" title="Actualizar" @click="loadAll"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton><AppButton v-if="canCreatePermissions" @click="openCreate"><Plus class="h-4 w-4" />Nuevo permiso</AppButton></div></div>
    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p><p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <section class="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
      <div class="flex flex-col gap-3 border-b border-border p-3 md:flex-row md:items-center md:justify-between"><div class="relative w-full md:max-w-sm"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" placeholder="Buscar por nombre o codigo" /></div><div class="flex items-center gap-2"><select v-model="moduleFilter" class="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none md:w-52"><option value="">Todos los modulos</option><option v-for="module in modules" :key="module.id" :value="String(module.id)">{{ module.name }}</option></select><AppBadge>{{ filteredPermissions.length }}</AppBadge></div></div>
      <div class="hidden overflow-x-auto md:block"><table class="w-full min-w-[760px] text-left text-sm"><thead class="border-b border-border bg-surface-secondary/70 text-xs uppercase text-muted-fg"><tr><th class="px-4 py-3">Permiso</th><th class="px-4 py-3">Modulo</th><th class="px-4 py-3">Estado</th><th class="px-4 py-3 text-right">Acciones</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="permission in filteredPermissions" :key="permission.id" class="hover:bg-surface-secondary/50"><td class="px-4 py-3"><div class="flex items-center gap-3"><div class="grid h-9 w-9 place-items-center rounded-lg bg-surface-secondary text-muted-fg"><KeyRound class="h-4 w-4" /></div><div><p class="font-medium text-fg">{{ permission.name }}</p><p class="font-mono text-xs text-muted-fg">{{ permission.action }}</p></div></div></td><td class="px-4 py-3 text-muted-fg">{{ permission.module?.name ?? "General" }}</td><td class="px-4 py-3"><div class="flex gap-1.5"><AppBadge :variant="permission.isActive ? 'success' : 'neutral'">{{ permission.isActive ? "Activo" : "Inactivo" }}</AppBadge><AppBadge v-if="permission.isSystem">Sistema</AppBadge></div></td><td class="px-4 py-3"><div class="flex justify-end gap-1"><button v-if="canEditPermissions" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary disabled:opacity-30" title="Editar" :disabled="permission.isSystem" @click="editPermission(permission)"><Edit2 class="h-4 w-4" /></button><button v-if="can('permissions.update')" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary disabled:opacity-30" :title="permission.isActive ? 'Desactivar' : 'Activar'" :disabled="permission.isSystem" @click="toggleStatus(permission)"><Power class="h-4 w-4" /></button><button v-if="can('permissions.delete')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-30" title="Eliminar permiso" :disabled="permission.isSystem" @click="removePermission(permission)"><Trash2 class="h-4 w-4" /></button></div></td></tr><tr v-if="!loading && !filteredPermissions.length"><td colspan="4" class="px-4 py-12 text-center text-muted-fg">No hay permisos para estos filtros.</td></tr></tbody></table></div>
      <div class="divide-y divide-border md:hidden"><article v-for="permission in filteredPermissions" :key="permission.id" class="p-4"><div class="flex items-start gap-3"><div class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted-fg"><KeyRound class="h-4 w-4" /></div><div class="min-w-0 flex-1"><p class="font-medium text-fg">{{ permission.name }}</p><p class="truncate font-mono text-xs text-muted-fg">{{ permission.action }}</p><p class="mt-1 text-xs text-muted-fg">{{ permission.module?.name ?? "General" }}</p></div><AppBadge :variant="permission.isActive ? 'success' : 'neutral'">{{ permission.isActive ? "Activo" : "Inactivo" }}</AppBadge></div><div v-if="can('permissions.update') || can('permissions.delete')" class="mt-3 flex justify-end gap-1 border-t border-border pt-3"><AppButton v-if="canEditPermissions" size="sm" variant="ghost" :disabled="permission.isSystem" @click="editPermission(permission)"><Edit2 class="h-4 w-4" />Editar</AppButton><button v-if="can('permissions.update')" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary disabled:opacity-30" :disabled="permission.isSystem" :title="permission.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(permission)"><Power class="h-4 w-4" /></button><button v-if="can('permissions.delete')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-30" title="Eliminar permiso" :disabled="permission.isSystem" @click="removePermission(permission)"><Trash2 class="h-4 w-4" /></button></div></article></div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor"><aside class="flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl"><header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6"><div><p class="text-sm font-medium text-accent">{{ editingId ? "Editar accion" : "Nueva accion" }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ editingId ? form.name : "Crear permiso" }}</h2><p class="mt-1 text-sm text-muted-fg">El codigo se usa para proteger funciones del ERP.</p></div><button class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closeEditor"><X class="h-5 w-5" /></button></header><form class="flex min-h-0 flex-1 flex-col" @submit.prevent="submitPermission"><div class="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6"><AppInput v-model="form.action" label="Codigo" placeholder="modulo.accion" :disabled="!!editingId" required /><AppInput v-model="form.name" label="Nombre visible" required /><label class="text-sm font-medium text-fg">Modulo<select v-model="form.moduleId" class="field-control" required><option v-for="module in modules" :key="module.id" :value="String(module.id)">{{ module.name }}</option></select></label><AppInput v-model="form.description" label="Descripcion" /></div><footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />{{ saving ? "Guardando..." : "Guardar permiso" }}</AppButton></footer></form></aside></div>
  </AdminLayout>
</template>
