<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Copy, Edit2, Plus, Power, RefreshCw, Save, Search, ShieldCheck, Trash2, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AdministrationNav from "../components/admin/AdministrationNav.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";
import { useAuthStore } from "../stores/auth.store";
import { getApiErrorMessage } from "../utils/api-error";

type Permission = { id: number; action: string; name: string; module?: { id: number; name: string } };
type Role = {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
  permissions?: Permission[];
};

const router = useRouter();
const authStore = useAuthStore();
const { can } = usePermissions();
const loading = ref(false);
const saving = ref(false);
const editorOpen = ref(false);
const editingId = ref<number | null>(null);
const editingRole = ref<Role | null>(null);
const initialPermissionIds = ref<number[]>([]);
const errorMessage = ref("");
const successMessage = ref("");
const search = ref("");
const roles = ref<Role[]>([]);
const permissions = ref<Permission[]>([]);
const formErrors = ref<Record<string, string>>({});
const form = reactive({ name: "", description: "", permissionIds: [] as number[] });

const canCreateRoles = computed(() => can("roles.create") && can("roles.assign_permissions") && can("permissions.view"));
const canEditRoles = computed(() => can("roles.update") && can("roles.assign_permissions") && can("permissions.view"));
const filteredRoles = computed(() => {
  const term = search.value.trim().toLowerCase();
  return term ? roles.value.filter((role) => `${role.name} ${role.description ?? ""}`.toLowerCase().includes(term)) : roles.value;
});
const permissionGroups = computed(() => {
  const grouped = new Map<string, Permission[]>();
  for (const permission of permissions.value) {
    const moduleName = permission.module?.name ?? "General";
    grouped.set(moduleName, [...(grouped.get(moduleName) ?? []), permission]);
  }
  return Array.from(grouped, ([name, items]) => ({ name, items }));
});

watch(() => form.name, () => delete formErrors.value.name);
watch(() => form.permissionIds, () => delete formErrors.value.permissionIds, { deep: true });

function resetForm() {
  editingId.value = null;
  editingRole.value = null;
  initialPermissionIds.value = [];
  formErrors.value = {};
  Object.assign(form, { name: "", description: "", permissionIds: [] });
}

function openCreate() {
  if (!canCreateRoles.value) return;
  resetForm();
  errorMessage.value = "";
  successMessage.value = "";
  editorOpen.value = true;
}

function resetEditor() {
  editorOpen.value = false;
  resetForm();
}

function closeEditor() {
  if (saving.value) return;
  resetEditor();
}

function togglePermission(permissionId: number, checked: boolean) {
  form.permissionIds = checked
    ? Array.from(new Set([...form.permissionIds, permissionId]))
    : form.permissionIds.filter((id) => id !== permissionId);
}

function toggleGroup(group: Permission[], checked: boolean) {
  const ids = group.map((permission) => permission.id);
  form.permissionIds = checked
    ? Array.from(new Set([...form.permissionIds, ...ids]))
    : form.permissionIds.filter((id) => !ids.includes(id));
}

function groupSelected(group: Permission[]) {
  return group.length > 0 && group.every((permission) => form.permissionIds.includes(permission.id));
}

function groupPartiallySelected(group: Permission[]) {
  return !groupSelected(group) && group.some((permission) => form.permissionIds.includes(permission.id));
}

function sameIds(left: number[], right: number[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function validateForm() {
  const errors: Record<string, string> = {};
  const name = form.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 50) errors.name = "El nombre debe tener entre 2 y 50 caracteres";
  formErrors.value = errors;
  return Object.keys(errors).length === 0;
}

function affectsCurrentAccess(role: Role) {
  return authStore.user?.roles.includes(role.name) ?? false;
}

async function loadAll() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [rolesRes, permissionsRes] = await Promise.all([
      http.get("/roles"),
      can("permissions.view") ? http.get("/permissions") : Promise.resolve(null),
    ]);
    roles.value = rolesRes.data.data;
    permissions.value = permissionsRes?.data.data ?? [];
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "No se pudieron cargar los roles");
  } finally {
    loading.value = false;
  }
}

async function editRole(role: Role) {
  if (role.isSystem || !canEditRoles.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await http.get(`/roles/${role.id}`);
    const detailed = response.data.data as Role;
    editingId.value = role.id;
    editingRole.value = detailed;
    initialPermissionIds.value = (detailed.permissions ?? []).map((permission) => permission.id).sort((a, b) => a - b);
    Object.assign(form, {
      name: detailed.name,
      description: detailed.description ?? "",
      permissionIds: [...initialPermissionIds.value],
    });
    editorOpen.value = true;
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "No se pudo abrir el rol");
  } finally {
    loading.value = false;
  }
}

