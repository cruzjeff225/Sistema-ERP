<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Edit2,
  FolderTree,
  ImagePlus,
  MapPin,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Warehouse,
  X,
} from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { http } from "../services/http.service";
import { usePermissions } from "../composables/usePermissions";

type Level = "companies" | "branches" | "warehouses" | "locations" | "categories";
type AnyRecord = Record<string, any>;
type GeoForm = { departmentId: string; municipalityId: string; districtId: string };
type Catalogs = {
  departments: Array<{
    id: number;
    name: string;
    municipalities: Array<{
      id: number;
      name: string;
      departmentId: number;
      districts: Array<{ id: number; name: string; municipalityId: number }>;
    }>;
  }>;
};

const { can, canAny } = usePermissions();
const levels: Array<{ id: Level; label: string; singular: string; icon: any; permission: string }> = [
  { id: "companies", label: "Empresas", singular: "empresa", icon: Building2, permission: "companies" },
  { id: "branches", label: "Sucursales", singular: "sucursal", icon: FolderTree, permission: "branches" },
  { id: "warehouses", label: "Almacenes", singular: "almacen", icon: Warehouse, permission: "warehouses" },
  { id: "locations", label: "Espacios", singular: "espacio", icon: MapPin, permission: "locations" },
  { id: "categories", label: "Categorias", singular: "categoria", icon: CheckCircle2, permission: "warehouse_categories" },
];

const activeLevel = ref<Level>("companies");
const selectedCompanyId = ref<number | null>(null);
const selectedBranchId = ref<number | null>(null);
const selectedWarehouseId = ref<number | null>(null);
const loading = ref(false);
const saving = ref(false);
const editorOpen = ref(false);
const search = ref("");
const errorMessage = ref("");
const successMessage = ref("");
const catalogs = ref<Catalogs>({ departments: [] });
const companies = ref<AnyRecord[]>([]);
const branches = ref<AnyRecord[]>([]);
const categories = ref<AnyRecord[]>([]);
const warehouses = ref<AnyRecord[]>([]);
const locations = ref<AnyRecord[]>([]);
const editing = reactive<Record<Level, number | null>>({ companies: null, branches: null, warehouses: null, locations: null, categories: null });

const companyForm = reactive({
  name: "", commercialName: "", nit: "", nrc: "", commercialLine1: "", address: "",
  departmentId: "", municipalityId: "", districtId: "", phone: "", email: "", webSite: "", logo: "",
});
const branchForm = reactive({ companyId: "", name: "", address: "", departmentId: "", municipalityId: "", districtId: "", phone: "", email: "" });
const categoryForm = reactive({ name: "", description: "" });
const warehouseForm = reactive({ branchId: "", categoryId: "", name: "", description: "" });
const locationForm = reactive({ warehouseId: "", code: "", aisle: "", rack: "", level: "", position: "", capacity: "1", notes: "" });

const activeConfig = computed(() => levels.find((item) => item.id === activeLevel.value)!);
const selectedCompany = computed(() => companies.value.find((item) => item.id === selectedCompanyId.value) ?? null);
const selectedBranch = computed(() => branches.value.find((item) => item.id === selectedBranchId.value) ?? null);
const selectedWarehouse = computed(() => warehouses.value.find((item) => item.id === selectedWarehouseId.value) ?? null);
const visibleBranches = computed(() => selectedCompanyId.value ? branches.value.filter((item) => item.companyId === selectedCompanyId.value) : branches.value);
const visibleWarehouses = computed(() => selectedBranchId.value ? warehouses.value.filter((item) => item.branchId === selectedBranchId.value) : warehouses.value);
const visibleLocations = computed(() => selectedWarehouseId.value ? locations.value.filter((item) => item.warehouseId === selectedWarehouseId.value) : locations.value);

const activeRows = computed(() => {
  if (activeLevel.value === "companies") return companies.value;
  if (activeLevel.value === "branches") return visibleBranches.value;
  if (activeLevel.value === "warehouses") return visibleWarehouses.value;
  if (activeLevel.value === "locations") return visibleLocations.value;
  return categories.value;
});

const filteredRows = computed(() => {
  const term = search.value.trim().toLowerCase();
  return term ? activeRows.value.filter((item) => `${entityName(activeLevel.value, item)} ${entityDetail(activeLevel.value, item)}`.toLowerCase().includes(term)) : activeRows.value;
});

