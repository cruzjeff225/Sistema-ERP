<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Edit2, MapPin, Plus, Power, RefreshCw, Search, UserRound, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import NationalLocationFields from "../components/forms/NationalLocationFields.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";

type Country = { id: number; name: string; isoCode: string };
type Geography = {
  departments: Array<{
    id: number;
    name: string;
    municipalities: Array<{ id: number; name: string; districts: Array<{ id: number; name: string }> }>;
  }>;
};
type Customer = {
  id: number;
  name: string;
  document?: string | null;
  countryId: number;
  departmentId?: number | null;
  municipalityId?: number | null;
  districtId?: number | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  country: Country;
  department?: { id: number; name: string } | null;
  municipality?: { id: number; name: string } | null;
  district?: { id: number; name: string } | null;
  _count?: { quotations: number; sales: number };
};

const { can, canAny } = usePermissions();
const customers = ref<Customer[]>([]);
const countries = ref<Country[]>([]);
const geography = ref<Geography>({ departments: [] });
const selectedId = ref<number | null>(null);
const editingId = ref<number | null>(null);
const editorOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const search = ref("");
const errorMessage = ref("");
const successMessage = ref("");

const form = reactive({
  name: "",
  document: "",
  countryId: "",
  departmentId: "",
  municipalityId: "",
  districtId: "",
  phone: "",
  email: "",
  address: "",
});

const selected = computed(() => customers.value.find((customer) => customer.id === selectedId.value) ?? null);
const isEditing = computed(() => editingId.value !== null);
const isNational = computed(() => countries.value.find((country) => String(country.id) === form.countryId)?.isoCode === "SV");
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return term
    ? customers.value.filter((customer) => `${customer.name} ${customer.document ?? ""} ${customer.email ?? ""}`.toLowerCase().includes(term))
    : customers.value;
});