async function submitRole() {
  if (editingId.value ? !canEditRoles.value : !canCreateRoles.value) return;
  if (!validateForm()) return;
  saving.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  const roleBeforeUpdate = editingRole.value;
  const permissionIds = [...form.permissionIds].sort((a, b) => a - b);
  const permissionsChanged = roleBeforeUpdate ? !sameIds(permissionIds, initialPermissionIds.value) : false;

  try {
    const payload = {
      name: form.name.trim().replace(/\s+/g, " "),
      description: form.description.trim(),
      permissionIds,
    };
    if (editingId.value) {
      await http.patch(`/roles/${editingId.value}`, payload);
    } else {
      await http.post("/roles", payload);
    }
    const isOwnAccessChange = Boolean(roleBeforeUpdate && permissionsChanged && affectsCurrentAccess(roleBeforeUpdate));
    successMessage.value = roleBeforeUpdate ? "Rol actualizado correctamente" : "Rol creado correctamente";
    resetEditor();
    if (isOwnAccessChange) {
      authStore.forceLogout();
      await router.replace("/login");
      return;
    }
    await loadAll();
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "No se pudo guardar el rol");
  } finally {
    saving.value = false;
  }
}

async function duplicateRole(role: Role) {
  if (role.isSystem || !role.isActive || !canCreateRoles.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.post(`/roles/${role.id}/duplicate`, {});
    successMessage.value = `Se creó una copia de ${role.name}`;
    await loadAll();
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "No se pudo duplicar el rol");
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(role: Role) {
  if (role.isSystem || !can("roles.update")) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.patch(`/roles/${role.id}/status`, { isActive: !role.isActive });
    const ownAccessChanged = affectsCurrentAccess(role);
    successMessage.value = role.isActive ? "Rol desactivado" : "Rol activado";
    if (ownAccessChanged) {
      authStore.forceLogout();
      await router.replace("/login");
      return;
    }
    await loadAll();
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "No se pudo actualizar el estado");
  } finally {
    saving.value = false;
  }
}

async function removeRole(role: Role) {
  if (role.isSystem || !can("roles.delete")) return;
  if (!window.confirm(`Eliminar el rol ${role.name}? Podrá recuperarse desde Administración / Configuración / Papelera durante 30 días.`)) return;

  saving.value = true;
  errorMessage.value = "";
  try {
    await http.delete(`/roles/${role.id}`);
    successMessage.value = "Rol eliminado correctamente";
    await loadAll();
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "No se pudo eliminar el rol");
  } finally {
    saving.value = false;
  }
}

onMounted(loadAll);
</script>