const contextItems = computed(() => {
  if (activeLevel.value === "companies" || activeLevel.value === "categories") return [];
  const items: Array<{ label: string; value: string }> = [];
  if (selectedCompany.value) items.push({ label: "Empresa", value: selectedCompany.value.commercialName || selectedCompany.value.name });
  if (["warehouses", "locations"].includes(activeLevel.value) && selectedBranch.value) items.push({ label: "Sucursal", value: selectedBranch.value.name });
  if (activeLevel.value === "locations" && selectedWarehouse.value) items.push({ label: "Almacen", value: selectedWarehouse.value.name });
  return items;
});

const companyMunicipalities = computed(() => municipalitiesFor(companyForm.departmentId));
const companyDistricts = computed(() => districtsFor(companyForm.municipalityId));
const branchMunicipalities = computed(() => municipalitiesFor(branchForm.departmentId));
const branchDistricts = computed(() => districtsFor(branchForm.municipalityId));

function apiMessage(error: any, fallback: string) {
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message[0] : message ?? fallback;
}

function levelCount(level: Level) {
  return level === "companies" ? companies.value.length
    : level === "branches" ? branches.value.length
      : level === "warehouses" ? warehouses.value.length
        : level === "locations" ? locations.value.length
          : categories.value.length;
}

function cleanObject(source: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== "" && value !== null && value !== undefined));
}

function municipalitiesFor(departmentId: string) {
  return catalogs.value.departments.find((item) => String(item.id) === departmentId)?.municipalities ?? [];
}

function districtsFor(municipalityId: string) {
  return catalogs.value.departments.flatMap((department) => department.municipalities).find((item) => String(item.id) === municipalityId)?.districts ?? [];
}

function applyDefaultGeography(form: GeoForm) {
  const department = catalogs.value.departments[0];
  const municipality = department?.municipalities[0];
  const district = municipality?.districts[0];
  form.departmentId = department ? String(department.id) : "";
  form.municipalityId = municipality ? String(municipality.id) : "";
  form.districtId = district ? String(district.id) : "";
}

function onDepartmentChange(form: GeoForm) {
  const municipality = municipalitiesFor(form.departmentId)[0];
  form.municipalityId = municipality ? String(municipality.id) : "";
  form.districtId = municipality?.districts[0] ? String(municipality.districts[0].id) : "";
}

function onMunicipalityChange(form: GeoForm) {
  const district = districtsFor(form.municipalityId)[0];
  form.districtId = district ? String(district.id) : "";
}

function entityName(level: Level, item: AnyRecord) {
  if (level === "companies") return item.commercialName || item.name;
  if (level === "locations") return item.code;
  return item.name;
}

function entityDetail(level: Level, item: AnyRecord) {
  if (level === "companies") return `${item.nit} / ${item.department?.name ?? "Sin ubicacion"}`;
  if (level === "branches") return `${item.company?.commercialName ?? "Empresa"} / ${item.department?.name ?? "Sin ubicacion"}`;
  if (level === "warehouses") return `${item.branch?.name ?? "Sucursal"} / ${item.category?.name ?? "Sin categoria"}`;
  if (level === "locations") return `${item.warehouse?.name ?? "Almacen"} / ${item.aisle}-${item.rack}-${item.level}-${item.position}`;
  return item.description || "Sin descripcion";
}

function setActive(level: Level) {
  activeLevel.value = level;
  search.value = "";
  errorMessage.value = "";
}

function selectCompany(item: AnyRecord) {
  selectedCompanyId.value = item.id;
  const branch = branches.value.find((row) => row.companyId === item.id);
  selectedBranchId.value = branch?.id ?? null;
  const warehouseItem = branch ? warehouses.value.find((row) => row.branchId === branch.id) : null;
  selectedWarehouseId.value = warehouseItem?.id ?? null;
  activeLevel.value = "branches";
  search.value = "";
}

function selectBranch(item: AnyRecord) {
  selectedCompanyId.value = item.companyId;
  selectedBranchId.value = item.id;
  selectedWarehouseId.value = warehouses.value.find((row) => row.branchId === item.id)?.id ?? null;
  activeLevel.value = "warehouses";
  search.value = "";
}

function selectWarehouse(item: AnyRecord) {
  selectedBranchId.value = item.branchId;
  selectedCompanyId.value = branches.value.find((row) => row.id === item.branchId)?.companyId ?? null;
  selectedWarehouseId.value = item.id;
  activeLevel.value = "locations";
  search.value = "";
}

