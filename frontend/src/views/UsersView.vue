<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Edit2, KeyRound, LockOpen, Plus, Power, RefreshCw, Save, Search, UserRound, X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import AdminLayout from "../layouts/AdminLayout.vue";
import AdministrationNav from "../components/admin/AdministrationNav.vue";
import AppBadge from "../components/base/AppBadge.vue";
import TrashButton from "../components/admin/TrashButton.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import NationalLocationFields from "../components/forms/NationalLocationFields.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";
import { useAuthStore } from "../stores/auth.store";
import { getApiErrorMessage } from "../utils/api-error";

type Role = { id: number; name: string; description?: string; isActive: boolean };
type Country = { id: number; name: string; isoCode: string };
type Company = { id: number; name: string; commercialName: string };
type Geography = {
  departments: Array<{
    id: number;
    name: string;
    municipalities: Array<{ id: number; name: string; districts: Array<{ id: number; name: string }> }>;
  }>;
};
type User = {
  id: number;
  username: string;
  email: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  employee: {
    id: number;
    code: string;
    fullName: string;
    email?: string;
    isActive: boolean;
    countryId: number;
    departmentId?: number | null;
    municipalityId?: number | null;
    districtId?: number | null;
    country: Country;
    department?: { id: number; name: string } | null;
    municipality?: { id: number; name: string } | null;
    district?: { id: number; name: string } | null;
  };
  roles: Role[];
  companies: Company[];
};

const { can } = usePermissions();
const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const editorOpen = ref(false);
const passwordEditorOpen = ref(false);
const passwordUser = ref<User | null>(null);
const newPassword = ref("");
const confirmPassword = ref("");
const errorMessage = ref("");
const successMessage = ref("");
const formErrors = ref<Record<string, string>>({});
const passwordErrors = ref<Record<string, string>>({});
const search = ref("");
const statusFilter = ref("all");
const users = ref<User[]>([]);
const userMeta = ref({ page: 1, totalPages: 1, total: 0 });
const roles = ref<Role[]>([]);
const countries = ref<Country[]>([]);
const companies = ref<Company[]>([]);
const geography = ref<Geography>({ departments: [] });

const form = reactive({
  employeeCode: "",
  employeeName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  countryId: "",
  departmentId: "",
  municipalityId: "",
  districtId: "",
  roleIds: [] as number[],
  companyIds: [] as number[],
});

const isEditing = computed(() => editingId.value !== null);
const canCreateUsers = computed(() => can("users.create") && can("roles.view"));
const canEditUsers = computed(() => can("users.update") && can("roles.view"));
const isNational = computed(() => countries.value.find((country) => String(country.id) === form.countryId)?.isoCode === "SV");
const filteredUsers = computed(() => users.value);

function apiMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}

function resetForm() {
  editingId.value = null;
  Object.assign(form, {
    employeeCode: "",
    employeeName: "",
    username: "",
    email: "",
    password: "",
    countryId: defaultCountryId(),
    departmentId: "",
    municipalityId: "",
    districtId: "",
    roleIds: [],
    companyIds: companies.value.map(company => company.id),
  });
}

function defaultCountryId() {
  return String(countries.value.find((country) => country.isoCode === "SV")?.id ?? countries.value[0]?.id ?? "");
}

function clearLocationWhenForeign() {
  if (!isNational.value) {
    form.departmentId = "";
    form.municipalityId = "";
    form.districtId = "";
  }
}

function passwordStrength(value: string) {
  const checks = [
    value.length >= 12,
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9\s]/.test(value),
    !/\s/.test(value),
  ];
  const score = checks.filter(Boolean).length;
  return {
    score,
    label: score <= 2 ? "Débil" : score <= 4 ? "Aceptable" : score === 5 ? "Robusta" : "Muy robusta",
    className: score <= 2 ? "bg-danger" : score <= 4 ? "bg-warning" : "bg-success",
  };
}