function apiMessage(error: any, fallback: string) {
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message[0] : message ?? fallback;
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

function resetForm() {
  editingId.value = null;
  Object.assign(form, {
    name: "",
    document: "",
    countryId: defaultCountryId(),
    departmentId: "",
    municipalityId: "",
    districtId: "",
    phone: "",
    email: "",
    address: "",
  });
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [customersResponse, countriesResponse, geographyResponse] = await Promise.all([
      http.get("/customers"),
      http.get("/catalogs/countries"),
      http.get("/catalogs/geography"),
    ]);
    customers.value = customersResponse.data.data;
    countries.value = countriesResponse.data.data;
    geography.value = geographyResponse.data.data;
    if (!selectedId.value && customers.value[0]) selectedId.value = customers.value[0].id;
    if (selectedId.value && !customers.value.some((customer) => customer.id === selectedId.value)) selectedId.value = null;
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudieron cargar los clientes");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  errorMessage.value = "";
  resetForm();
  editorOpen.value = true;
}

function openEdit() {
  if (!selected.value) return;
  errorMessage.value = "";
  editingId.value = selected.value.id;
  Object.assign(form, {
    name: selected.value.name,
    document: selected.value.document ?? "",
    countryId: String(selected.value.countryId),
    departmentId: selected.value.departmentId ? String(selected.value.departmentId) : "",
    municipalityId: selected.value.municipalityId ? String(selected.value.municipalityId) : "",
    districtId: selected.value.districtId ? String(selected.value.districtId) : "",
    phone: selected.value.phone ?? "",
    email: selected.value.email ?? "",
    address: selected.value.address ?? "",
  });
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  resetForm();
}

async function saveCustomer() {
  saving.value = true;
  errorMessage.value = "";
  try {
    const { countryId, departmentId, municipalityId, districtId, ...customerData } = form;
    const payload = {
      ...customerData,
      countryId: Number(countryId),
      ...(isNational.value
        ? { departmentId: Number(departmentId), municipalityId: Number(municipalityId), districtId: Number(districtId) }
        : {}),
    };
    const response = isEditing.value
      ? await http.patch(`/customers/${editingId.value}`, payload)
      : await http.post("/customers", payload);
    selectedId.value = response.data.data.id;
    successMessage.value = isEditing.value ? "Cliente actualizado correctamente" : "Cliente registrado correctamente";
    closeEditor();
    await load();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo guardar el cliente");
  } finally {
    saving.value = false;
  }
}

async function toggleStatus() {
  if (!selected.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.patch(`/customers/${selected.value.id}/status`, { isActive: !selected.value.isActive });
    successMessage.value = selected.value.isActive ? "Cliente desactivado" : "Cliente activado";
    await load();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo actualizar el estado");
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AdminLayout title="Clientes">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p class="text-sm font-medium text-accent">Comercial</p><h1 class="page-title mt-1">Clientes</h1><p class="page-subtitle">Directorio de clientes y su ubicacion de servicio.</p></div>
      <div class="flex gap-2"><AppButton variant="outline" :disabled="loading" title="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton><AppButton v-if="can('customers.create')" @click="openCreate"><Plus class="h-4 w-4" />Cliente</AppButton></div>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <div class="grid overflow-hidden rounded-lg border border-border bg-surface lg:min-h-[560px] lg:grid-cols-[320px_1fr]">
      <aside class="border-b border-border lg:border-b-0 lg:border-r"><div class="border-b border-border p-3"><div class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg" placeholder="Buscar cliente" /></div></div><div class="max-h-[300px] overflow-y-auto p-2 lg:max-h-[500px]"><button v-for="customer in filtered" :key="customer.id" type="button" class="mb-1 w-full rounded-lg px-3 py-3 text-left transition" :class="selectedId === customer.id ? 'bg-accent/10 text-fg' : 'hover:bg-surface-secondary'" @click="selectedId = customer.id"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><p class="truncate font-semibold">{{ customer.name }}</p><p class="mt-0.5 truncate text-xs text-muted-fg">{{ customer.document || customer.country.name }}</p></div><span class="mt-1 h-2 w-2 rounded-full" :class="customer.isActive ? 'bg-success' : 'bg-muted-fg'" /></div></button><p v-if="!filtered.length" class="px-3 py-10 text-center text-sm text-muted-fg">Sin clientes.</p></div></aside>

      <main v-if="selected" class="min-w-0"><header class="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5"><div class="flex min-w-0 gap-3"><div class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><UserRound class="h-5 w-5" /></div><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h2 class="truncate text-xl font-semibold text-fg">{{ selected.name }}</h2><AppBadge :variant="selected.isActive ? 'success' : 'neutral'">{{ selected.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></div><p class="mt-1 text-sm text-muted-fg">{{ selected.document || 'Sin documento' }} / {{ selected.country.name }}</p></div></div><div class="flex w-full flex-wrap gap-2 sm:w-auto"><AppButton v-if="can('customers.update')" variant="outline" @click="openEdit"><Edit2 class="h-4 w-4" />Editar</AppButton><AppButton v-if="canAny(['customers.activate', 'customers.deactivate'])" variant="outline" :disabled="saving" @click="toggleStatus"><Power class="h-4 w-4" />{{ selected.isActive ? 'Desactivar' : 'Activar' }}</AppButton></div></header><section class="grid gap-6 p-5 sm:grid-cols-2"><div><p class="text-xs font-semibold uppercase text-muted-fg">Contacto</p><p class="mt-2 text-sm text-fg">{{ selected.phone || 'Sin telefono' }}</p><p class="text-sm text-muted-fg">{{ selected.email || 'Sin correo' }}</p></div><div><p class="text-xs font-semibold uppercase text-muted-fg">Ubicacion</p><p class="mt-2 text-sm text-fg">{{ selected.address || 'Sin direccion registrada' }}</p><p v-if="selected.district" class="mt-1 inline-flex items-center gap-1 text-xs text-muted-fg"><MapPin class="h-3.5 w-3.5" />{{ selected.district.name }}, {{ selected.municipality?.name }}, {{ selected.department?.name }}</p></div><div><p class="text-xs font-semibold uppercase text-muted-fg">Documentos</p><p class="mt-2 text-sm text-fg">{{ selected._count?.quotations ?? 0 }} cotizaciones</p><p class="text-sm text-muted-fg">{{ selected._count?.sales ?? 0 }} ventas</p></div></section></main>
      <main v-else class="grid place-items-center p-10 text-center text-muted-fg"><div><UserRound class="mx-auto h-10 w-10" /><p class="mt-3 font-medium text-fg">Selecciona un cliente</p></div></main>
    </div>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor"><aside class="flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl"><header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6"><div><p class="text-sm font-medium text-accent">{{ isEditing ? 'Editar cliente' : 'Nuevo cliente' }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ isEditing ? form.name : 'Registrar cliente' }}</h2></div><button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closeEditor"><X class="h-5 w-5" /></button></header><form class="flex min-h-0 flex-1 flex-col" @submit.prevent="saveCustomer"><div class="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6"><section><h3 class="mb-3 text-sm font-semibold text-fg">Datos del cliente</h3><div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.name" label="Nombre o razon social" required /><AppInput v-model="form.document" label="Documento" /><AppInput v-model="form.phone" label="Telefono" /><AppInput v-model="form.email" type="email" label="Correo" /><AppInput v-model="form.address" class="sm:col-span-2" label="Direccion" /></div></section><section><h3 class="mb-3 text-sm font-semibold text-fg">Ubicacion</h3><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Pais<select v-model="form.countryId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" @change="clearLocationWhenForeign"><option v-for="country in countries" :key="country.id" :value="String(country.id)">{{ country.name }}</option></select></label><div v-if="!isNational" class="flex items-end pb-2 text-sm text-muted-fg">La ubicacion nacional se solicita solo para El Salvador.</div><NationalLocationFields v-if="isNational" :departments="geography.departments" :department-id="form.departmentId" :municipality-id="form.municipalityId" :district-id="form.districtId" @update:department-id="form.departmentId = $event" @update:municipality-id="form.municipalityId = $event" @update:district-id="form.districtId = $event" /></div></section></div><footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar cliente' }}</AppButton></footer></form></aside></div>
  </AdminLayout>
</template>