function drillDown(item: AnyRecord) {
  if (activeLevel.value === "companies") selectCompany(item);
  else if (activeLevel.value === "branches") selectBranch(item);
  else if (activeLevel.value === "warehouses") selectWarehouse(item);
}

function resetForm(level = activeLevel.value) {
  editing[level] = null;
  if (level === "companies") {
    Object.assign(companyForm, { name: "", commercialName: "", nit: "", nrc: "", commercialLine1: "", address: "", phone: "", email: "", webSite: "", logo: "" });
    applyDefaultGeography(companyForm);
  } else if (level === "branches") {
    Object.assign(branchForm, { companyId: selectedCompanyId.value ? String(selectedCompanyId.value) : companies.value[0] ? String(companies.value[0].id) : "", name: "", address: "", phone: "", email: "" });
    applyDefaultGeography(branchForm);
  } else if (level === "warehouses") {
    Object.assign(warehouseForm, { branchId: selectedBranchId.value ? String(selectedBranchId.value) : branches.value[0] ? String(branches.value[0].id) : "", categoryId: categories.value[0] ? String(categories.value[0].id) : "", name: "", description: "" });
  } else if (level === "locations") {
    Object.assign(locationForm, { warehouseId: selectedWarehouseId.value ? String(selectedWarehouseId.value) : warehouses.value[0] ? String(warehouses.value[0].id) : "", code: "", aisle: "", rack: "", level: "", position: "", capacity: "1", notes: "" });
  } else {
    Object.assign(categoryForm, { name: "", description: "" });
  }
}

function openCreate() {
  resetForm();
  editorOpen.value = true;
  errorMessage.value = "";
}

function editItem(item: AnyRecord) {
  const level = activeLevel.value;
  editing[level] = item.id;
  if (level === "companies") Object.assign(companyForm, { name: item.name, commercialName: item.commercialName, nit: item.nit, nrc: item.nrc, commercialLine1: item.commercialLine1 ?? "", address: item.address, departmentId: String(item.departmentId), municipalityId: String(item.municipalityId), districtId: String(item.districtId), phone: item.phone ?? "", email: item.email ?? "", webSite: item.webSite ?? "", logo: item.logo ?? "" });
  else if (level === "branches") Object.assign(branchForm, { companyId: String(item.companyId), name: item.name, address: item.address, departmentId: String(item.departmentId), municipalityId: String(item.municipalityId), districtId: String(item.districtId), phone: item.phone ?? "", email: item.email ?? "" });
  else if (level === "warehouses") Object.assign(warehouseForm, { branchId: String(item.branchId), categoryId: String(item.categoryId), name: item.name, description: item.description ?? "" });
  else if (level === "locations") Object.assign(locationForm, { warehouseId: String(item.warehouseId), code: item.code, aisle: item.aisle, rack: item.rack, level: item.level, position: item.position, capacity: String(item.capacity), notes: item.notes ?? "" });
  else Object.assign(categoryForm, { name: item.name, description: item.description ?? "" });
  editorOpen.value = true;
  errorMessage.value = "";
}

function closeEditor() {
  editorOpen.value = false;
  resetForm();
}

function onLogoSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > 2_000_000) {
    errorMessage.value = "Selecciona una imagen PNG, JPEG o WEBP de hasta 2 MB";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { companyForm.logo = String(reader.result ?? ""); };
  reader.readAsDataURL(file);
}

async function loadAll() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [geo, companyRes, branchRes, categoryRes, warehouseRes, locationRes] = await Promise.all([
      http.get("/catalogs/geography"), http.get("/companies"), http.get("/branches"),
      http.get("/warehouse-categories"), http.get("/warehouses"), http.get("/locations"),
    ]);
    catalogs.value = geo.data.data;
    companies.value = companyRes.data.data;
    branches.value = branchRes.data.data;
    categories.value = categoryRes.data.data;
    warehouses.value = warehouseRes.data.data;
    locations.value = locationRes.data.data;
    if (!selectedCompanyId.value && companies.value[0]) selectedCompanyId.value = companies.value[0].id;
    if (!selectedBranchId.value && visibleBranches.value[0]) selectedBranchId.value = visibleBranches.value[0].id;
    if (!selectedWarehouseId.value && visibleWarehouses.value[0]) selectedWarehouseId.value = visibleWarehouses.value[0].id;
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo cargar la estructura organizacional");
  } finally {
    loading.value = false;
  }
}