function validatePassword(value: string, confirmation: string, identityValues: string[]) {
  const errors: Record<string, string> = {};
  if (value.length < 12) errors.password = "Usa al menos 12 caracteres";
  else if (value.length > 128) errors.password = "La contraseña no puede superar 128 caracteres";
  else if (/\s/.test(value) || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9\s]/.test(value)) {
    errors.password = "Incluye mayúscula, minúscula, número y símbolo, sin espacios";
  } else if (["password", "contraseña", "qwerty", "123456", "admin"].some((fragment) => value.toLocaleLowerCase().includes(fragment))) {
    errors.password = "Evita secuencias predecibles";
  } else if (identityValues.filter((item) => item.trim().length >= 3).some((item) => value.toLocaleLowerCase().includes(item.trim().toLocaleLowerCase()))) {
    errors.password = "No incluyas datos del usuario";
  }

  if (confirmation !== value) errors.confirmPassword = "Las contraseñas no coinciden";
  return errors;
}

function validateUserForm() {
  const errors: Record<string, string> = {};
  const employeeName = form.employeeName.trim();
  const employeeCode = form.employeeCode.trim().toLocaleUpperCase();
  const username = form.username.trim().toLocaleLowerCase();
  const email = form.email.trim().toLocaleLowerCase();

  if (employeeName.length < 3) errors.employeeName = "Escribe el nombre completo";
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(employeeCode)) errors.employeeCode = "Usa 2 a 40 caracteres: letras, números, punto, guion o barra";
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) errors.username = "Usa 3 a 50 caracteres: letras, números, punto, guion o guion bajo";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Ingresa un correo válido";
  if (!Number.isInteger(Number(form.countryId)) || Number(form.countryId) <= 0) errors.countryId = "Selecciona un país";
  if (isNational.value && (!Number.isInteger(Number(form.departmentId)) || !Number.isInteger(Number(form.municipalityId)) || !Number.isInteger(Number(form.districtId)))) {
    errors.location = "Completa departamento, municipio y distrito";
  }
  if (!form.roleIds.length) errors.roleIds = "Selecciona al menos un rol";
  if (!form.companyIds.length) errors.companyIds = "Selecciona al menos una empresa";

  if (!isEditing.value) {
    Object.assign(errors, validatePassword(form.password, form.confirmPassword, [username, email, employeeCode]));
  }

  formErrors.value = errors;
  if (Object.keys(errors).length) {
    errorMessage.value = "Revisa los campos marcados antes de guardar.";
    return false;
  }

  Object.assign(form, { employeeName, employeeCode, username, email });
  return true;
}

watch(form, () => {
  if (Object.keys(formErrors.value).length) formErrors.value = {};
}, { deep: true });

watch([newPassword, confirmPassword], () => {
  if (Object.keys(passwordErrors.value).length) passwordErrors.value = {};
});

function openCreate() {
  if (!canCreateUsers.value) return;
  errorMessage.value = "";
  resetForm();
  editorOpen.value = true;
}

function editUser(user: User) {
  if (!canEditUsers.value) return;
  errorMessage.value = "";
  editingId.value = user.id;
  Object.assign(form, {
    employeeCode: user.employee.code,
    employeeName: user.employee.fullName,
    username: user.username,
    email: user.email,
    password: "",
    confirmPassword: "",
    countryId: String(user.employee.countryId),
    departmentId: user.employee.departmentId ? String(user.employee.departmentId) : "",
    municipalityId: user.employee.municipalityId ? String(user.employee.municipalityId) : "",
    districtId: user.employee.districtId ? String(user.employee.districtId) : "",
    roleIds: user.roles.map((role) => role.id),
    companyIds: companies.value.map((company) => company.id),
  });
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  resetForm();
}

function openPasswordEditor(user: User) {
  passwordUser.value = user;
  newPassword.value = "";
  confirmPassword.value = "";
  passwordErrors.value = {};
  errorMessage.value = "";
  passwordEditorOpen.value = true;
}

function closePasswordEditor() {
  passwordEditorOpen.value = false;
  passwordUser.value = null;
  newPassword.value = "";
  confirmPassword.value = "";
  passwordErrors.value = {};
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

function userParams(page: number) {
  return {
    page,
    limit: 10,
    ...(search.value.trim() ? { search: search.value.trim() } : {}),
    ...(statusFilter.value === "all" ? {} : { isActive: statusFilter.value === "active" ? "true" : "false" }),
  };
}

async function loadAll(page = 1) {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [usersRes, rolesRes, countriesRes, geographyRes] = await Promise.all([
      http.get("/users", { params: userParams(page) }),
      can("roles.view") ? http.get("/roles") : Promise.resolve(null),
      http.get("/catalogs/countries"),
      http.get("/catalogs/geography"),
    ]);
    users.value = rowsOf(usersRes);
    userMeta.value = usersRes.data.meta;
    roles.value = rolesRes?.data.data ?? [];
    countries.value = countriesRes.data.data;
    geography.value = geographyRes.data.data;
    companies.value = authStore.user?.companies ?? [];
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudieron cargar los usuarios");
  } finally {
    loading.value = false;
  }
}

