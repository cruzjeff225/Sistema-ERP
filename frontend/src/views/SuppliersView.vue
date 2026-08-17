<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Building2, History, Pencil, Plus, Power, RefreshCw, Search, UserRound, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { usePermissions } from "../composables/usePermissions";
import { http } from "../services/http.service";

type Country = { id: number; name: string; isoCode: string };
type Contact = { id: number; supplierId: number; fullName: string; phone?: string; email?: string; isActive: boolean };
type Supplier = { id: number; code: string; name: string; countryId: number; country: Country; address?: string; phone?: string; email?: string; website?: string; isActive: boolean; _count?: { contacts: number; purchases: number } };

const { can, canAny } = usePermissions();
const suppliers = ref<Supplier[]>([]);
const countries = ref<Country[]>([]);
const contacts = ref<Contact[]>([]);
const history = ref<any[]>([]);
const selectedId = ref<number | null>(null);
const search = ref("");
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const showSupplierForm = ref(false);
const showContactForm = ref(false);
const showHistory = ref(false);
const editingSupplierId = ref<number | null>(null);
const editingContactId = ref<number | null>(null);

const supplierForm = reactive({ code: "", name: "", countryId: "", address: "", phone: "", email: "", website: "" });
const contactForm = reactive({ fullName: "", phone: "", email: "" });
const selected = computed(() => suppliers.value.find((supplier) => supplier.id === selectedId.value) ?? null);
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return term ? suppliers.value.filter((supplier) => `${supplier.code} ${supplier.name} ${supplier.country.name}`.toLowerCase().includes(term)) : suppliers.value;
});

function clean(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "" && entry !== undefined));
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [supplierResponse, countryResponse] = await Promise.all([http.get("/suppliers"), http.get("/supplier-catalogs/countries")]);
    suppliers.value = supplierResponse.data.data;
    countries.value = countryResponse.data.data;
    if (!selectedId.value && suppliers.value[0]) await selectSupplier(suppliers.value[0].id);
    if (selectedId.value && !suppliers.value.some((row) => row.id === selectedId.value)) selectedId.value = null;
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message ?? "No se pudieron cargar los proveedores";
  } finally {
    loading.value = false;
  }
}

async function selectSupplier(id: number) {
  selectedId.value = id;
  showHistory.value = false;
  const response = await http.get("/supplier-contacts", { params: { supplierId: id } });
  contacts.value = response.data.data;
}

function newSupplier() {
  editingSupplierId.value = null;
  Object.assign(supplierForm, { code: "", name: "", countryId: countries.value[0] ? String(countries.value[0].id) : "", address: "", phone: "", email: "", website: "" });
  showSupplierForm.value = true;
}

function editSupplier() {
  if (!selected.value) return;
  editingSupplierId.value = selected.value.id;
  Object.assign(supplierForm, { code: selected.value.code, name: selected.value.name, countryId: String(selected.value.countryId), address: selected.value.address ?? "", phone: selected.value.phone ?? "", email: selected.value.email ?? "", website: selected.value.website ?? "" });
  showSupplierForm.value = true;
}

async function saveSupplier() {
  saving.value = true;
  errorMessage.value = "";
  try {
    const payload = clean({ ...supplierForm, countryId: Number(supplierForm.countryId) });
    const response = editingSupplierId.value ? await http.patch(`/suppliers/${editingSupplierId.value}`, payload) : await http.post("/suppliers", payload);
    successMessage.value = editingSupplierId.value ? "Proveedor actualizado" : "Proveedor registrado";
    showSupplierForm.value = false;
    selectedId.value = response.data.data.id;
    await load();
    await selectSupplier(response.data.data.id);
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message ?? "No se pudo guardar el proveedor";
  } finally {
    saving.value = false;
  }
}

async function toggleSupplier() {
  if (!selected.value) return;
  try {
    await http.patch(`/suppliers/${selected.value.id}/status`, { isActive: !selected.value.isActive });
    successMessage.value = selected.value.isActive ? "Proveedor desactivado" : "Proveedor activado";
    await load();
  } catch (error: any) { errorMessage.value = error.response?.data?.message ?? "No se pudo actualizar el estado"; }
}

function newContact() {
  editingContactId.value = null;
  Object.assign(contactForm, { fullName: "", phone: "", email: "" });
  showContactForm.value = true;
}

function editContact(contact: Contact) {
  editingContactId.value = contact.id;
  Object.assign(contactForm, { fullName: contact.fullName, phone: contact.phone ?? "", email: contact.email ?? "" });
  showContactForm.value = true;
}

async function saveContact() {
  if (!selected.value) return;
  saving.value = true;
  try {
    const payload = clean({ ...contactForm, supplierId: selected.value.id });
    if (editingContactId.value) await http.patch(`/supplier-contacts/${editingContactId.value}`, payload);
    else await http.post("/supplier-contacts", payload);
    successMessage.value = editingContactId.value ? "Contacto actualizado" : "Contacto registrado";
    showContactForm.value = false;
    await selectSupplier(selected.value.id);
    await load();
  } catch (error: any) { errorMessage.value = error.response?.data?.message ?? "No se pudo guardar el contacto"; }
  finally { saving.value = false; }
}