async function saveActive() {
  const level = activeLevel.value;
  if (level === "companies") return saveEntity("/companies", { ...cleanObject(companyForm), departmentId: Number(companyForm.departmentId), municipalityId: Number(companyForm.municipalityId), districtId: Number(companyForm.districtId) });
  if (level === "branches") return saveEntity("/branches", { ...cleanObject(branchForm), companyId: Number(branchForm.companyId), departmentId: Number(branchForm.departmentId), municipalityId: Number(branchForm.municipalityId), districtId: Number(branchForm.districtId) });
  if (level === "warehouses") return saveEntity("/warehouses", { ...cleanObject(warehouseForm), branchId: Number(warehouseForm.branchId), categoryId: Number(warehouseForm.categoryId) });
  if (level === "locations") return saveEntity("/locations", { ...cleanObject(locationForm), warehouseId: Number(locationForm.warehouseId), capacity: Number(locationForm.capacity) });
  return saveEntity("/warehouse-categories", cleanObject(categoryForm));
}

async function saveEntity(endpoint: string, payload: Record<string, unknown>) {
  saving.value = true;
  errorMessage.value = "";
  try {
    const id = editing[activeLevel.value];
    if (id) await http.patch(`${endpoint}/${id}`, payload);
    else await http.post(endpoint, payload);
    successMessage.value = id ? "Registro actualizado correctamente" : "Registro creado correctamente";
    editorOpen.value = false;
    resetForm();
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo guardar el registro");
  } finally {
    saving.value = false;
  }
}

function endpointFor(level: Level) {
  return level === "companies" ? "/companies" : level === "branches" ? "/branches" : level === "warehouses" ? "/warehouses" : level === "locations" ? "/locations" : "/warehouse-categories";
}

async function toggleStatus(item: AnyRecord) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.patch(`${endpointFor(activeLevel.value)}/${item.id}/status`, { isActive: !item.isActive });
    successMessage.value = item.isActive ? "Registro desactivado" : "Registro activado";
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo actualizar el estado");
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadAll();
  resetForm("companies"); resetForm("branches"); resetForm("warehouses"); resetForm("locations"); resetForm("categories");
});
</script>