async function submitUser() {
  if (isEditing.value ? !canEditUsers.value : !canCreateUsers.value) return;
  if (!validateUserForm()) return;

  saving.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const location = {
      countryId: Number(form.countryId),
      ...(isNational.value
        ? {
            departmentId: Number(form.departmentId),
            municipalityId: Number(form.municipalityId),
            districtId: Number(form.districtId),
          }
        : {}),
    };
    const targetUserId = editingId.value;
    if (targetUserId) {
      await http.patch(`/users/${targetUserId}`, {
        employeeCode: form.employeeCode,
        employeeName: form.employeeName,
        username: form.username,
        email: form.email,
        companyIds: form.companyIds,
        roleIds: form.roleIds,
        ...location,
      });
      successMessage.value = "Usuario actualizado correctamente";
    } else {
      const { countryId, departmentId, municipalityId, districtId, confirmPassword: _confirmPassword, ...userData } = form;
      await http.post("/users", { ...userData, ...location, companyIds: form.companyIds });
      successMessage.value = "Usuario creado correctamente";
    }
    closeEditor();
    if (targetUserId && authStore.user?.id === targetUserId) {
      authStore.forceLogout();
      await router.replace("/login");
      return;
    }
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
    if (authStore.user?.id === user.id) {
      authStore.forceLogout();
      await router.replace("/login");
      return;
    }
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

async function changePassword() {
  if (!passwordUser.value) return;
  passwordErrors.value = validatePassword(
    newPassword.value,
    confirmPassword.value,
    [passwordUser.value.username, passwordUser.value.email, passwordUser.value.employee.code],
  );
  if (Object.keys(passwordErrors.value).length) {
    errorMessage.value = "Revisa los requisitos de la contraseña.";
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  try {
    const targetUserId = passwordUser.value.id;
    const username = passwordUser.value.username;
    await http.patch(`/users/${targetUserId}/password`, { newPassword: newPassword.value });
    successMessage.value = "Contraseña restablecida para " + username + ". Se cerraron sus sesiones activas.";
    closePasswordEditor();
    if (authStore.user?.id === targetUserId) {
      authStore.forceLogout();
      await router.replace("/login");
      return;
    }
    await loadAll(userMeta.value.page);
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo actualizar la contrasena");
  } finally {
    saving.value = false;
  }
}

onMounted(loadAll);
</script>

<template>
  <AdminLayout title="Configuración · Usuarios">
    <AdministrationNav section="users" />
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="page-title">Usuarios</h1>
        <p class="page-subtitle">Personas con acceso al ERP y sus roles asignados.</p>
      </div>
      <div class="flex gap-2">
        <AppButton variant="outline" :disabled="loading" title="Actualizar" @click="loadAll(userMeta.page)">
          <RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" />
          <span class="hidden sm:inline">Actualizar</span>
        </AppButton>
        <AppButton v-if="canCreateUsers" @click="openCreate">
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
            <input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-10 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" placeholder="Buscar por nombre, codigo o correo" @keyup.enter="loadAll(1)" />
            <button type="button" class="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Buscar usuarios" @click="loadAll(1)"><Search class="h-4 w-4" /></button>
          </div>
          <div class="flex items-center gap-2">
           <select v-model="statusFilter" class="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-accent" @change="loadAll(1)">
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
           <AppBadge>{{ userMeta.total }} usuarios</AppBadge>
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
                 <button v-if="canEditUsers" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Editar usuario" @click="editUser(user)"><Edit2 class="h-4 w-4" /></button>
                 <button v-if="can('users.change_password')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Restablecer contrasena" @click="openPasswordEditor(user)"><KeyRound class="h-4 w-4" /></button>
                 <button v-if="user.isLocked && can('users.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Desbloquear usuario" @click="unlockUser(user)"><LockOpen class="h-4 w-4" /></button>
                <button v-if="can('users.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" :title="user.isActive ? 'Desactivar usuario' : 'Activar usuario'" @click="toggleStatus(user)"><Power class="h-4 w-4" /></button><TrashButton compact entity="users" :record-id="user.id" :label="user.username" :disabled="saving" @deleted="loadAll" />
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
             <AppButton v-if="canEditUsers" size="sm" variant="ghost" @click="editUser(user)"><Edit2 class="h-4 w-4" />Editar</AppButton>
             <button v-if="can('users.change_password')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Restablecer contrasena" @click="openPasswordEditor(user)"><KeyRound class="h-4 w-4" /></button>
             <button v-if="can('users.update')" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" :title="user.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(user)"><Power class="h-4 w-4" /></button><TrashButton compact entity="users" :record-id="user.id" :label="user.username" :disabled="saving" @deleted="loadAll" />
          </div>
        </article>
        <p v-if="!loading && !filteredUsers.length" class="px-4 py-12 text-center text-sm text-muted-fg">No hay usuarios para esta busqueda.</p>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-fg"><span>{{ userMeta.total }} usuarios</span><div class="flex items-center gap-2"><AppButton variant="outline" :disabled="userMeta.page <= 1 || loading" @click="loadAll(userMeta.page - 1)">Anterior</AppButton><span>{{ userMeta.page }} / {{ Math.max(userMeta.totalPages, 1) }}</span><AppButton variant="outline" :disabled="userMeta.page >= userMeta.totalPages || loading" @click="loadAll(userMeta.page + 1)">Siguiente</AppButton></div></div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor">
      <aside class="flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl">
        <header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
          <div><p class="text-sm font-medium text-accent">{{ isEditing ? "Editar acceso" : "Nuevo acceso" }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ isEditing ? form.employeeName : "Registrar usuario" }}</h2><p class="mt-1 text-sm text-muted-fg">Datos de la persona y permisos de entrada.</p></div>
          <button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closeEditor"><X class="h-5 w-5" /></button>
        </header>
        <form class="scrollbar-thin flex min-h-0 flex-1 flex-col" novalidate @submit.prevent="submitUser">
          <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <section>
              <h3 class="mb-3 text-sm font-semibold text-fg">Persona</h3>
              <div class="grid gap-4 sm:grid-cols-2">
                <AppInput v-model="form.employeeName" label="Nombre completo" :error="formErrors.employeeName" required :minlength="3" :maxlength="150" />
                <AppInput v-model="form.employeeCode" label="Código de empleado" :error="formErrors.employeeCode" placeholder="EMP-001" required :minlength="2" :maxlength="40" />
              </div>
            </section>

            <section>
              <h3 class="mb-3 text-sm font-semibold text-fg">Credenciales</h3>
              <div class="grid gap-4 sm:grid-cols-2">
                <AppInput v-model="form.username" label="Nombre de usuario" :error="formErrors.username" required :minlength="3" :maxlength="50" />
                <AppInput v-model="form.email" label="Correo electrónico" :error="formErrors.email" type="email" autocomplete="off" required :maxlength="254" />
                <template v-if="!isEditing">
                  <div class="sm:col-span-2">
                    <AppInput v-model="form.password" label="Contraseña inicial" :error="formErrors.password" hint="12 o más caracteres, con mayúscula, minúscula, número y símbolo." type="password" autocomplete="new-password" reveal-password required :minlength="12" :maxlength="128" />
                    <div class="mt-2 flex items-center gap-2 text-xs text-muted-fg">
                      <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary"><span class="block h-full transition-all" :class="passwordStrength(form.password).className" :style="{ width: (Math.max(passwordStrength(form.password).score, 1) * 16.66) + '%' }" /></span>
                      <span>{{ passwordStrength(form.password).label }}</span>
                    </div>
                  </div>
                  <AppInput v-model="form.confirmPassword" class="sm:col-span-2" label="Confirmar contraseña" :error="formErrors.confirmPassword" type="password" autocomplete="new-password" reveal-password required :minlength="12" :maxlength="128" />
                </template>
              </div>
            </section>

            <section>
              <h3 class="mb-3 text-sm font-semibold text-fg">Ubicación</h3>
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="text-sm font-medium text-fg">
                  País
                  <select v-model="form.countryId" required class="mt-1.5 h-10 w-full rounded-lg border bg-surface px-3 text-sm text-fg outline-none transition focus:ring-4" :class="formErrors.countryId ? 'border-danger focus:border-danger focus:ring-danger/15' : 'border-border focus:border-accent focus:ring-accent/15'" @change="clearLocationWhenForeign">
                    <option value="" disabled>Selecciona un país</option>
                    <option v-for="country in countries" :key="country.id" :value="String(country.id)">{{ country.name }}</option>
                  </select>
                  <p v-if="formErrors.countryId" class="mt-1.5 text-xs font-normal text-danger">{{ formErrors.countryId }}</p>
                </label>
                <div v-if="!isNational" class="flex items-end pb-2 text-sm text-muted-fg">La ubicación nacional se solicita solo para El Salvador.</div>
                <NationalLocationFields v-if="isNational" :departments="geography.departments" :department-id="form.departmentId" :municipality-id="form.municipalityId" :district-id="form.districtId" @update:department-id="form.departmentId = $event" @update:municipality-id="form.municipalityId = $event" @update:district-id="form.districtId = $event" />
              </div>
              <p v-if="formErrors.location" class="mt-2 text-xs text-danger">{{ formErrors.location }}</p>
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between"><h3 class="text-sm font-semibold text-fg">Roles</h3><span class="text-xs text-muted-fg">Selecciona al menos uno</span></div>
              <div class="grid gap-2 sm:grid-cols-2">
                <label v-for="role in roles" :key="role.id" class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition hover:bg-surface-secondary" :class="formErrors.roleIds ? 'border-danger/60' : 'border-border'">
                  <input type="checkbox" class="mt-0.5 h-4 w-4 accent-accent" :checked="form.roleIds.includes(role.id)" @change="toggleRole(role.id, ($event.target as HTMLInputElement).checked)" />
                  <span><span class="block text-sm font-medium text-fg">{{ role.name }}</span><span class="mt-0.5 block text-xs text-muted-fg">{{ role.description || "Rol del sistema" }}</span></span>
                </label>
              </div>
              <p v-if="formErrors.roleIds" class="mt-2 text-xs text-danger">{{ formErrors.roleIds }}</p>
            </section>

          </div>
          <footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
            <AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton>
            <AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />{{ saving ? "Guardando..." : "Guardar usuario" }}</AppButton>
          </footer>
        </form>
      </aside>
    </div>

    <div v-if="passwordEditorOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4" @click.self="closePasswordEditor">
      <form class="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-2xl" novalidate @submit.prevent="changePassword">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-accent">Seguridad</p>
            <h2 class="mt-1 text-xl font-semibold text-fg">Restablecer contraseña</h2>
            <p class="mt-1 text-sm text-muted-fg">{{ passwordUser?.employee.fullName }} deberá iniciar sesión de nuevo.</p>
          </div>
          <button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closePasswordEditor"><X class="h-5 w-5" /></button>
        </div>
        <div class="mt-5 space-y-4">
          <div>
            <AppInput v-model="newPassword" label="Nueva contraseña" :error="passwordErrors.password" hint="12 o más caracteres, con mayúscula, minúscula, número y símbolo." type="password" autocomplete="new-password" reveal-password required :minlength="12" :maxlength="128" />
            <div class="mt-2 flex items-center gap-2 text-xs text-muted-fg">
              <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary"><span class="block h-full transition-all" :class="passwordStrength(newPassword).className" :style="{ width: (Math.max(passwordStrength(newPassword).score, 1) * 16.66) + '%' }" /></span>
              <span>{{ passwordStrength(newPassword).label }}</span>
            </div>
          </div>
          <AppInput v-model="confirmPassword" label="Confirmar nueva contraseña" :error="passwordErrors.confirmPassword" type="password" autocomplete="new-password" reveal-password required :minlength="12" :maxlength="128" />
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <AppButton variant="outline" type="button" @click="closePasswordEditor">Cancelar</AppButton>
          <AppButton type="submit" :disabled="saving"><KeyRound class="h-4 w-4" />{{ saving ? "Actualizando..." : "Restablecer contraseña" }}</AppButton>
        </div>
      </form>
    </div>
  </AdminLayout>
</template>
