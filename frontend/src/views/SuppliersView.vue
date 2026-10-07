<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Building2, History, Mail, Pencil, Phone, Plus, Power, ReceiptText, RefreshCw, Search, Star, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import PurchasesNav from "../components/purchases/PurchasesNav.vue";
import AppBadge from "../components/base/AppBadge.vue";
import TrashButton from "../components/admin/TrashButton.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import NationalLocationFields from "../components/forms/NationalLocationFields.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";
import { getApiErrorMessage } from "../utils/api-error";
import { activeCompanyId } from "../services/company-context";
import { useAuthStore } from "../stores/auth.store";

type Country = { id: number; name: string; isoCode: string };
type Geography = {
  departments: Array<{
    id: number;
    name: string;
    municipalities: Array<{ id: number; name: string; districts: Array<{ id: number; name: string }> }>;
  }>;
};
type Contact = { id: number; supplierId: number; fullName: string; role: string; isPrimary: boolean; phone?: string; email?: string; notes?: string; isActive: boolean };
type Purchase = {
  id: number;
  documentNumber: string;
  status: string;
  total: number | string;
  createdAt: string;
  branch: { id: number; name: string };
  _count: { items: number };
};
type Supplier = {
  id: number;
  code: string;
  name: string;
  countryId: number;
  departmentId?: number | null;
  municipalityId?: number | null;
  districtId?: number | null;
  country: Country;
  department?: { id: number; name: string } | null;
  municipality?: { id: number; name: string } | null;
  district?: { id: number; name: string } | null;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  isActive: boolean;
  _count?: { contacts: number; purchases: number };
};

const { can, canAny } = usePermissions();
const authStore = useAuthStore();
const router = useRouter();
const suppliers = ref<Supplier[]>([]);
const countries = ref<Country[]>([]);
const geography = ref<Geography>({ departments: [] });
const contacts = ref<Contact[]>([]);
const history = ref<any[]>([]);
const purchases = ref<Purchase[]>([]);
const selectedId = ref<number | null>(null);
const search = ref("");
const contactSearch = ref("");
const activeOnly = ref(false);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const showSupplierForm = ref(false);
const showContactForm = ref(false);
const showHistory = ref(false);
const showPurchases = ref(false);
const editingSupplierId = ref<number | null>(null);
const editingContactId = ref<number | null>(null);
const historyTitle = ref("");
let mounted = true;
let companyVersion = 0;
let loadVersion = 0;
let contactVersion = 0;
let panelVersion = 0;
type CompanyContext = { id: number; version: number };
const companyContext = (): CompanyContext | null => activeCompanyId.value ? { id: activeCompanyId.value, version: companyVersion } : null;
const isCurrentCompany = (context: CompanyContext) => mounted && context.id === activeCompanyId.value && context.version === companyVersion;
const companyHeaders = (context: CompanyContext) => ({ headers: { "X-Company-Id": String(context.id) } });

const supplierForm = reactive({ code: "", name: "", countryId: "", departmentId: "", municipalityId: "", districtId: "", address: "", phone: "", email: "", website: "" });
const contactForm = reactive({ fullName: "", role: "General", isPrimary: false, phone: "", email: "", notes: "" });
const selected = computed(() => suppliers.value.find((supplier) => supplier.id === selectedId.value) ?? null);
const activeCompany = computed(() => authStore.user?.companies?.find((company) => company.id === activeCompanyId.value) ?? null);
const primaryContact = computed(() => can('supplier_contacts.view') ? contacts.value.find((contact) => contact.isPrimary && contact.isActive) ?? contacts.value.find((contact) => contact.isActive) ?? null : null);
const supplierIsNational = computed(() => countries.value.find((country) => String(country.id) === supplierForm.countryId)?.isoCode === "SV");
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return suppliers.value.filter((supplier) => {
    const matchesTerm = !term || `${supplier.code} ${supplier.name} ${supplier.country.name}`.toLowerCase().includes(term);
    return matchesTerm && (!activeOnly.value || supplier.isActive);
  });
});
const filteredContacts = computed(() => {
  const term = contactSearch.value.trim().toLowerCase();
  return term ? contacts.value.filter((contact) => `${contact.fullName} ${contact.role} ${contact.phone ?? ""} ${contact.email ?? ""} ${contact.notes ?? ""}`.toLowerCase().includes(term)) : contacts.value;
});

function clean(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "" && entry !== undefined));
}