<template>
  <AdminLayout title="Organizacion">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 class="page-title">Organizacion</h1><p class="page-subtitle">Administra la estructura Empresa → Sucursal → Almacen → Espacio.</p></div>
      <div class="flex gap-2">
        <AppButton variant="outline" :disabled="loading" title="Actualizar" @click="loadAll"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton>
        <AppButton v-if="can(`${activeConfig.permission}.create`)" @click="openCreate"><Plus class="h-4 w-4" />Nueva {{ activeConfig.singular }}</AppButton>
      </div>
    </div>

    <div class="scrollbar-thin -mx-1 mb-4 overflow-x-auto px-1 pb-1">
      <div class="inline-flex min-w-full gap-1 rounded-lg border border-border bg-surface p-1 sm:min-w-0">
        <button v-for="level in levels" :key="level.id" type="button" class="flex min-w-max flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition" :class="activeLevel === level.id ? 'bg-accent-soft text-sidebar-active-fg' : 'text-muted-fg hover:bg-surface-secondary hover:text-fg'" @click="setActive(level.id)">
          <component :is="level.icon" class="h-4 w-4" /><span>{{ level.label }}</span><span class="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[11px]">{{ levelCount(level.id) }}</span>
        </button>
      </div>
    </div>

    <div v-if="contextItems.length" class="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
      <FolderTree class="h-4 w-4 text-accent" />
      <template v-for="(item, index) in contextItems" :key="item.label"><span class="text-muted-fg">{{ item.label }}</span><span class="font-medium text-fg">{{ item.value }}</span><ChevronRight v-if="index < contextItems.length - 1" class="h-4 w-4 text-muted-fg" /></template>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <section class="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
      <div class="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative w-full sm:max-w-sm"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" :placeholder="`Buscar ${activeConfig.label.toLowerCase()}`" /></div>
        <p class="text-sm text-muted-fg">{{ filteredRows.length }} {{ filteredRows.length === 1 ? "registro" : "registros" }}</p>
      </div>

      <div class="hidden overflow-x-auto md:block">
        <table class="w-full min-w-[720px] text-left text-sm">
          <thead class="border-b border-border bg-surface-secondary/70 text-xs uppercase text-muted-fg"><tr><th class="px-4 py-3">{{ activeConfig.singular }}</th><th class="px-4 py-3">Contexto</th><th class="px-4 py-3">Estado</th><th class="px-4 py-3 text-right">Acciones</th></tr></thead>
          <tbody class="divide-y divide-border">
            <tr v-for="item in filteredRows" :key="item.id" class="group hover:bg-surface-secondary/50">
              <td class="px-4 py-3"><button type="button" class="flex items-center gap-2 text-left font-medium text-fg" :class="['companies','branches','warehouses'].includes(activeLevel) && 'hover:text-accent'" @click="drillDown(item)">{{ entityName(activeLevel, item) }}<ChevronRight v-if="['companies','branches','warehouses'].includes(activeLevel)" class="h-4 w-4 opacity-0 transition group-hover:opacity-100" /></button></td>
              <td class="px-4 py-3 text-muted-fg">{{ entityDetail(activeLevel, item) }}</td>
              <td class="px-4 py-3"><AppBadge :variant="item.isActive ? 'success' : 'neutral'">{{ item.isActive ? "Activo" : "Inactivo" }}</AppBadge></td>
              <td class="px-4 py-3"><div class="flex justify-end gap-1"><button v-if="can(`${activeConfig.permission}.update`)" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Editar" @click="editItem(item)"><Edit2 class="h-4 w-4" /></button><button v-if="canAny([`${activeConfig.permission}.activate`, `${activeConfig.permission}.deactivate`])" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" :title="item.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(item)"><Power class="h-4 w-4" /></button></div></td>
            </tr>
            <tr v-if="!loading && !filteredRows.length"><td colspan="4" class="px-4 py-12 text-center text-muted-fg">No hay registros para esta seleccion.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-border md:hidden">
        <article v-for="item in filteredRows" :key="item.id" class="p-4"><div class="flex items-start justify-between gap-3"><button type="button" class="min-w-0 text-left" @click="drillDown(item)"><p class="truncate font-medium text-fg">{{ entityName(activeLevel, item) }}</p><p class="mt-1 text-xs leading-5 text-muted-fg">{{ entityDetail(activeLevel, item) }}</p></button><AppBadge :variant="item.isActive ? 'success' : 'neutral'">{{ item.isActive ? "Activo" : "Inactivo" }}</AppBadge></div><div class="mt-3 flex justify-end gap-2 border-t border-border pt-3"><AppButton v-if="can(`${activeConfig.permission}.update`)" size="sm" variant="ghost" @click="editItem(item)"><Edit2 class="h-4 w-4" />Editar</AppButton><button v-if="canAny([`${activeConfig.permission}.activate`, `${activeConfig.permission}.deactivate`])" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" :title="item.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(item)"><Power class="h-4 w-4" /></button></div></article>
        <p v-if="!loading && !filteredRows.length" class="px-4 py-12 text-center text-sm text-muted-fg">No hay registros para esta seleccion.</p>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor">
      <aside class="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl">
        <header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6"><div><p class="text-sm font-medium text-accent">{{ editing[activeLevel] ? "Editar" : "Nuevo registro" }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ editing[activeLevel] ? `Editar ${activeConfig.singular}` : `Nueva ${activeConfig.singular}` }}</h2><p class="mt-1 text-sm text-muted-fg">Completa los datos necesarios para continuar.</p></div><button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closeEditor"><X class="h-5 w-5" /></button></header>
        <form class="scrollbar-thin flex min-h-0 flex-1 flex-col" @submit.prevent="saveActive">
          <div class="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div v-if="activeLevel === 'companies'" class="grid gap-4 sm:grid-cols-2">
              <label class="sm:col-span-2"><span class="mb-1.5 block text-sm font-medium text-fg">Logo</span><span class="flex items-center gap-4 rounded-lg border border-dashed border-border p-3"><span class="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-secondary text-muted-fg"><img v-if="companyForm.logo" :src="companyForm.logo" alt="Vista previa del logo" class="h-full w-full object-contain" /><ImagePlus v-else class="h-5 w-5" /></span><span class="min-w-0"><span class="block text-sm font-medium text-fg">Seleccionar imagen</span><span class="block text-xs text-muted-fg">PNG, JPEG o WEBP, hasta 2 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" class="mt-2 block w-full text-xs text-muted-fg file:mr-3 file:rounded-md file:border-0 file:bg-surface-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-fg" @change="onLogoSelected" /></span></span></label>
              <AppInput v-model="companyForm.commercialName" label="Nombre comercial" required /><AppInput v-model="companyForm.name" label="Razon social" required /><AppInput v-model="companyForm.nit" label="NIT" required /><AppInput v-model="companyForm.nrc" label="NRC" required /><AppInput v-model="companyForm.commercialLine1" label="Giro" /><AppInput v-model="companyForm.phone" label="Telefono" /><AppInput v-model="companyForm.email" label="Correo" type="email" /><AppInput v-model="companyForm.webSite" label="Sitio web" /><AppInput v-model="companyForm.address" class="sm:col-span-2" label="Direccion" required />
              <label class="text-sm font-medium text-fg">Departamento<select v-model="companyForm.departmentId" class="field-control" required @change="onDepartmentChange(companyForm)"><option v-for="department in catalogs.departments" :key="department.id" :value="String(department.id)">{{ department.name }}</option></select></label>
              <label class="text-sm font-medium text-fg">Municipio<select v-model="companyForm.municipalityId" class="field-control" required @change="onMunicipalityChange(companyForm)"><option v-for="municipality in companyMunicipalities" :key="municipality.id" :value="String(municipality.id)">{{ municipality.name }}</option></select></label>
              <label class="text-sm font-medium text-fg">Distrito<select v-model="companyForm.districtId" class="field-control" required><option v-for="district in companyDistricts" :key="district.id" :value="String(district.id)">{{ district.name }}</option></select></label>
            </div>
            <div v-else-if="activeLevel === 'branches'" class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium text-fg">Empresa<select v-model="branchForm.companyId" class="field-control" required><option v-for="company in companies" :key="company.id" :value="String(company.id)">{{ company.commercialName }}</option></select></label><AppInput v-model="branchForm.name" label="Sucursal" required /><AppInput v-model="branchForm.phone" label="Telefono" /><AppInput v-model="branchForm.email" label="Correo" type="email" /><AppInput v-model="branchForm.address" class="sm:col-span-2" label="Direccion" required />
              <label class="text-sm font-medium text-fg">Departamento<select v-model="branchForm.departmentId" class="field-control" required @change="onDepartmentChange(branchForm)"><option v-for="department in catalogs.departments" :key="department.id" :value="String(department.id)">{{ department.name }}</option></select></label><label class="text-sm font-medium text-fg">Municipio<select v-model="branchForm.municipalityId" class="field-control" required @change="onMunicipalityChange(branchForm)"><option v-for="municipality in branchMunicipalities" :key="municipality.id" :value="String(municipality.id)">{{ municipality.name }}</option></select></label><label class="text-sm font-medium text-fg">Distrito<select v-model="branchForm.districtId" class="field-control" required><option v-for="district in branchDistricts" :key="district.id" :value="String(district.id)">{{ district.name }}</option></select></label>
            </div>
            <div v-else-if="activeLevel === 'warehouses'" class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Sucursal<select v-model="warehouseForm.branchId" class="field-control" required><option v-for="branch in branches" :key="branch.id" :value="String(branch.id)">{{ branch.company?.commercialName }} / {{ branch.name }}</option></select></label><label class="text-sm font-medium text-fg">Categoria<select v-model="warehouseForm.categoryId" class="field-control" required><option v-for="category in categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option></select></label><AppInput v-model="warehouseForm.name" label="Almacen" required /><AppInput v-model="warehouseForm.description" label="Descripcion" /></div>
            <div v-else-if="activeLevel === 'locations'" class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg sm:col-span-2">Almacen<select v-model="locationForm.warehouseId" class="field-control" required><option v-for="item in warehouses" :key="item.id" :value="String(item.id)">{{ item.branch?.name }} / {{ item.name }}</option></select></label><AppInput v-model="locationForm.code" label="Codigo" required /><AppInput v-model="locationForm.capacity" label="Capacidad" type="number" required /><AppInput v-model="locationForm.aisle" label="Pasillo" required /><AppInput v-model="locationForm.rack" label="Estante" required /><AppInput v-model="locationForm.level" label="Nivel" required /><AppInput v-model="locationForm.position" label="Posicion" required /><AppInput v-model="locationForm.notes" class="sm:col-span-2" label="Notas" /></div>
            <div v-else class="grid gap-4"><AppInput v-model="categoryForm.name" label="Categoria" required /><AppInput v-model="categoryForm.description" label="Descripcion" /></div>
          </div>
          <footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />{{ saving ? "Guardando..." : "Guardar" }}</AppButton></footer>
        </form>
      </aside>
    </div>
  </AdminLayout>
</template>