<template>
  <AdminLayout title="Configuración · Roles">
    <AdministrationNav section="roles" />
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="page-title">Roles</h1>
        <p class="page-subtitle">Define responsabilidades y asigna únicamente los accesos necesarios.</p>
      </div>
      <div class="flex gap-2">
        <AppButton variant="outline" :disabled="loading" title="Actualizar" @click="loadAll">
          <RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" />
          <span class="hidden sm:inline">Actualizar</span>
        </AppButton>
        <AppButton v-if="canCreateRoles" @click="openCreate"><Plus class="h-4 w-4" />Nuevo rol</AppButton>
      </div>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <section class="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
      <div class="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative w-full sm:max-w-sm">
          <Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" />
          <input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" placeholder="Buscar por rol o descripción" />
        </div>
        <AppBadge>{{ filteredRoles.length }} roles</AppBadge>
      </div>

      <div class="hidden overflow-x-auto md:block">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="border-b border-border bg-surface-secondary/70 text-xs uppercase text-muted-fg">
            <tr><th class="px-4 py-3">Rol</th><th class="px-4 py-3">Permisos</th><th class="px-4 py-3">Usuarios</th><th class="px-4 py-3">Estado</th><th class="px-4 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="role in filteredRoles" :key="role.id" class="hover:bg-surface-secondary/50">
              <td class="px-4 py-3"><div class="flex items-center gap-3"><div class="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent"><ShieldCheck class="h-4 w-4" /></div><div><p class="font-medium text-fg">{{ role.name }}</p><p class="max-w-md truncate text-xs text-muted-fg">{{ role.description || "Sin descripción" }}</p></div></div></td>
              <td class="px-4 py-3 text-muted-fg">{{ role.permissionCount }}</td>
              <td class="px-4 py-3 text-muted-fg">{{ role.userCount }}</td>
              <td class="px-4 py-3"><div class="flex gap-1.5"><AppBadge :variant="role.isActive ? 'success' : 'neutral'">{{ role.isActive ? "Activo" : "Inactivo" }}</AppBadge><AppBadge v-if="role.isSystem">Sistema</AppBadge></div></td>
              <td class="px-4 py-3"><div class="flex justify-end gap-1">
                <button v-if="canCreateRoles" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg disabled:cursor-not-allowed disabled:opacity-30" :disabled="saving || role.isSystem || !role.isActive" :title="role.isSystem ? 'Los roles del sistema no se duplican' : role.isActive ? 'Duplicar rol' : 'Activa el rol antes de duplicarlo'" @click="duplicateRole(role)"><Copy class="h-4 w-4" /></button>
                <button v-if="canEditRoles" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg disabled:cursor-not-allowed disabled:opacity-30" title="Editar rol" :disabled="saving || role.isSystem" @click="editRole(role)"><Edit2 class="h-4 w-4" /></button>
                <button v-if="can('roles.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg disabled:cursor-not-allowed disabled:opacity-30" :title="role.isActive ? 'Desactivar rol' : 'Activar rol'" :disabled="saving || role.isSystem" @click="toggleStatus(role)"><Power class="h-4 w-4" /></button>
                <button v-if="can('roles.delete')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-30" :disabled="saving || role.isSystem" title="Enviar rol a papelera" @click="removeRole(role)"><Trash2 class="h-4 w-4" /></button>
              </div></td>
            </tr>
            <tr v-if="!loading && !filteredRoles.length"><td colspan="5" class="px-4 py-12 text-center text-muted-fg">No hay roles para esta búsqueda.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-border md:hidden">
        <article v-for="role in filteredRoles" :key="role.id" class="p-4">
          <div class="flex items-start gap-3"><div class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><ShieldCheck class="h-5 w-5" /></div><div class="min-w-0 flex-1"><p class="font-medium text-fg">{{ role.name }}</p><p class="truncate text-sm text-muted-fg">{{ role.description || "Sin descripción" }}</p><p class="mt-1 text-xs text-muted-fg">{{ role.userCount }} usuarios / {{ role.permissionCount }} permisos</p></div><AppBadge :variant="role.isActive ? 'success' : 'neutral'">{{ role.isActive ? "Activo" : "Inactivo" }}</AppBadge></div>
          <div class="mt-3 flex justify-end gap-1 border-t border-border pt-3">
            <button v-if="canCreateRoles" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary disabled:opacity-30" :disabled="saving || role.isSystem || !role.isActive" title="Duplicar rol" @click="duplicateRole(role)"><Copy class="h-4 w-4" /></button>
            <AppButton v-if="canEditRoles" size="sm" variant="ghost" :disabled="saving || role.isSystem" @click="editRole(role)"><Edit2 class="h-4 w-4" />Editar</AppButton>
            <button v-if="can('roles.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary disabled:opacity-30" :disabled="saving || role.isSystem" :title="role.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(role)"><Power class="h-4 w-4" /></button>
            <button v-if="can('roles.delete')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10 disabled:opacity-30" :disabled="saving || role.isSystem" title="Eliminar rol" @click="removeRole(role)"><Trash2 class="h-4 w-4" /></button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor">
      <aside class="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl">
        <header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6"><div><p class="text-sm font-medium text-accent">{{ editingId ? "Configuración de acceso" : "Nuevo perfil" }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ editingId ? form.name : "Crear rol" }}</h2><p class="mt-1 text-sm text-muted-fg">Los permisos se guardan junto con el rol.</p></div><button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" :disabled="saving" @click="closeEditor"><X class="h-5 w-5" /></button></header>
        <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="submitRole">
          <div class="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.name" label="Nombre del rol" required :minlength="2" :maxlength="50" :error="formErrors.name" /><AppInput v-model="form.description" label="Descripción" :maxlength="255" /></div>
            <section><div class="mb-3 flex items-center justify-between"><div><h3 class="text-sm font-semibold text-fg">Permisos</h3><p class="mt-0.5 text-xs text-muted-fg">Selecciona las acciones que este rol podrá realizar.</p></div><span class="text-xs text-muted-fg">{{ form.permissionIds.length }} seleccionados</span></div>
              <div class="space-y-3"><div v-for="group in permissionGroups" :key="group.name" class="rounded-lg border border-border"><label class="flex cursor-pointer items-center gap-3 border-b border-border bg-surface-secondary/60 px-3 py-2.5"><input type="checkbox" class="h-4 w-4 accent-accent" :checked="groupSelected(group.items)" :indeterminate="groupPartiallySelected(group.items)" @change="toggleGroup(group.items, ($event.target as HTMLInputElement).checked)" /><span class="text-sm font-semibold text-fg">{{ group.name }}</span><span class="ml-auto text-xs text-muted-fg">{{ group.items.length }}</span></label><div class="grid gap-1 p-2 sm:grid-cols-2"><label v-for="permission in group.items" :key="permission.id" class="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-surface-secondary"><input type="checkbox" class="mt-0.5 h-4 w-4 accent-accent" :checked="form.permissionIds.includes(permission.id)" @change="togglePermission(permission.id, ($event.target as HTMLInputElement).checked)" /><span><span class="block text-sm font-medium text-fg">{{ permission.name }}</span><span class="block text-xs text-muted-fg">{{ permission.action }}</span></span></label></div></div></div>
            </section>
          </div>
          <footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" :disabled="saving" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />{{ saving ? "Guardando..." : "Guardar rol" }}</AppButton></footer>
        </form>
      </aside>
    </div>
  </AdminLayout>
</template>