function showError(error: unknown, fallback: string) {
  successMessage.value = "";
  errorMessage.value = getApiErrorMessage(error, fallback);
}

function showSuccess(message: string) {
  errorMessage.value = "";
  successMessage.value = message;
}

function money(value: number | string) {
  return new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(Number(value));
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

async function load() {
  const context = companyContext();
  const version = ++loadVersion;
  if (!context) { loading.value = false; return; }
  loading.value = true;
  errorMessage.value = "";
  try {
    const [supplierResponse, countryResponse, geographyResponse] = await Promise.all([
      http.get("/suppliers", companyHeaders(context)),
      http.get("/catalogs/countries", companyHeaders(context)),
      http.get("/catalogs/geography", companyHeaders(context)),
    ]);
    if (!isCurrentCompany(context) || version !== loadVersion) return;
    suppliers.value = supplierResponse.data.data;
    countries.value = countryResponse.data.data;
    geography.value = geographyResponse.data.data;
    if (selectedId.value && !suppliers.value.some((row) => row.id === selectedId.value)) {
      selectedId.value = null;
      contacts.value = [];
      ++contactVersion;
      closePanel();
    }
    const id = selectedId.value ?? suppliers.value[0]?.id;
    if (id) await selectSupplier(id);
  } catch (error) {
    if (isCurrentCompany(context) && version === loadVersion) showError(error, "No se pudieron cargar los proveedores");
  } finally {
    if (isCurrentCompany(context) && version === loadVersion) loading.value = false;
  }
}

async function selectSupplier(id: number) {
  const context = companyContext();
  if (!context || !suppliers.value.some(supplier => supplier.id === id)) return;
  const version = ++contactVersion;
  if (selectedId.value !== id) closePanel();
  selectedId.value = id;
  contactSearch.value = "";
  contacts.value = [];
  if (!can('supplier_contacts.view')) return;
  try {
    const response = await http.get("/supplier-contacts", { ...companyHeaders(context), params: { supplierId: id } });
    if (isCurrentCompany(context) && version === contactVersion && selectedId.value === id) contacts.value = response.data.data;
  } catch (error) {
    if (isCurrentCompany(context) && version === contactVersion && selectedId.value === id) {
      contacts.value = [];
      showError(error, "No se pudieron cargar los contactos del proveedor");
    }
  }
}

function defaultCountryId() {
  return String(countries.value.find((country) => country.isoCode === "SV")?.id ?? countries.value[0]?.id ?? "");
}

function clearLocationWhenForeign() {
  if (!supplierIsNational.value) {
    supplierForm.departmentId = "";
    supplierForm.municipalityId = "";
    supplierForm.districtId = "";
  }
}

function newSupplier() {
  if (saving.value || !activeCompanyId.value) return;
  closePanel();
  editingSupplierId.value = null;
  Object.assign(supplierForm, { code: "", name: "", countryId: defaultCountryId(), departmentId: "", municipalityId: "", districtId: "", address: "", phone: "", email: "", website: "" });
  showSupplierForm.value = true;
}

function editSupplier() {
  if (!selected.value || saving.value) return;
  closePanel();
  editingSupplierId.value = selected.value.id;
  Object.assign(supplierForm, {
    code: selected.value.code,
    name: selected.value.name,
    countryId: String(selected.value.countryId),
    departmentId: selected.value.departmentId ? String(selected.value.departmentId) : "",
    municipalityId: selected.value.municipalityId ? String(selected.value.municipalityId) : "",
    districtId: selected.value.districtId ? String(selected.value.districtId) : "",
    address: selected.value.address ?? "",
    phone: selected.value.phone ?? "",
    email: selected.value.email ?? "",
    website: selected.value.website ?? "",
  });
  showSupplierForm.value = true;
}

async function saveSupplier() {
  const context = companyContext();
  if (!context || saving.value) return;
  const editingId = editingSupplierId.value;
  saving.value = true;
  try {
    const { countryId, departmentId, municipalityId, districtId, ...supplierData } = supplierForm;
    const payload = clean({
      ...supplierData,
      countryId: Number(countryId),
      ...(supplierIsNational.value ? { departmentId: Number(departmentId), municipalityId: Number(municipalityId), districtId: Number(districtId) } : {}),
    });
    const response = editingId ? await http.patch(`/suppliers/${editingId}`, payload, companyHeaders(context)) : await http.post("/suppliers", payload, companyHeaders(context));
    if (!isCurrentCompany(context)) return;
    showSuccess(editingId ? "Proveedor actualizado" : "Proveedor registrado");
    showSupplierForm.value = false;
    selectedId.value = response.data.data.id;
    await load();
  } catch (error) {
    if (isCurrentCompany(context)) showError(error, "No se pudo guardar el proveedor");
  } finally {
    if (isCurrentCompany(context)) saving.value = false;
  }
}

async function toggleSupplier() {
  const context = companyContext();
  const supplier = selected.value;
  if (!context || !supplier || saving.value) return;
  saving.value = true;
  try {
    await http.patch(`/suppliers/${supplier.id}/status`, { isActive: !supplier.isActive }, companyHeaders(context));
    if (!isCurrentCompany(context)) return;
    showSuccess(supplier.isActive ? "Proveedor desactivado" : "Proveedor activado");
    await load();
  } catch (error) {
    if (isCurrentCompany(context)) showError(error, "No se pudo actualizar el estado");
  } finally {
    if (isCurrentCompany(context)) saving.value = false;
  }
}

function newContact() {
  if (saving.value || !selected.value || !can('supplier_contacts.view')) return;
  closePanel();
  editingContactId.value = null;
  Object.assign(contactForm, { fullName: "", role: "General", isPrimary: contacts.value.every((contact) => !contact.isPrimary), phone: "", email: "", notes: "" });
  showContactForm.value = true;
}

function editContact(contact: Contact) {
  if (saving.value || !can('supplier_contacts.view')) return;
  closePanel();
  editingContactId.value = contact.id;
  Object.assign(contactForm, { fullName: contact.fullName, role: contact.role, isPrimary: contact.isPrimary, phone: contact.phone ?? "", email: contact.email ?? "", notes: contact.notes ?? "" });
  showContactForm.value = true;
}

async function saveContact() {
  const context = companyContext();
  const supplierId = selected.value?.id;
  const editingId = editingContactId.value;
  if (!context || !supplierId || saving.value) return;
  saving.value = true;
  try {
    const payload = clean({ ...contactForm, supplierId });
    if (editingId) await http.patch(`/supplier-contacts/${editingId}`, payload, companyHeaders(context));
    else await http.post("/supplier-contacts", payload, companyHeaders(context));
    if (!isCurrentCompany(context)) return;
    showSuccess(editingId ? "Contacto actualizado" : "Contacto registrado");
    showContactForm.value = false;
    await load();
  } catch (error) {
    if (isCurrentCompany(context)) showError(error, "No se pudo guardar el contacto");
  } finally {
    if (isCurrentCompany(context)) saving.value = false;
  }
}

async function toggleContact(contact: Contact) {
  const context = companyContext();
  const supplier = selected.value;
  if (!context || !supplier || saving.value) return;
  if (!supplier.isActive && !contact.isActive) {
    errorMessage.value = "Activa primero el proveedor para poder activar a este contacto.";
    return;
  }
  saving.value = true;
  try {
    await http.patch(`/supplier-contacts/${contact.id}/status`, { isActive: !contact.isActive }, companyHeaders(context));
    if (!isCurrentCompany(context)) return;
    showSuccess(contact.isActive ? "Contacto desactivado" : "Contacto activado");
    await selectSupplier(supplier.id);
  } catch (error) {
    if (isCurrentCompany(context)) showError(error, "No se pudo actualizar el estado del contacto");
  } finally {
    if (isCurrentCompany(context)) saving.value = false;
  }
}

async function loadHistory() {
  const context = companyContext();
  const supplier = selected.value;
  if (!context || !supplier || saving.value) return;
  closePanel();
  const version = ++panelVersion;
  try {
    const response = await http.get(`/suppliers/${supplier.id}/history`, companyHeaders(context));
    if (!isCurrentCompany(context) || version !== panelVersion || selectedId.value !== supplier.id) return;
    history.value = response.data.data;
    historyTitle.value = supplier.name;
    showHistory.value = true;
  } catch (error) {
    if (isCurrentCompany(context) && version === panelVersion && selectedId.value === supplier.id) showError(error, "No se pudo cargar el historial del proveedor");
  }
}

async function loadContactHistory(contact: Contact) {
  const context = companyContext();
  const supplierId = selectedId.value;
  if (!context || !supplierId || saving.value || !can('supplier_contacts.view')) return;
  closePanel();
  const version = ++panelVersion;
  try {
    const response = await http.get(`/supplier-contacts/${contact.id}/history`, companyHeaders(context));
    if (!isCurrentCompany(context) || version !== panelVersion || selectedId.value !== supplierId) return;
    history.value = response.data.data;
    historyTitle.value = contact.fullName;
    showHistory.value = true;
  } catch (error) {
    if (isCurrentCompany(context) && version === panelVersion && selectedId.value === supplierId) showError(error, "No se pudo cargar el historial del contacto");
  }
}

async function loadPurchases() {
  const context = companyContext();
  const supplier = selected.value;
  if (!context || !supplier || saving.value) return;
  closePanel();
  const version = ++panelVersion;
  try {
    const response = await http.get(`/suppliers/${supplier.id}/purchases`, companyHeaders(context));
    if (!isCurrentCompany(context) || version !== panelVersion || selectedId.value !== supplier.id) return;
    purchases.value = response.data.data;
    showPurchases.value = true;
  } catch (error) {
    if (isCurrentCompany(context) && version === panelVersion && selectedId.value === supplier.id) showError(error, "No se pudieron cargar las compras del proveedor");
  }
}

function closePanel() {
  ++panelVersion;
  showSupplierForm.value = false;
  showContactForm.value = false;
  showHistory.value = false;
  showPurchases.value = false;
}

watch(activeCompanyId, () => {
  ++companyVersion;
  ++loadVersion;
  ++contactVersion;
  closePanel();
  suppliers.value = [];
  contacts.value = [];
  countries.value = [];
  geography.value = { departments: [] };
  history.value = [];
  purchases.value = [];
  selectedId.value = null;
  editingSupplierId.value = null;
  editingContactId.value = null;
  search.value = "";
  contactSearch.value = "";
  activeOnly.value = false;
  historyTitle.value = "";
  errorMessage.value = "";
  successMessage.value = "";
  saving.value = false;
  Object.assign(supplierForm, { code: "", name: "", countryId: "", departmentId: "", municipalityId: "", districtId: "", address: "", phone: "", email: "", website: "" });
  Object.assign(contactForm, { fullName: "", role: "General", isPrimary: false, phone: "", email: "", notes: "" });
  void load();
}, { immediate: true, flush: 'sync' });

onBeforeUnmount(() => {
  mounted = false;
  ++companyVersion;
  ++loadVersion;
  ++contactVersion;
  ++panelVersion;
});
</script>

<template>
  <AdminLayout title="Proveedores">
    <PurchasesNav />
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p class="section-eyebrow">Abastecimiento</p><h1 class="page-title mt-1">Proveedores</h1><p class="page-subtitle">{{ activeCompany ? `Contactos y abastecimiento de ${activeCompany.commercialName}.` : "Directorio comercial y personas de contacto." }}</p></div>
      <div class="flex gap-2"><AppButton variant="outline" :disabled="loading" title="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton><AppButton v-if="can('suppliers.create')" :disabled="loading || saving" @click="newSupplier"><Plus class="h-4 w-4" />Nuevo proveedor</AppButton></div>
    </div>
    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <div class="surface-panel grid overflow-hidden lg:min-h-[640px] lg:grid-cols-[336px_1fr]">
      <aside class="border-b border-border lg:border-b-0 lg:border-r">
        <div class="space-y-3 border-b border-border p-4">
          <div class="flex items-center justify-between gap-3"><p class="text-sm font-semibold text-fg">Directorio</p><span class="text-xs text-muted-fg">{{ filtered.length }} proveedores</span></div>
          <div class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm" placeholder="Buscar proveedor" /></div>
          <label class="flex items-center gap-2 text-sm text-fg"><input v-model="activeOnly" type="checkbox" class="h-4 w-4 rounded border-border text-accent focus:ring-accent" />Solo activos</label>
        </div>
        <div class="scrollbar-thin max-h-[300px] overflow-y-auto p-2 lg:max-h-[575px]"><button v-for="supplier in filtered" :key="supplier.id" :disabled="saving" class="mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition" :class="selectedId === supplier.id ? 'bg-accent-soft text-fg shadow-sm' : 'hover:bg-surface-secondary'" @click="selectSupplier(supplier.id)"><span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-secondary text-xs font-semibold text-muted-fg" :class="selectedId === supplier.id && 'bg-accent text-accent-foreground'">{{ initials(supplier.name) }}</span><span class="min-w-0 flex-1"><span class="flex items-start justify-between gap-2"><span class="truncate font-semibold">{{ supplier.name }}</span><span class="mt-1 h-2 w-2 shrink-0 rounded-full" :class="supplier.isActive ? 'bg-success' : 'bg-muted-fg'" /></span><span class="mt-0.5 block truncate text-xs text-muted-fg">{{ supplier.code }} · {{ supplier.country.name }}</span><span class="mt-1 block text-xs text-muted-fg">{{ supplier._count?.contacts ?? 0 }} contactos</span></span></button><p v-if="!filtered.length" class="px-3 py-10 text-center text-sm text-muted-fg">Sin proveedores.</p></div>
      </aside>

      <main v-if="selected" class="min-w-0">
        <header class="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5"><div class="flex min-w-0 gap-3"><div class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Building2 class="h-5 w-5" /></div><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h2 class="truncate text-xl font-semibold text-fg">{{ selected.name }}</h2><AppBadge :variant="selected.isActive ? 'success' : 'neutral'">{{ selected.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></div><p class="mt-1 text-sm text-muted-fg">{{ selected.code }} · {{ selected.country.name }}</p></div></div><div class="flex w-full flex-wrap gap-2 sm:w-auto"><AppButton v-if="selected.isActive && can('purchase_quotations.view') && can('purchase_quotations.create')" :disabled="loading || saving" @click="router.push({ path: '/purchases/quotations', query: { supplier: selected.id } })"><Plus class="h-4 w-4" />Registrar cotización</AppButton><AppButton variant="outline" :disabled="saving" @click="loadHistory"><History class="h-4 w-4" />Historial</AppButton><AppButton variant="outline" :disabled="saving" @click="loadPurchases"><ReceiptText class="h-4 w-4" />Compras</AppButton><AppButton v-if="can('suppliers.update')" variant="outline" :disabled="saving" @click="editSupplier"><Pencil class="h-4 w-4" />Editar</AppButton><button v-if="canAny(['suppliers.activate','suppliers.deactivate'])" type="button" :disabled="saving" class="icon-button" :title="selected.isActive ? 'Desactivar proveedor' : 'Activar proveedor'" @click="toggleSupplier"><Power class="h-4 w-4" /></button><details v-if="can('trash.delete')" class="relative"><summary class="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-muted-fg">Más acciones</summary><div class="absolute right-0 z-30 mt-2 min-w-52 rounded-xl border border-border bg-surface p-3 shadow-subtle"><TrashButton entity="suppliers" :record-id="selected.id" :label="selected.name" :disabled="saving" @deleted="load" /></div></details></div></header>
        <section class="grid gap-5 border-b border-border bg-surface-secondary/35 p-5 md:grid-cols-3"><div><p class="text-xs font-semibold text-muted-fg">{{ can('supplier_contacts.view') ? 'CONTACTO PRINCIPAL' : 'CONTACTO' }}</p><p v-if="can('supplier_contacts.view')" class="mt-2 text-sm font-medium text-fg">{{ primaryContact?.fullName || 'Sin contacto designado' }}</p><a v-if="primaryContact?.phone || selected.phone" :href="`tel:${primaryContact?.phone || selected.phone}`" class="mt-1 inline-flex text-sm text-accent hover:underline">{{ primaryContact?.phone || selected.phone }}</a><p v-else class="mt-1 text-sm text-muted-fg">Sin teléfono</p></div><div><p class="text-xs font-semibold text-muted-fg">DIRECCIÓN</p><p class="mt-2 text-sm text-fg">{{ selected.address || 'Sin dirección registrada' }}</p><p v-if="selected.district" class="mt-1 text-xs text-muted-fg">{{ selected.district.name }}, {{ selected.municipality?.name }}, {{ selected.department?.name }}</p></div><div><p class="text-xs font-semibold text-muted-fg">ACTIVIDAD</p><p class="mt-2 text-sm text-fg">{{ selected._count?.contacts ?? contacts.length }} contactos</p><p class="mt-1 text-sm text-muted-fg">{{ selected._count?.purchases ?? 0 }} compras asociadas</p></div></section>
        <section v-if="can('supplier_contacts.view')" class="p-5"><div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 class="text-base font-semibold text-fg">Personas de contacto</h3><p class="text-sm text-muted-fg">Compras, despacho, repartidores y responsables del proveedor.</p></div><AppButton v-if="selected.isActive && can('supplier_contacts.create')" variant="outline" :disabled="saving" @click="newContact"><Plus class="h-4 w-4" />Agregar contacto</AppButton></div><div class="mb-4 max-w-sm"><div class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="contactSearch" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg" placeholder="Buscar persona, cargo o teléfono" /></div></div><div class="grid gap-3 md:grid-cols-2"><article v-for="contact in filteredContacts" :key="contact.id" class="flex min-h-44 flex-col rounded-lg border border-border bg-surface p-4 transition hover:border-accent/30 hover:shadow-sm" :class="!contact.isActive && 'opacity-65'"><div class="flex items-start justify-between gap-3"><div class="flex min-w-0 items-start gap-3"><span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-semibold text-accent">{{ initials(contact.fullName) }}</span><div class="min-w-0"><p class="truncate font-semibold text-fg">{{ contact.fullName }}</p><p class="mt-0.5 text-sm text-muted-fg">{{ contact.role }}</p></div></div><div class="flex shrink-0 gap-1"><AppBadge v-if="contact.isPrimary" variant="info"><Star class="mr-1 h-3 w-3" />Principal</AppBadge><AppBadge :variant="contact.isActive ? 'success' : 'neutral'">{{ contact.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></div></div><div class="mt-4 space-y-1.5 text-sm text-muted-fg"><a v-if="contact.phone" :href="`tel:${contact.phone}`" class="flex items-center gap-2 hover:text-accent"><Phone class="h-3.5 w-3.5" />{{ contact.phone }}</a><a v-if="contact.email" :href="`mailto:${contact.email}`" class="flex items-center gap-2 truncate hover:text-accent"><Mail class="h-3.5 w-3.5 shrink-0" />{{ contact.email }}</a><p v-if="!contact.phone && !contact.email">Sin teléfono ni correo registrados.</p></div><p v-if="contact.notes" class="mt-3 line-clamp-2 text-sm text-muted-fg">{{ contact.notes }}</p><div class="mt-auto flex justify-end gap-1 pt-4"><button v-if="can('supplier_contacts.view')" type="button" :disabled="saving" class="grid h-8 w-8 place-items-center rounded-md text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Historial" @click="loadContactHistory(contact)"><History class="h-4 w-4" /></button><button v-if="can('supplier_contacts.update')" type="button" :disabled="saving" class="grid h-8 w-8 place-items-center rounded-md text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Editar contacto" @click="editContact(contact)"><Pencil class="h-4 w-4" /></button><button v-if="canAny(['supplier_contacts.activate','supplier_contacts.deactivate'])" type="button" :disabled="saving" class="grid h-8 w-8 place-items-center rounded-md text-muted-fg hover:bg-surface-secondary hover:text-fg" :title="contact.isActive ? 'Desactivar contacto' : 'Activar contacto'" @click="toggleContact(contact)"><Power class="h-4 w-4" /></button></div></article><div v-if="!filteredContacts.length" class="md:col-span-2 grid min-h-40 place-items-center rounded-lg border border-dashed border-border text-center text-sm text-muted-fg">Aún no hay contactos registrados para este proveedor.</div></div></section>
      </main>
      <main v-else class="grid place-items-center p-10 text-center text-muted-fg"><div><Building2 class="mx-auto h-10 w-10" /><p class="mt-3 font-medium text-fg">Selecciona un proveedor</p></div></main>
    </div>

    <div v-if="showSupplierForm || showContactForm || showHistory || showPurchases" class="fixed inset-0 z-50 flex justify-end bg-black/35" @click.self="closePanel"><aside class="h-full w-full max-w-xl overflow-y-auto bg-surface p-6 shadow-xl"><div class="flex items-start justify-between"><div><AppBadge>{{ showHistory ? 'Auditoría' : showPurchases ? 'Compras' : 'Formulario' }}</AppBadge><h2 class="mt-3 text-xl font-semibold text-fg">{{ showHistory ? `Historial de ${historyTitle}` : showPurchases ? `Compras de ${selected?.name}` : showContactForm ? (editingContactId ? 'Editar contacto' : 'Nuevo contacto') : (editingSupplierId ? 'Editar proveedor' : 'Nuevo proveedor') }}</h2></div><button type="button" class="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-secondary" title="Cerrar" @click="closePanel"><X class="h-5 w-5" /></button></div>
      <form v-if="showSupplierForm" class="mt-6 grid gap-4 md:grid-cols-2" @submit.prevent="saveSupplier"><AppInput v-model="supplierForm.code" label="Código" required /><AppInput v-model="supplierForm.name" label="Proveedor" required /><label class="text-sm font-medium text-fg">País<select v-model="supplierForm.countryId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" @change="clearLocationWhenForeign"><option v-for="country in countries" :key="country.id" :value="String(country.id)">{{ country.name }}</option></select></label><div v-if="!supplierIsNational" class="flex items-end pb-2 text-sm text-muted-fg">La ubicación nacional se solicita solo para El Salvador.</div><NationalLocationFields v-if="supplierIsNational" :departments="geography.departments" :department-id="supplierForm.departmentId" :municipality-id="supplierForm.municipalityId" :district-id="supplierForm.districtId" @update:department-id="supplierForm.departmentId = $event" @update:municipality-id="supplierForm.municipalityId = $event" @update:district-id="supplierForm.districtId = $event" /><AppInput v-model="supplierForm.phone" label="Teléfono" /><AppInput v-model="supplierForm.email" type="email" label="Correo" /><AppInput v-model="supplierForm.website" label="Sitio web" /><AppInput v-model="supplierForm.address" label="Dirección" class="md:col-span-2" /><div class="flex justify-end gap-2 md:col-span-2"><AppButton variant="outline" type="button" @click="closePanel">Cancelar</AppButton><AppButton type="submit" :disabled="saving">Guardar</AppButton></div></form>
      <form v-else-if="showContactForm" class="mt-6 grid gap-4" @submit.prevent="saveContact"><AppInput v-model="contactForm.fullName" label="Nombre completo" required /><label class="text-sm font-medium text-fg">Responsabilidad<select v-model="contactForm.role" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option>General</option><option>Compras</option><option>Repartidor</option><option>Despacho</option><option>Facturación</option><option>Gerencia</option></select></label><label class="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-fg"><input v-model="contactForm.isPrimary" type="checkbox" class="h-4 w-4 rounded border-border text-accent focus:ring-accent" />Contacto principal para este proveedor</label><AppInput v-model="contactForm.phone" label="Teléfono" /><AppInput v-model="contactForm.email" type="email" label="Correo" /><label class="text-sm font-medium text-fg">Notas<textarea v-model="contactForm.notes" class="mt-1.5 min-h-24 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" placeholder="Horario, ruta de reparto o indicaciones útiles" maxlength="500" /></label><div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="closePanel">Cancelar</AppButton><AppButton type="submit" :disabled="saving">Guardar</AppButton></div></form>
      <div v-else-if="showHistory" class="mt-6 divide-y divide-border border-y border-border"><div v-for="item in history" :key="item.id" class="py-4"><div class="flex items-center justify-between"><AppBadge>{{ item.action }}</AppBadge><span class="text-xs text-muted-fg">{{ new Date(item.createdAt).toLocaleString('es-SV') }}</span></div><p class="mt-2 text-sm font-medium text-fg">{{ item.user?.username ?? 'Sistema' }}</p></div><p v-if="!history.length" class="py-10 text-center text-sm text-muted-fg">Sin cambios registrados.</p></div>
      <div v-else class="mt-6 overflow-x-auto rounded-lg border border-border"><table class="w-full min-w-[560px] text-left text-sm"><thead class="border-b border-border bg-surface-secondary text-xs uppercase text-muted-fg"><tr><th class="px-4 py-3">Documento</th><th class="px-4 py-3">Sucursal</th><th class="px-4 py-3">Fecha</th><th class="px-4 py-3">Artículos</th><th class="px-4 py-3 text-right">Total</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="purchase in purchases" :key="purchase.id"><td class="px-4 py-3 font-medium text-fg">{{ purchase.documentNumber }}<p class="mt-0.5 text-xs text-muted-fg">{{ purchase.status }}</p></td><td class="px-4 py-3 text-muted-fg">{{ purchase.branch.name }}</td><td class="px-4 py-3 text-muted-fg">{{ new Date(purchase.createdAt).toLocaleDateString('es-SV') }}</td><td class="px-4 py-3 text-muted-fg">{{ purchase._count.items }}</td><td class="px-4 py-3 text-right font-medium text-fg">{{ money(purchase.total) }}</td></tr><tr v-if="!purchases.length"><td colspan="5" class="px-4 py-10 text-center text-muted-fg">No hay compras registradas.</td></tr></tbody></table></div>
    </aside></div>
  </AdminLayout>
</template>
