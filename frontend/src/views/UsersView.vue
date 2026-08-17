<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Edit2, LockOpen, Plus, Power, RefreshCw, Save, Search, UserRound, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";

type Role = { id: number; name: string; description?: string; isActive: boolean };
type User = {
  id: number;
  username: string;
  email: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  employee: { id: number; code: string; fullName: string; email?: string; isActive: boolean };
  roles: Role[];
};

const { can } = usePermissions();
const loading = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const editorOpen = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const search = ref("");
const statusFilter = ref("all");
const users = ref<User[]>([]);
const roles = ref<Role[]>([]);

const form = reactive({
  employeeCode: "",
  employeeName: "",
  username: "",
  email: "",
  password: "Admin1234",
  roleIds: [] as number[],
});

const isEditing = computed(() => editingId.value !== null);
const filteredUsers = computed(() => {
  const term = search.value.trim().toLowerCase();
  return users.value.filter((user) => {
    const matchesSearch = !term || `${user.employee.fullName} ${user.employee.code} ${user.username} ${user.email}`.toLowerCase().includes(term);
    const matchesStatus = statusFilter.value === "all" || (statusFilter.value === "active" ? user.isActive : !user.isActive);
    return matchesSearch && matchesStatus;
  });
});

function apiMessage(error: any, fallback: string) {
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message[0] : message ?? fallback;
}

function resetForm() {
  editingId.value = null;
  Object.assign(form, {
    employeeCode: "",
    employeeName: "",
    username: "",
    email: "",
    password: "Admin1234",
    roleIds: roles.value[0] ? [roles.value[0].id] : [],
  });
}

function openCreate() {
  errorMessage.value = "";
  resetForm();
  editorOpen.value = true;
}

function editUser(user: User) {
  errorMessage.value = "";
  editingId.value = user.id;
  Object.assign(form, {
    employeeCode: user.employee.code,
    employeeName: user.employee.fullName,
    username: user.username,
    email: user.email,
    password: "",
    roleIds: user.roles.map((role) => role.id),
  });
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  resetForm();
}

function toggleRole(roleId: number, checked: boolean) {
  form.roleIds = checked
    ? Array.from(new Set([...form.roleIds, roleId]))
    : form.roleIds.filter((id) => id !== roleId);
}

function rowsOf(response: any): User[] {
  const data = response?.data?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function loadAll() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [usersRes, rolesRes] = await Promise.all([
      http.get("/users", { params: { limit: 100 } }),
      http.get("/roles"),
    ]);
    users.value = rowsOf(usersRes);
    roles.value = rolesRes.data.data;
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudieron cargar los usuarios");
  } finally {
    loading.value = false;
  }
}

async function submitUser() {
  if (!form.roleIds.length) {
    errorMessage.value = "Selecciona al menos un rol";
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    if (editingId.value) {
      await http.patch(`/users/${editingId.value}`, {
        employeeCode: form.employeeCode,
        employeeName: form.employeeName,
        username: form.username,
        email: form.email,
      });
      await http.put(`/users/${editingId.value}/roles`, { roleIds: form.roleIds });
      successMessage.value = "Usuario actualizado correctamente";
    } else {
      await http.post("/users", { ...form });
      successMessage.value = "Usuario creado correctamente";
    }
    closeEditor();
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo guardar el usuario");
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(user: User) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.patch(`/users/${user.id}/status`, { isActive: !user.isActive });
    successMessage.value = user.isActive ? "Usuario desactivado" : "Usuario activado";
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo actualizar el estado");
  } finally {
    saving.value = false;
  }
}

async function unlockUser(user: User) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.patch(`/users/${user.id}/unlock`);
    successMessage.value = "Usuario desbloqueado";
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo desbloquear el usuario");
  } finally {
    saving.value = false;
  }
}

onMounted(loadAll);
</script>