async function toggleContact(contact: Contact) {
  await http.patch(`/supplier-contacts/${contact.id}/status`, { isActive: !contact.isActive });
  if (selected.value) await selectSupplier(selected.value.id);
}

async function loadHistory() {
  if (!selected.value) return;
  const response = await http.get(`/suppliers/${selected.value.id}/history`);
  history.value = response.data.data;
  showHistory.value = true;
}

onMounted(load);
</script>

<template>
  <AdminLayout title="Proveedores">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-medium text-accent">Abastecimiento</p><h1 class="page-title mt-1">Proveedores</h1><p class="page-subtitle">Directorio comercial y personas de contacto.</p></div><div class="flex gap-2"><AppButton variant="outline" :disabled="loading" title="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton><AppButton v-if="can('suppliers.create')" @click="newSupplier"><Plus class="h-4 w-4" />Proveedor</AppButton></div></div>
    <p v-if="errorMessage" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ successMessage }}</p>

    <div class="grid overflow-hidden rounded-lg border border-border bg-surface lg:min-h-[620px] lg:grid-cols-[320px_1fr]">
      <aside class="border-b border-border lg:border-b-0 lg:border-r">
        <div class="border-b border-border p-3"><div class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="search" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm" placeholder="Buscar proveedor" /></div></div>
        <div class="max-h-[300px] overflow-y-auto p-2 lg:max-h-[560px]"><button v-for="supplier in filtered" :key="supplier.id" class="mb-1 w-full rounded-lg px-3 py-3 text-left transition" :class="selectedId === supplier.id ? 'bg-accent/10 text-fg' : 'hover:bg-surface-secondary'" @click="selectSupplier(supplier.id)"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><p class="truncate font-semibold">{{ supplier.name }}</p><p class="mt-0.5 truncate text-xs text-muted-fg">{{ supplier.code }} / {{ supplier.country.name }}</p></div><span class="mt-1 h-2 w-2 rounded-full" :class="supplier.isActive ? 'bg-success' : 'bg-muted-fg'" /></div></button><p v-if="!filtered.length" class="px-3 py-10 text-center text-sm text-muted-fg">Sin proveedores.</p></div>
      </aside>

      <main v-if="selected" class="min-w-0">
        <header class="flex flex-wrap items-start justify-between gap-4 border-b border-border p-4 sm:p-5"><div class="flex min-w-0 gap-3"><div class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><Building2 class="h-5 w-5" /></div><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h2 class="truncate text-xl font-semibold text-fg">{{ selected.name }}</h2><AppBadge :variant="selected.isActive ? 'success' : 'neutral'">{{ selected.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></div><p class="text-sm text-muted-fg">{{ selected.code }} / {{ selected.country.name }}</p></div></div><div class="flex w-full flex-wrap gap-2 sm:w-auto"><AppButton variant="outline" @click="loadHistory"><History class="h-4 w-4" />Historial</AppButton><AppButton v-if="can('suppliers.update')" variant="outline" @click="editSupplier"><Pencil class="h-4 w-4" />Editar</AppButton><AppButton v-if="canAny(['suppliers.activate','suppliers.deactivate'])" variant="outline" @click="toggleSupplier"><Power class="h-4 w-4" />{{ selected.isActive ? 'Desactivar' : 'Activar' }}</AppButton></div></header>
        <section class="grid gap-5 border-b border-border p-5 md:grid-cols-3"><div><p class="text-xs font-semibold uppercase text-muted-fg">Contacto principal</p><p class="mt-2 text-sm text-fg">{{ selected.phone || 'Sin telefono' }}</p><p class="text-sm text-muted-fg">{{ selected.email || 'Sin correo' }}</p></div><div><p class="text-xs font-semibold uppercase text-muted-fg">Direccion</p><p class="mt-2 text-sm text-fg">{{ selected.address || 'Sin direccion registrada' }}</p></div><div><p class="text-xs font-semibold uppercase text-muted-fg">Actividad</p><p class="mt-2 text-sm text-fg">{{ selected._count?.contacts ?? contacts.length }} contactos</p><p class="text-sm text-muted-fg">{{ selected._count?.purchases ?? 0 }} compras asociadas</p></div></section>
        <section class="p-4 sm:p-5"><div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 class="text-base font-semibold text-fg">Contactos</h3><p class="text-sm text-muted-fg">Personas disponibles para operaciones comerciales.</p></div><AppButton v-if="selected.isActive && can('supplier_contacts.create')" variant="outline" @click="newContact"><Plus class="h-4 w-4" />Contacto</AppButton></div><div class="overflow-x-auto rounded-lg border border-border"><table class="w-full min-w-[680px] text-left text-sm"><thead class="border-b border-border bg-surface-secondary text-xs uppercase text-muted-fg"><tr><th class="px-4 py-3">Nombre</th><th class="px-4 py-3">Telefono</th><th class="px-4 py-3">Correo</th><th class="px-4 py-3">Estado</th><th class="w-24 px-4 py-3"></th></tr></thead><tbody class="divide-y divide-border"><tr v-for="contact in contacts" :key="contact.id"><td class="px-4 py-3 font-medium text-fg"><span class="inline-flex items-center gap-2"><UserRound class="h-4 w-4 text-muted-fg" />{{ contact.fullName }}</span></td><td class="px-4 py-3 text-muted-fg">{{ contact.phone || '-' }}</td><td class="px-4 py-3 text-muted-fg">{{ contact.email || '-' }}</td><td class="px-4 py-3"><AppBadge :variant="contact.isActive ? 'success' : 'neutral'">{{ contact.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></td><td class="px-4 py-3"><div class="flex gap-1"><button v-if="can('supplier_contacts.update')" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Editar" @click="editContact(contact)"><Pencil class="h-4 w-4" /></button><button v-if="canAny(['supplier_contacts.activate','supplier_contacts.deactivate'])" class="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-secondary" title="Cambiar estado" @click="toggleContact(contact)"><Power class="h-4 w-4" /></button></div></td></tr><tr v-if="!contacts.length"><td colspan="5" class="px-4 py-10 text-center text-muted-fg">Aun no hay contactos asociados.</td></tr></tbody></table></div></section>
      </main>
      <main v-else class="grid place-items-center p-10 text-center text-muted-fg"><div><Building2 class="mx-auto h-10 w-10" /><p class="mt-3 font-medium text-fg">Selecciona un proveedor</p></div></main>
    </div>

    <div v-if="showSupplierForm || showContactForm || showHistory" class="fixed inset-0 z-50 flex justify-end bg-black/35" @click.self="showSupplierForm = showContactForm = showHistory = false"><aside class="h-full w-full max-w-xl overflow-y-auto bg-surface p-6 shadow-xl"><div class="flex items-start justify-between"><div><AppBadge>{{ showHistory ? 'Auditoria' : 'Formulario' }}</AppBadge><h2 class="mt-3 text-xl font-semibold text-fg">{{ showHistory ? `Historial de ${selected?.name}` : showContactForm ? (editingContactId ? 'Editar contacto' : 'Nuevo contacto') : (editingSupplierId ? 'Editar proveedor' : 'Nuevo proveedor') }}</h2></div><button class="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-secondary" title="Cerrar" @click="showSupplierForm = showContactForm = showHistory = false"><X class="h-5 w-5" /></button></div>
      <form v-if="showSupplierForm" class="mt-6 grid gap-4 md:grid-cols-2" @submit.prevent="saveSupplier"><AppInput v-model="supplierForm.code" label="Codigo" required /><AppInput v-model="supplierForm.name" label="Proveedor" required /><label class="text-sm font-medium text-fg">Pais<select v-model="supplierForm.countryId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3"><option v-for="country in countries" :key="country.id" :value="String(country.id)">{{ country.name }}</option></select></label><AppInput v-model="supplierForm.phone" label="Telefono" /><AppInput v-model="supplierForm.email" type="email" label="Correo" /><AppInput v-model="supplierForm.website" label="Sitio web" /><AppInput v-model="supplierForm.address" label="Direccion" class="md:col-span-2" /><div class="flex justify-end gap-2 md:col-span-2"><AppButton variant="outline" type="button" @click="showSupplierForm = false">Cancelar</AppButton><AppButton type="submit" :disabled="saving">Guardar</AppButton></div></form>
      <form v-if="showContactForm" class="mt-6 grid gap-4" @submit.prevent="saveContact"><AppInput v-model="contactForm.fullName" label="Nombre completo" required /><AppInput v-model="contactForm.phone" label="Telefono" /><AppInput v-model="contactForm.email" type="email" label="Correo" /><div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="showContactForm = false">Cancelar</AppButton><AppButton type="submit" :disabled="saving">Guardar</AppButton></div></form>
      <div v-if="showHistory" class="mt-6 divide-y divide-border border-y border-border"><div v-for="item in history" :key="item.id" class="py-4"><div class="flex items-center justify-between"><AppBadge>{{ item.action }}</AppBadge><span class="text-xs text-muted-fg">{{ new Date(item.createdAt).toLocaleString('es-SV') }}</span></div><p class="mt-2 text-sm font-medium text-fg">{{ item.user?.username ?? 'Sistema' }}</p></div><p v-if="!history.length" class="py-10 text-center text-sm text-muted-fg">Sin cambios registrados.</p></div>
    </aside></div>
  </AdminLayout>
</template>

