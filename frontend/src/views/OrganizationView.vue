<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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
import OperationsNav from '../components/operations/OperationsNav.vue';
import AppBadge from "../components/base/AppBadge.vue";
import TrashButton from "../components/admin/TrashButton.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { http } from "../services/http.service";
import { usePermissions } from "../composables/usePermissions";
import { activeCompanyId } from "../services/company-context";
import PurchaseActionDialog from "../components/base/PurchaseActionDialog.vue";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { onlyOptionId } from "../utils/purchase-workflow";
import { organizationLocations, organizationPayload } from "../utils/organization-form";
import { locationDirectoryAisles, locationDirectoryContext, locationDirectoryFormOptions, locationDirectoryGroups, locationDirectoryRows, type LocationDirectoryRow, type LocationDirectoryStatus } from "../utils/location-directory";

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

const { can } = usePermissions();
const route = useRoute();
const router = useRouter();
const levels: Array<{ id: Level; label: string; singular: string; icon: any; permission: string }> = [
  { id: "companies", label: "Empresa", singular: "empresa", icon: Building2, permission: "companies" },
  { id: "branches", label: "Sucursales", singular: "sucursal", icon: FolderTree, permission: "branches" },
  { id: "warehouses", label: "Almacenes", singular: "almacén", icon: Warehouse, permission: "warehouses" },
  { id: "locations", label: "Espacios", singular: "espacio", icon: MapPin, permission: "locations" },
  { id: "categories", label: "Categorías de almacén", singular: "categoría", icon: CheckCircle2, permission: "warehouse_categories" },
];

const activeLevel = ref<Level>("companies");
let loadVersion = 0;
let initialForm = '';
const discardChanges = ref(false);
const statusChange = ref<{ id: number; level: Level; name: string; active: boolean } | null>(null);
const { leaving, resolveLeave } = useUnsavedChanges(() => editorOpen.value && formSnapshot() !== initialForm, () => saving.value);
onBeforeUnmount(() => { loadVersion++; });
const selectedCompanyId = ref<number | null>(null);
const selectedBranchId = ref<number | null>(null);
const selectedWarehouseId = ref<number | null>(null);
const loading = ref(false);
const saving = ref(false);
const editorOpen = ref(false);
const search = ref("");
const spaceStatus = ref<LocationDirectoryStatus>('all');
const spaceAisle = ref<string | null>(null);
const locationFormBranchId = ref('');
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
const activeCompany = computed(() => companies.value.find((item) => item.id === activeCompanyId.value) ?? null);

const selectedBranch = computed(() => branches.value.find((item) => item.id === selectedBranchId.value) ?? null);
const selectedWarehouse = computed(() => warehouses.value.find((item) => item.id === selectedWarehouseId.value) ?? null);
const visibleBranches = computed(() => selectedCompanyId.value ? branches.value.filter((item) => item.companyId === selectedCompanyId.value) : branches.value);
const visibleWarehouses = computed(() => selectedBranchId.value ? warehouses.value.filter((item) => item.branchId === selectedBranchId.value) : warehouses.value);
const visibleLocations = computed(() => organizationLocations(locations.value as (AnyRecord & { warehouseId: number })[], warehouses.value as (AnyRecord & { id: number; branchId: number })[], selectedBranchId.value, selectedWarehouseId.value));
const activeBranches = computed(() => branches.value.filter(item => item.isActive));
const activeCategories = computed(() => categories.value.filter(item => item.isActive));