<template>
  <AdminLayout title="Usuarios">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="page-title">Usuarios</h1>
        <p class="page-subtitle">Personas con acceso al ERP y sus roles asignados.</p>
      </div>
      <div class="flex gap-2">
        <AppButton variant="outline" :disabled="loading" title="Actualizar" @click="loadAll">
          <RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" />
          <span class="hidden sm:inline">Actualizar</span>
        </AppButton>
        <AppButton v-if="can('users.create')" @click="openCreate">
          <Plus class="h-4 w-4" /> Nuevo usuario
        </AppButton>
      </div>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <section class="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
      <div class="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative w-full sm:max-w-sm">
          <Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" />
          <input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" placeholder="Buscar por nombre, codigo o correo" />
        </div>
        <div class="flex items-center gap-2">
          <select v-model="statusFilter" class="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-accent">
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <AppBadge>{{ filteredUsers.length }} usuarios</AppBadge>
        </div>
      </div>

      <div class="hidden overflow-x-auto md:block">
        <table class="w-full min-w-[840px] text-left text-sm">
          <thead class="border-b border-border bg-surface-secondary/70 text-xs uppercase text-muted-fg">
            <tr><th class="px-4 py-3">Persona</th><th class="px-4 py-3">Usuario</th><th class="px-4 py-3">Roles</th><th class="px-4 py-3">Estado</th><th class="px-4 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-surface-secondary/50">
              <td class="px-4 py-3"><p class="font-medium text-fg">{{ user.employee.fullName }}</p><p class="text-xs text-muted-fg">{{ user.employee.code }}</p></td>
              <td class="px-4 py-3"><p class="font-medium text-fg">{{ user.username }}</p><p class="text-xs text-muted-fg">{{ user.email }}</p></td>
              <td class="px-4 py-3 text-muted-fg">{{ user.roles.map((role) => role.name).join(", ") || "Sin roles" }}</td>
              <td class="px-4 py-3"><div class="flex flex-wrap gap-1.5"><AppBadge :variant="user.isActive ? 'success' : 'neutral'">{{ user.isActive ? "Activo" : "Inactivo" }}</AppBadge><AppBadge v-if="user.isLocked" variant="danger">Bloqueado</AppBadge></div></td>
              <td class="px-4 py-3"><div class="flex justify-end gap-1">
                <button v-if="can('users.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Editar usuario" @click="editUser(user)"><Edit2 class="h-4 w-4" /></button>
                <button v-if="user.isLocked && can('users.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Desbloquear usuario" @click="unlockUser(user)"><LockOpen class="h-4 w-4" /></button>
                <button v-if="can('users.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" :title="user.isActive ? 'Desactivar usuario' : 'Activar usuario'" @click="toggleStatus(user)"><Power class="h-4 w-4" /></button>
              </div></td>
            </tr>
            <tr v-if="!loading && !filteredUsers.length"><td colspan="5" class="px-4 py-12 text-center text-muted-fg">No hay usuarios para esta busqueda.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-border md:hidden">
        <article v-for="user in filteredUsers" :key="user.id" class="p-4">
          <div class="flex items-start gap-3">
            <div class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><UserRound class="h-5 w-5" /></div>
            <div class="min-w-0 flex-1"><p class="font-medium text-fg">{{ user.employee.fullName }}</p><p class="truncate text-sm text-muted-fg">{{ user.email }}</p><p class="mt-1 text-xs text-muted-fg">{{ user.employee.code }} / {{ user.roles.map((role) => role.name).join(", ") }}</p></div>
            <AppBadge :variant="user.isActive ? 'success' : 'neutral'">{{ user.isActive ? "Activo" : "Inactivo" }}</AppBadge>
          </div>
          <div class="mt-3 flex justify-end gap-2 border-t border-border pt-3">
            <AppButton v-if="user.isLocked && can('users.update')" size="sm" variant="outline" @click="unlockUser(user)"><LockOpen class="h-4 w-4" />Desbloquear</AppButton>
            <AppButton v-if="can('users.update')" size="sm" variant="ghost" @click="editUser(user)"><Edit2 class="h-4 w-4" />Editar</AppButton>
            <button v-if="can('users.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" :title="user.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(user)"><Power class="h-4 w-4" /></button>
          </div>
        </article>
        <p v-if="!loading && !filteredUsers.length" class="px-4 py-12 text-center text-sm text-muted-fg">No hay usuarios para esta busqueda.</p>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor">
      <aside class="flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl">
        <header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
          <div><p class="text-sm font-medium text-accent">{{ isEditing ? "Editar acceso" : "Nuevo acceso" }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ isEditing ? form.employeeName : "Registrar usuario" }}</h2><p class="mt-1 text-sm text-muted-fg">Datos de la persona y permisos de entrada.</p></div>
          <button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closeEditor"><X class="h-5 w-5" /></button>
        </header>
        <form class="scrollbar-thin flex min-h-0 flex-1 flex-col" @submit.prevent="submitUser">
          <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <section><h3 class="mb-3 text-sm font-semibold text-fg">Persona</h3><div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.employeeName" label="Nombre completo" required :minlength="3" /><AppInput v-model="form.employeeCode" label="Codigo de empleado" placeholder="EMP-001" required :minlength="2" /></div></section>
            <section><h3 class="mb-3 text-sm font-semibold text-fg">Credenciales</h3><div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.username" label="Nombre de usuario" required :minlength="3" /><AppInput v-model="form.email" label="Correo electronico" type="email" autocomplete="off" required /><AppInput v-if="!isEditing" v-model="form.password" class="sm:col-span-2" label="Contrasena inicial" type="password" autocomplete="new-password" required :minlength="8" /></div></section>
            <section><div class="mb-3 flex items-center justify-between"><h3 class="text-sm font-semibold text-fg">Roles</h3><span class="text-xs text-muted-fg">Selecciona al menos uno</span></div><div class="grid gap-2 sm:grid-cols-2"><label v-for="role in roles" :key="role.id" class="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition hover:bg-surface-secondary"><input type="checkbox" class="mt-0.5 h-4 w-4 accent-accent" :checked="form.roleIds.includes(role.id)" @change="toggleRole(role.id, ($event.target as HTMLInputElement).checked)" /><span><span class="block text-sm font-medium text-fg">{{ role.name }}</span><span class="mt-0.5 block text-xs text-muted-fg">{{ role.description || "Rol del sistema" }}</span></span></label></div></section>
          </div>
          <footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />{{ saving ? "Guardando..." : "Guardar usuario" }}</AppButton></footer>
        </form>
      </aside>
    </div>
  </AdminLayout>
</template>