// Read-only parent names are also available to roles that can view spaces only.
const spaceWarehouses = computed(() => {
  const directory = new Map<number, AnyRecord & { id: number; branchId: number }>();
  if (!can('warehouses.view')) for (const item of locations.value) {
    if (item.warehouse?.id && item.warehouse.branch?.id) directory.set(item.warehouse.id, { ...item.warehouse, branchId: item.warehouse.branch.id });
  }
  for (const item of warehouses.value) directory.set(item.id, item as AnyRecord & { id: number; branchId: number });
  return [...directory.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
});
const spaceBranches = computed(() => {
  const directory = new Map<number, AnyRecord & { id: number }>();
  if (!can('branches.view')) for (const item of spaceWarehouses.value) if (item.branch?.id) directory.set(item.branch.id, item.branch);
  for (const item of branches.value) directory.set(item.id, item as AnyRecord & { id: number });
  return [...directory.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
});
const spaceContext = computed(() => locationDirectoryContext(spaceWarehouses.value, selectedBranchId.value, selectedWarehouseId.value));
const spaceBranch = computed(() => spaceBranches.value.find(item => item.id === spaceContext.value.branchId) ?? null);
const spaceWarehouseOptions = computed(() => spaceWarehouses.value.filter(item => item.branchId === spaceContext.value.branchId));
const scopedSpaces = computed(() => locationDirectoryRows(locations.value as LocationDirectoryRow[], spaceContext.value.warehouse?.id ?? null));
const spaceAisles = computed(() => locationDirectoryAisles(scopedSpaces.value));
const filteredSpaces = computed(() => locationDirectoryRows(locations.value as (AnyRecord & LocationDirectoryRow)[], spaceContext.value.warehouse?.id ?? null, { search: search.value, status: spaceStatus.value, aisle: spaceAisle.value }));
const spaceGroups = computed(() => locationDirectoryGroups(filteredSpaces.value));
const hasSpaceFilters = computed(() => Boolean(search.value.trim() || spaceStatus.value !== 'all' || spaceAisle.value !== null));
const locationEditorBranches = computed(() => locationDirectoryFormOptions(spaceBranches.value, locationFormBranchId.value));
const locationEditorWarehouses = computed(() => locationDirectoryFormOptions(spaceWarehouses.value.filter(item => String(item.branchId) === locationFormBranchId.value), locationForm.warehouseId));

const activeRows = computed(() => {
  if (activeLevel.value === "companies") return activeCompany.value ? [activeCompany.value] : [];
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
  if (["warehouses", "locations"].includes(activeLevel.value) && selectedBranch.value) items.push({ label: "Sucursal", value: selectedBranch.value.name });
  if (activeLevel.value === "locations" && selectedWarehouse.value) items.push({ label: "Almacén", value: selectedWarehouse.value.name });
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

function cleanObject(source: Record<string, unknown>) {
  return organizationPayload(source, ['commercialLine1', 'phone', 'email', 'webSite', 'logo', 'description', 'notes']);
}

function formSnapshot() {
  if (activeLevel.value === 'locations') return JSON.stringify({ ...locationForm, branchId: locationFormBranchId.value });
  return JSON.stringify(({ companies: companyForm, branches: branchForm, warehouses: warehouseForm, locations: locationForm, categories: categoryForm })[activeLevel.value]);
}

function municipalitiesFor(departmentId: string) {
  return catalogs.value.departments.find((item) => String(item.id) === departmentId)?.municipalities ?? [];
}

function districtsFor(municipalityId: string) {
  return catalogs.value.departments.flatMap((department) => department.municipalities).find((item) => String(item.id) === municipalityId)?.districts ?? [];
}

function applyDefaultGeography(form: GeoForm) {
  form.departmentId = ""; form.municipalityId = ""; form.districtId = "";
}

function onDepartmentChange(form: GeoForm) {
  form.municipalityId = ""; form.districtId = "";
}

function onMunicipalityChange(form: GeoForm) {
  form.districtId = "";
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
  if (level === "locations") return `${item.warehouse?.name ?? "Almacén"} / ${item.aisle}-${item.rack}-${item.level}-${item.position}`;
  return item.description || "Sin descripcion";
}

function syncSection() {
  const section = route.path.split('/')[2] ?? 'companies';
  activeLevel.value = levels.find(level => level.id === section)?.id ?? 'companies';
  const positiveId = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  selectedBranchId.value = positiveId(route.query.branch);
  selectedWarehouseId.value = positiveId(route.query.warehouse);
  editorOpen.value = false;
  discardChanges.value = false;
  statusChange.value = null;
  search.value = "";
  spaceStatus.value = 'all';
  spaceAisle.value = null;
  errorMessage.value = "";
  successMessage.value = "";
}
watch(() => route.fullPath, syncSection, { immediate: true });

function selectSpaceBranch(event: Event) {
  const control = event.target as HTMLSelectElement;
  const branchId = Number(control.value);
  control.value = String(spaceContext.value.branchId ?? '');
  void router.push({ path: route.path, query: { ...route.query, branch: branchId || undefined, warehouse: undefined } });
}

function selectSpaceWarehouse(event: Event) {
  const control = event.target as HTMLSelectElement;
  const warehouseId = Number(control.value);
  control.value = String(spaceContext.value.warehouse?.id ?? '');
  if (warehouseId && !spaceWarehouseOptions.value.some(item => item.id === warehouseId)) return;
  void router.push({ path: route.path, query: { ...route.query, branch: spaceContext.value.branchId || undefined, warehouse: warehouseId || undefined } });
}

function clearSpaceFilters() {
  search.value = '';
  spaceStatus.value = 'all';
  spaceAisle.value = null;
}

function changeLocationFormBranch() {
  locationForm.warehouseId = '';
}

function selectCompany(item: AnyRecord) {
  selectedCompanyId.value = item.id;
  void router.push('/organization/branches');
}

function selectBranch(item: AnyRecord) {
  void router.push({ path: '/organization/warehouses', query: { branch: item.id } });
}

function selectWarehouse(item: AnyRecord) {
  void router.push({ path: '/organization/locations', query: { branch: item.branchId, warehouse: item.id } });
}

function drillDown(item: AnyRecord) {
  if (saving.value || editorOpen.value) return;
  const next = activeLevel.value === 'companies' ? 'branches' : activeLevel.value === 'branches' ? 'warehouses' : 'locations';
  if (!can(next + '.view')) return;
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
    Object.assign(branchForm, { companyId: activeCompany.value ? String(activeCompany.value.id) : "", name: "", address: "", phone: "", email: "" });
    applyDefaultGeography(branchForm);
  } else if (level === "warehouses") {
    Object.assign(warehouseForm, { branchId: activeBranches.value.some(item => item.id === selectedBranchId.value) ? String(selectedBranchId.value) : String(onlyOptionId(activeBranches.value.map(item => ({ id: item.id }))) || ""), categoryId: String(onlyOptionId(activeCategories.value.map(item => ({ id: item.id }))) || ""), name: "", description: "" });
  } else if (level === "locations") {
    locationFormBranchId.value = locationDirectoryFormOptions(spaceBranches.value, null).some(item => item.id === spaceContext.value.branchId) ? String(spaceContext.value.branchId) : '';
    const warehouse = spaceContext.value.warehouse;
    Object.assign(locationForm, { warehouseId: warehouse && locationDirectoryFormOptions([warehouse], null).length && String(warehouse.branchId) === locationFormBranchId.value ? String(warehouse.id) : '', code: "", aisle: "", rack: "", level: "", position: "", capacity: "1", notes: "" });
  } else {
    Object.assign(categoryForm, { name: "", description: "" });
  }
}

function openCreate() {
  if (saving.value || loading.value) return;
  resetForm();
  editorOpen.value = true;
  initialForm = formSnapshot();
  errorMessage.value = "";
}

function editItem(item: AnyRecord) {
  if (saving.value || loading.value) return;
  const level = activeLevel.value;
  editing[level] = item.id;
  if (level === "companies") Object.assign(companyForm, { name: item.name, commercialName: item.commercialName, nit: item.nit, nrc: item.nrc, commercialLine1: item.commercialLine1 ?? "", address: item.address, departmentId: String(item.departmentId), municipalityId: String(item.municipalityId), districtId: String(item.districtId), phone: item.phone ?? "", email: item.email ?? "", webSite: item.webSite ?? "", logo: item.logo ?? "" });
  else if (level === "branches") Object.assign(branchForm, { companyId: String(item.companyId), name: item.name, address: item.address, departmentId: String(item.departmentId), municipalityId: String(item.municipalityId), districtId: String(item.districtId), phone: item.phone ?? "", email: item.email ?? "" });
  else if (level === "warehouses") Object.assign(warehouseForm, { branchId: String(item.branchId), categoryId: String(item.categoryId), name: item.name, description: item.description ?? "" });
  else if (level === "locations") {
    locationFormBranchId.value = String(spaceWarehouses.value.find(warehouse => warehouse.id === item.warehouseId)?.branchId ?? '');
    Object.assign(locationForm, { warehouseId: String(item.warehouseId), code: item.code, aisle: item.aisle, rack: item.rack, level: item.level, position: item.position, capacity: String(item.capacity), notes: item.notes ?? "" });
  }
  else Object.assign(categoryForm, { name: item.name, description: item.description ?? "" });
  editorOpen.value = true;
  initialForm = formSnapshot();
  errorMessage.value = "";
}

function closeEditor() {
  if (saving.value) return;
  if (formSnapshot() !== initialForm) { discardChanges.value = true; return; }
  discardEditor();
}

function discardEditor() {
  discardChanges.value = false;
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
  const version = ++loadVersion;
  loading.value = true;
  errorMessage.value = "";
  try {
    const [geo, companyRes, branchRes, categoryRes, warehouseRes, locationRes] = await Promise.all([
      http.get("/catalogs/geography"), loadAllowed("/companies", "companies.view"), loadAllowed("/branches", "branches.view"),
      loadAllowed("/warehouse-categories", "warehouse_categories.view"), loadAllowed("/warehouses", "warehouses.view"), loadAllowed("/locations", "locations.view"),
    ]);
    if (version !== loadVersion) return;
    catalogs.value = geo.data.data;
    companies.value = companyRes.data.data;
    branches.value = branchRes.data.data;
    categories.value = categoryRes.data.data;
    warehouses.value = warehouseRes.data.data;
    locations.value = locationRes.data.data;
    if (!selectedCompanyId.value && activeCompany.value) selectedCompanyId.value = activeCompany.value.id;
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo cargar la estructura organizacional");
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

async function saveActive() {
  if (saving.value) return;
  const level = activeLevel.value;
  if (level === "companies") return saveEntity("/companies", { ...cleanObject(companyForm), departmentId: Number(companyForm.departmentId), municipalityId: Number(companyForm.municipalityId), districtId: Number(companyForm.districtId) });
  if (level === "branches") return saveEntity("/branches", { ...cleanObject(branchForm), companyId: Number(activeCompany.value?.id ?? branchForm.companyId), departmentId: Number(branchForm.departmentId), municipalityId: Number(branchForm.municipalityId), districtId: Number(branchForm.districtId) });
  if (level === "warehouses") return saveEntity("/warehouses", { ...cleanObject(warehouseForm), branchId: Number(warehouseForm.branchId), categoryId: Number(warehouseForm.categoryId) });
  if (level === "locations") return saveEntity("/locations", { ...cleanObject(locationForm), warehouseId: Number(locationForm.warehouseId), capacity: Number(locationForm.capacity) });
  return saveEntity("/warehouse-categories", cleanObject(categoryForm));
}

async function saveEntity(endpoint: string, payload: Record<string, unknown>) {
  if (saving.value) return;
  const spaceDestination = activeLevel.value === 'locations' ? { branch: locationFormBranchId.value, warehouse: String(payload.warehouseId) } : null;
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
    if (spaceDestination && activeLevel.value === 'locations' && (String(spaceContext.value.branchId) !== spaceDestination.branch || String(spaceContext.value.warehouse?.id) !== spaceDestination.warehouse)) {
      await router.replace({ path: route.path, query: { ...route.query, ...spaceDestination } });
      successMessage.value = id ? 'Espacio actualizado correctamente' : 'Espacio creado correctamente';
    }
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo guardar el registro");
  } finally {
    saving.value = false;
  }
}

function endpointFor(level: Level) {
  return level === "companies" ? "/companies" : level === "branches" ? "/branches" : level === "warehouses" ? "/warehouses" : level === "locations" ? "/locations" : "/warehouse-categories";
}

function toggleStatus(item: AnyRecord) {
  if (saving.value) return;
  statusChange.value = { id: item.id, level: activeLevel.value, name: entityName(activeLevel.value, item), active: !item.isActive };
}

async function confirmStatusChange() {
  const change = statusChange.value;
  if (!change || saving.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await http.patch(`${endpointFor(change.level)}/${change.id}/status`, { isActive: change.active });
    successMessage.value = change.active ? "Registro activado" : "Registro desactivado";
    statusChange.value = null;
    await loadAll();
  } catch (error: any) {
    errorMessage.value = apiMessage(error, "No se pudo actualizar el estado");
  } finally {
    saving.value = false;
  }
}

function loadAllowed(path: string, permission: string) {
  return can(permission) ? http.get(path) : Promise.resolve({ data: { data: [] } });
}
onMounted(async () => {
  await loadAll();
  resetForm("companies"); resetForm("branches"); resetForm("warehouses"); resetForm("locations"); resetForm("categories");
});
</script>

<template>
  <AdminLayout :title="`Organización · ${activeConfig.label}`">
    <OperationsNav />
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p v-if="activeLevel === 'locations'" class="section-eyebrow">Estructura de almacenamiento</p><h1 class="page-title" :class="activeLevel === 'locations' && 'mt-1'">{{ activeConfig.label }}</h1><p v-if="activeLevel === 'locations'" class="mt-2 text-sm text-muted-fg">Organiza cada almacén por pasillo, estante, nivel y posición.</p></div>
      <div class="flex gap-2">
        <AppButton variant="outline" :disabled="loading || saving || editorOpen" title="Actualizar" @click="loadAll"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton>
        <AppButton v-if="activeLevel !== 'companies' && can(`${activeConfig.permission}.create`)" :disabled="loading || saving || editorOpen" @click="openCreate"><Plus class="h-4 w-4" />{{ activeLevel === 'locations' ? 'Nuevo espacio' : `Nueva ${activeConfig.singular}` }}</AppButton>
      </div>
    </div>

    <div v-if="activeLevel !== 'locations'" class="surface-panel mb-4 flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
      <FolderTree class="h-4 w-4 text-accent" />
      <span class="text-muted-fg">Empresa activa</span><span class="font-medium text-fg">{{ activeCompany?.commercialName ?? "Sin empresa seleccionada" }}</span>
      <template v-for="(item, index) in contextItems" :key="item.label"><ChevronRight class="h-4 w-4 text-muted-fg" /><span class="text-muted-fg">{{ item.label }}</span><span class="font-medium text-fg">{{ item.value }}</span><ChevronRight v-if="index < contextItems.length - 1" class="h-4 w-4 text-muted-fg" /></template>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <section v-if="activeLevel === 'locations'" class="surface-panel overflow-hidden">
      <div class="border-b border-border p-4 sm:p-5">
        <p class="mb-4 text-xs text-muted-fg">{{ activeCompany?.commercialName ?? 'Empresa activa' }}</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <label for="spaces-branch" class="text-sm font-medium text-fg">Sucursal
            <select id="spaces-branch" :value="String(spaceContext.branchId ?? '')" class="field-control" :disabled="loading || saving || editorOpen" @change="selectSpaceBranch">
              <option value="">Seleccionar sucursal</option><option v-for="item in spaceBranches" :key="item.id" :value="String(item.id)">{{ item.name }}{{ item.isActive === false ? ' · Inactiva' : '' }}</option>
            </select>
          </label>
          <label for="spaces-warehouse" class="text-sm font-medium text-fg">Almacén
            <select id="spaces-warehouse" :value="String(spaceContext.warehouse?.id ?? '')" class="field-control" :disabled="loading || saving || editorOpen || !spaceBranch || !spaceWarehouseOptions.length" @change="selectSpaceWarehouse">
              <option value="">{{ !spaceBranch ? 'Primero selecciona una sucursal' : !spaceWarehouseOptions.length ? 'Sin almacenes disponibles' : 'Seleccionar almacén' }}</option><option v-for="item in spaceWarehouseOptions" :key="item.id" :value="String(item.id)">{{ item.name }}{{ item.isActive === false ? ' · Inactivo' : '' }}</option>
            </select>
          </label>
        </div>
      </div>

      <template v-if="spaceContext.warehouse">
        <div class="border-b border-border p-4 sm:px-5">
          <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
            <label for="spaces-search" class="text-xs font-medium text-muted-fg">Buscar espacio
              <div class="relative mt-1.5"><Search class="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-fg" /><input id="spaces-search" v-model="search" class="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" placeholder="Código, coordenadas o notas" /></div>
            </label>
            <label for="spaces-aisle" class="text-xs font-medium text-muted-fg">Pasillo<select id="spaces-aisle" v-model="spaceAisle" class="field-control"><option :value="null">Todos los pasillos</option><option v-for="aisle in spaceAisles" :key="aisle" :value="aisle">{{ aisle || 'Sin pasillo' }}</option></select></label>
            <label for="spaces-status" class="text-xs font-medium text-muted-fg">Estado<select id="spaces-status" v-model="spaceStatus" class="field-control"><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
          </div>
          <div class="mt-3 flex items-center justify-between gap-3"><p role="status" class="text-xs text-muted-fg">{{ filteredSpaces.length }} de {{ scopedSpaces.length }} {{ scopedSpaces.length === 1 ? 'espacio definido' : 'espacios definidos' }}</p><button v-if="hasSpaceFilters" type="button" class="rounded text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" @click="clearSpaceFilters">Limpiar filtros</button></div>
        </div>

        <div v-if="loading" role="status" class="flex items-center justify-center gap-2 p-12 text-sm text-muted-fg"><RefreshCw class="h-4 w-4 animate-spin" />Cargando espacios…</div>
        <div v-else-if="spaceGroups.length" class="space-y-5 p-4 sm:p-5">
          <section v-for="group in spaceGroups" :key="group.key" class="overflow-hidden rounded-xl border border-border" :aria-label="`Pasillo ${group.aisle}, estante ${group.rack}`">
            <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-secondary/65 px-4 py-3">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span class="text-muted-fg">Pasillo <strong class="ml-1 font-semibold text-fg">{{ group.aisle || 'Sin definir' }}</strong></span><span class="text-muted-fg">Estante <strong class="ml-1 font-semibold text-fg">{{ group.rack || 'Sin definir' }}</strong></span></div><span class="text-xs text-muted-fg">{{ group.rows.length }} {{ group.rows.length === 1 ? 'espacio' : 'espacios' }}</span>
            </header>
            <div class="divide-y divide-border">
              <article v-for="item in group.rows" :key="item.id" class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-secondary/35 md:grid-cols-[minmax(0,1fr)_9rem_8rem_5.5rem_auto]" :aria-label="`Espacio ${item.code}`">
                <div class="min-w-0"><p class="break-words text-sm font-semibold text-fg">{{ item.code }}</p><p v-if="item.notes" class="mt-1 truncate text-xs text-muted-fg" :title="item.notes">{{ item.notes }}</p></div>
                <AppBadge class="justify-self-end md:col-start-4 md:row-start-1 md:justify-self-start" :variant="item.isActive ? 'success' : 'neutral'">{{ item.isActive ? 'Activo' : 'Inactivo' }}</AppBadge>
                <dl class="flex gap-5 md:col-start-2 md:row-start-1"><div><dt class="text-xs text-muted-fg">Nivel</dt><dd class="mt-0.5 text-sm font-medium text-fg">{{ item.level || 'Sin definir' }}</dd></div><div><dt class="text-xs text-muted-fg">Posición</dt><dd class="mt-0.5 text-sm font-medium text-fg">{{ item.position || 'Sin definir' }}</dd></div></dl>
                <dl class="justify-self-end md:col-start-3 md:row-start-1 md:justify-self-start"><dt class="text-xs text-muted-fg">Capacidad nominal</dt><dd class="mt-0.5 text-sm font-medium tabular-nums text-fg">{{ item.capacity }}</dd></dl>
                <div class="col-span-2 flex justify-end gap-1 border-t border-border pt-3 md:col-span-1 md:col-start-5 md:row-start-1 md:border-0 md:pt-0">
                  <button v-if="can('locations.update')" type="button" class="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-fg hover:bg-surface-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" :disabled="saving || editorOpen" :aria-label="`Editar espacio ${item.code}`" @click="editItem(item)"><Edit2 class="h-4 w-4" />Editar</button>
                  <button v-if="can(`locations.${item.isActive ? 'deactivate' : 'activate'}`)" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" :disabled="saving || editorOpen" :title="item.isActive ? 'Desactivar espacio' : 'Activar espacio'" :aria-label="`${item.isActive ? 'Desactivar' : 'Activar'} espacio ${item.code}`" @click="toggleStatus(item)"><Power class="h-4 w-4" /></button>
                  <TrashButton compact entity="locations" :record-id="item.id" :label="item.code" :disabled="saving || editorOpen" @deleted="loadAll" />
                </div>
              </article>
            </div>
          </section>
        </div>
        <div v-else class="px-5 py-14 text-center"><MapPin class="mx-auto mb-3 h-7 w-7 text-muted-fg" /><h2 class="text-sm font-semibold text-fg">{{ hasSpaceFilters ? 'No hay espacios con estos filtros' : 'Este almacén aún no tiene espacios definidos' }}</h2><p class="mx-auto mt-2 max-w-sm text-sm text-muted-fg">{{ hasSpaceFilters ? 'Prueba otro código, pasillo o estado.' : 'Agrega sus coordenadas y capacidad para organizar el almacenamiento.' }}</p><AppButton v-if="hasSpaceFilters" variant="outline" class="mt-4" @click="clearSpaceFilters">Limpiar filtros</AppButton><AppButton v-else-if="can('locations.create')" class="mt-4" :disabled="saving || editorOpen" @click="openCreate"><Plus class="h-4 w-4" />Nuevo espacio</AppButton></div>
      </template>
      <div v-else class="px-5 py-16 text-center"><Warehouse class="mx-auto mb-4 h-8 w-8 text-muted-fg" /><h2 class="text-base font-semibold text-fg">{{ !spaceBranch ? 'Selecciona una sucursal' : !spaceWarehouseOptions.length ? 'Esta sucursal no tiene almacenes disponibles' : 'Selecciona un almacén' }}</h2><p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-fg">{{ !spaceBranch ? 'Elige dónde quieres administrar los espacios de almacenamiento.' : !spaceWarehouseOptions.length ? 'Puedes elegir otra sucursal para consultar sus espacios.' : 'Verás sus espacios organizados por pasillo y estante.' }}</p></div>
    </section>

    <section v-else class="surface-panel overflow-hidden">
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
              <td class="px-4 py-3"><div class="flex justify-end gap-1"><button v-if="can(`${activeConfig.permission}.update`)" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Editar" @click="editItem(item)"><Edit2 class="h-4 w-4" /></button><button v-if="activeLevel !== 'companies' && can(`${activeConfig.permission}.${item.isActive ? 'deactivate' : 'activate'}`)" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" :title="item.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(item)"><Power class="h-4 w-4" /></button><TrashButton compact v-if="activeLevel !== 'companies'" :entity="activeLevel === 'categories' ? 'warehouse_categories' : activeLevel" :record-id="item.id" :label="entityName(activeLevel, item)" :disabled="saving" @deleted="loadAll" /></div></td>
            </tr>
            <tr v-if="!loading && !filteredRows.length"><td colspan="4" class="px-4 py-12 text-center text-muted-fg">No hay registros para esta seleccion.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-border md:hidden">
        <article v-for="item in filteredRows" :key="item.id" class="p-4"><div class="flex items-start justify-between gap-3"><button type="button" class="min-w-0 text-left" @click="drillDown(item)"><p class="truncate font-medium text-fg">{{ entityName(activeLevel, item) }}</p><p class="mt-1 text-xs leading-5 text-muted-fg">{{ entityDetail(activeLevel, item) }}</p></button><AppBadge :variant="item.isActive ? 'success' : 'neutral'">{{ item.isActive ? "Activo" : "Inactivo" }}</AppBadge></div><div class="mt-3 flex justify-end gap-2 border-t border-border pt-3"><AppButton v-if="can(`${activeConfig.permission}.update`)" size="sm" variant="ghost" @click="editItem(item)"><Edit2 class="h-4 w-4" />Editar</AppButton><button v-if="activeLevel !== 'companies' && can(`${activeConfig.permission}.${item.isActive ? 'deactivate' : 'activate'}`)" type="button" class="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" :title="item.isActive ? 'Desactivar' : 'Activar'" @click="toggleStatus(item)"><Power class="h-4 w-4" /></button><TrashButton v-if="activeLevel !== 'companies'" :entity="activeLevel === 'categories' ? 'warehouse_categories' : activeLevel" :record-id="item.id" :label="entityName(activeLevel, item)" :disabled="saving" @deleted="loadAll" /></div></article>
        <p v-if="!loading && !filteredRows.length" class="px-4 py-12 text-center text-sm text-muted-fg">No hay registros para esta seleccion.</p>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" @click.self="closeEditor">
      <aside role="dialog" aria-modal="true" aria-label="Registro de organización" @keydown.esc="closeEditor" class="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl">
        <header class="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6"><div><p class="text-sm font-medium text-accent">{{ editing[activeLevel] ? "Editar" : "Nuevo registro" }}</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ editing[activeLevel] ? `Editar ${activeConfig.singular}` : activeLevel === 'locations' ? 'Nuevo espacio' : `Nueva ${activeConfig.singular}` }}</h2><p class="mt-1 text-sm text-muted-fg">{{ activeLevel === 'locations' ? 'Define un espacio dentro de su almacén.' : 'Completa los datos necesarios para continuar.' }}</p></div><button type="button" class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary" title="Cerrar" @click="closeEditor"><X class="h-5 w-5" /></button></header>
        <form class="scrollbar-thin flex min-h-0 flex-1 flex-col" @submit.prevent="saveActive">
          <p v-if="errorMessage" role="alert" class="px-5 pt-4 text-sm text-danger">{{ errorMessage }}</p>
          <fieldset :disabled="saving" class="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div v-if="activeLevel === 'companies'" class="grid gap-4 sm:grid-cols-2">
              <label class="sm:col-span-2"><span class="mb-1.5 block text-sm font-medium text-fg">Logo</span><span class="flex items-center gap-4 rounded-lg border border-dashed border-border p-3"><span class="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-secondary text-muted-fg"><img v-if="companyForm.logo" :src="companyForm.logo" alt="Vista previa del logo" class="h-full w-full object-contain" /><ImagePlus v-else class="h-5 w-5" /></span><span class="min-w-0"><span class="block text-sm font-medium text-fg">Seleccionar imagen</span><span class="block text-xs text-muted-fg">PNG, JPEG o WEBP, hasta 2 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" class="mt-2 block w-full text-xs text-muted-fg file:mr-3 file:rounded-md file:border-0 file:bg-surface-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-fg" @change="onLogoSelected" /></span></span></label>
              <AppInput v-model="companyForm.commercialName" label="Nombre comercial" required /><AppInput v-model="companyForm.name" label="Razon social" required /><AppInput v-model="companyForm.nit" label="NIT" required /><AppInput v-model="companyForm.nrc" label="NRC" required /><AppInput v-model="companyForm.commercialLine1" label="Giro" /><AppInput v-model="companyForm.phone" label="Telefono" /><AppInput v-model="companyForm.email" label="Correo" type="email" /><AppInput v-model="companyForm.webSite" label="Sitio web" /><AppInput v-model="companyForm.address" class="sm:col-span-2" label="Direccion" required />
              <label class="text-sm font-medium text-fg">Departamento<select v-model="companyForm.departmentId" class="field-control" required @change="onDepartmentChange(companyForm)"><option disabled value="">Seleccionar</option><option v-for="department in catalogs.departments" :key="department.id" :value="String(department.id)">{{ department.name }}</option></select></label>
              <label class="text-sm font-medium text-fg">Municipio<select v-model="companyForm.municipalityId" class="field-control" required @change="onMunicipalityChange(companyForm)"><option disabled value="">Seleccionar</option><option v-for="municipality in companyMunicipalities" :key="municipality.id" :value="String(municipality.id)">{{ municipality.name }}</option></select></label>
              <label class="text-sm font-medium text-fg">Distrito<select v-model="companyForm.districtId" class="field-control" required><option disabled value="">Seleccionar</option><option v-for="district in companyDistricts" :key="district.id" :value="String(district.id)">{{ district.name }}</option></select></label>
            </div>
            <div v-else-if="activeLevel === 'branches'" class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-lg border border-border bg-surface-secondary px-3 py-2.5"><p class="text-xs font-medium text-muted-fg">Empresa</p><p class="mt-1 text-sm font-semibold text-fg">{{ activeCompany?.commercialName ?? "Empresa activa" }}</p></div><AppInput v-model="branchForm.name" label="Sucursal" required /><AppInput v-model="branchForm.phone" label="Telefono" /><AppInput v-model="branchForm.email" label="Correo" type="email" /><AppInput v-model="branchForm.address" class="sm:col-span-2" label="Direccion" required />
              <label class="text-sm font-medium text-fg">Departamento<select v-model="branchForm.departmentId" class="field-control" required @change="onDepartmentChange(branchForm)"><option disabled value="">Seleccionar</option><option v-for="department in catalogs.departments" :key="department.id" :value="String(department.id)">{{ department.name }}</option></select></label><label class="text-sm font-medium text-fg">Municipio<select v-model="branchForm.municipalityId" class="field-control" required @change="onMunicipalityChange(branchForm)"><option disabled value="">Seleccionar</option><option v-for="municipality in branchMunicipalities" :key="municipality.id" :value="String(municipality.id)">{{ municipality.name }}</option></select></label><label class="text-sm font-medium text-fg">Distrito<select v-model="branchForm.districtId" class="field-control" required><option disabled value="">Seleccionar</option><option v-for="district in branchDistricts" :key="district.id" :value="String(district.id)">{{ district.name }}</option></select></label>
            </div>
            <div v-else-if="activeLevel === 'warehouses'" class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Sucursal<select v-model="warehouseForm.branchId" class="field-control" required><option disabled value="">Seleccionar</option><option v-for="branch in branches.filter(item => item.isActive || String(item.id) === warehouseForm.branchId)" :key="branch.id" :value="String(branch.id)">{{ branch.company?.commercialName }} / {{ branch.name }}</option></select></label><label class="text-sm font-medium text-fg">Categoría de almacén<select v-model="warehouseForm.categoryId" class="field-control" required><option disabled value="">Seleccionar</option><option v-for="category in categories.filter(item => item.isActive || String(item.id) === warehouseForm.categoryId)" :key="category.id" :value="String(category.id)">{{ category.name }}</option></select></label><AppInput v-model="warehouseForm.name" label="Almacén" required /><AppInput v-model="warehouseForm.description" label="Descripción" /></div>
            <div v-else-if="activeLevel === 'locations'" class="space-y-7">
              <section aria-labelledby="space-form-warehouse"><h3 id="space-form-warehouse" class="mb-3 text-sm font-semibold text-fg">Almacén</h3><div class="grid gap-4 sm:grid-cols-2">
                <label for="space-form-branch" class="text-sm font-medium text-fg">Sucursal<select id="space-form-branch" v-model="locationFormBranchId" class="field-control" required @change="changeLocationFormBranch"><option disabled value="">Seleccionar sucursal</option><option v-for="item in locationEditorBranches" :key="item.id" :value="String(item.id)">{{ item.name }}{{ item.isActive === false ? ' · Inactiva' : '' }}</option></select></label>
                <label for="space-form-warehouse-select" class="text-sm font-medium text-fg">Almacén<select id="space-form-warehouse-select" v-model="locationForm.warehouseId" class="field-control" required :disabled="!locationFormBranchId"><option disabled value="">{{ locationFormBranchId ? 'Seleccionar almacén' : 'Selecciona la sucursal' }}</option><option v-for="item in locationEditorWarehouses" :key="item.id" :value="String(item.id)">{{ item.name }}{{ item.isActive === false ? ' · Inactivo' : '' }}</option></select></label>
              </div><p v-if="locationFormBranchId && !locationEditorWarehouses.length" class="mt-2 text-xs text-muted-fg">Esta sucursal no tiene almacenes activos disponibles.</p></section>
              <section aria-labelledby="space-form-identity" class="border-t border-border pt-5"><h3 id="space-form-identity" class="mb-3 text-sm font-semibold text-fg">Identificación</h3><div class="grid gap-4"><AppInput v-model="locationForm.code" label="Código del espacio" placeholder="Código único dentro del almacén" required /><AppInput v-model="locationForm.notes" label="Notas" placeholder="Referencia adicional (opcional)" /></div></section>
              <section aria-labelledby="space-form-coordinates" class="border-t border-border pt-5"><h3 id="space-form-coordinates" class="mb-3 text-sm font-semibold text-fg">Coordenadas</h3><div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="locationForm.aisle" label="Pasillo" required /><AppInput v-model="locationForm.rack" label="Estante" required /><AppInput v-model="locationForm.level" label="Nivel" required /><AppInput v-model="locationForm.position" label="Posición" required /></div></section>
              <section aria-labelledby="space-form-capacity" class="border-t border-border pt-5"><h3 id="space-form-capacity" class="mb-3 text-sm font-semibold text-fg">Capacidad</h3><AppInput v-model="locationForm.capacity" label="Capacidad nominal" type="number" min="1" step="1" required hint="Límite configurado para este espacio. Las existencias se consultan en Inventario." /></section>
            </div>
            <div v-else class="grid gap-4"><AppInput v-model="categoryForm.name" label="Categoría de almacén" required /><AppInput v-model="categoryForm.description" label="Descripción" /></div>
          </fieldset>
          <footer class="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><AppButton variant="outline" type="button" :disabled="saving" @click="closeEditor">Cancelar</AppButton><AppButton type="submit" :disabled="saving"><Save class="h-4 w-4" />{{ saving ? "Guardando..." : "Guardar" }}</AppButton></footer>
        </form>
      </aside>
    </div>
    <PurchaseActionDialog v-if="discardChanges" title="Descartar cambios" description="Los cambios del registro no se han guardado." @confirm="discardEditor" @close="discardChanges = false" />
    <PurchaseActionDialog v-if="leaving" title="Salir sin guardar" description="Los cambios de organización no se han guardado." @confirm="resolveLeave(true)" @close="resolveLeave(false)" />
    <PurchaseActionDialog v-if="statusChange" :title="statusChange.active ? 'Activar registro' : 'Desactivar registro'" :description="statusChange.name + '. Se conservará el historial. El servidor comprobará las restricciones de sus relaciones y existencias.'" :busy="saving" :error="errorMessage" @confirm="confirmStatusChange" @close="statusChange = null" />
  </AdminLayout>
</template>
