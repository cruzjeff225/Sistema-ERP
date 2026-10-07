<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Mail, MapPin, Pencil, Phone, Plus, Power, RefreshCw, Search, UserRound, X } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import SalesNav from '../components/sales/SalesNav.vue';
import AppBadge from '../components/base/AppBadge.vue';
import AppButton from '../components/base/AppButton.vue';
import AppInput from '../components/base/AppInput.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import TrashButton from '../components/admin/TrashButton.vue';
import NationalLocationFields from '../components/forms/NationalLocationFields.vue';
import { usePermissions } from '../composables/usePermissions';
import { useUnsavedChanges } from '../composables/useUnsavedChanges';
import { activeCompanyId } from '../services/company-context';
import { http } from '../services/http.service';
import { getApiErrorMessage } from '../utils/api-error';
import { customerFormPayload, type CustomerForm } from '../utils/customer-form';

type Country = { id: number; name: string; isoCode: string };
type Geography = { departments: Array<{ id: number; name: string; municipalities: Array<{ id: number; name: string; districts: Array<{ id: number; name: string }> }> }> };
type Customer = {
  id: number; name: string; document: string | null; countryId: number; departmentId: number | null; municipalityId: number | null; districtId: number | null;
  phone: string | null; email: string | null; address: string | null; isActive: boolean; country: Country;
  department: { id: number; name: string } | null; municipality: { id: number; name: string } | null; district: { id: number; name: string } | null;
};
type CompanyContext = { companyId: number; epoch: number };
const { can } = usePermissions();
let mounted = true, epoch = 0, loadVersion = 0, mutationVersion = 0;
const customers = ref<Customer[]>([]), countries = ref<Country[]>([]), geography = ref<Geography>({ departments: [] });
const selected = ref<Customer | null>(null);
const meta = ref({ total: 0, page: 1, totalPages: 0 });
const loading = ref(false), saving = ref(false), editorOpen = ref(false), editingId = ref<number | null>(null);
const search = ref(''), appliedSearch = ref(''), status = ref<'active' | 'all' | 'inactive'>('active');
const statusFilters = [{ value: 'active', label: 'Activos' }, { value: 'all', label: 'Todos' }, { value: 'inactive', label: 'Inactivos' }] as const;
const errorMessage = ref(''), formError = ref(''), successMessage = ref('');
const editorDialog = ref<HTMLDialogElement | null>(null);
const discardChanges = ref(false);
const statusAction = ref<{ id: number; name: string; isActive: boolean } | null>(null);
const form = reactive<CustomerForm>({ name: '', document: '', phone: '', email: '', address: '', countryId: '', departmentId: '', municipalityId: '', districtId: '' });
let initialForm = '';
const isEditing = computed(() => editingId.value !== null);
const isNational = computed(() => countries.value.find(country => country.id === Number(form.countryId))?.isoCode === 'SV');
const dirty = () => editorOpen.value && JSON.stringify(form) !== initialForm;
const { leaving, resolveLeave } = useUnsavedChanges(dirty, () => saving.value);
const context = (): CompanyContext | null => activeCompanyId.value ? { companyId: activeCompanyId.value, epoch } : null;
const current = (value: CompanyContext) => mounted && value.epoch === epoch && value.companyId === activeCompanyId.value;
const config = (value: CompanyContext) => ({ headers: { 'X-Company-Id': String(value.companyId) } });
const canEdit = () => can('customers.update') || can('customers.create');

async function load(page = meta.value.page, preferredId?: number) {
  const scope = context(); if (!scope || !can('customers.view')) return;
  const token = ++loadVersion;
  loading.value = true; errorMessage.value = '';
  try {
    const response = await http.get('/customers', { ...config(scope), params: { page, limit: 25, search: appliedSearch.value || undefined, status: status.value } });
    if (!current(scope) || token !== loadVersion) return;
    const data = response.data.data;
    if (data.total && page > data.totalPages) { await load(data.totalPages, preferredId); return; }
    customers.value = data.items; meta.value = { total: data.total, page: data.page, totalPages: data.totalPages };
    selected.value = customers.value.find(customer => customer.id === (preferredId ?? selected.value?.id)) ?? customers.value[0] ?? null;
  } catch (error) { if (current(scope) && token === loadVersion) errorMessage.value = getApiErrorMessage(error, 'No se pudieron cargar los clientes.'); }
  finally { if (current(scope) && token === loadVersion) loading.value = false; }
}
async function loadCatalogs(scope: CompanyContext) {
  if (!canEdit()) return;
  try {
    const [countryResponse, geographyResponse] = await Promise.all([http.get('/catalogs/countries', config(scope)), http.get('/catalogs/geography', config(scope))]);
    if (!current(scope)) return;
    countries.value = countryResponse.data.data; geography.value = geographyResponse.data.data;
  } catch (error) { if (current(scope)) errorMessage.value = getApiErrorMessage(error, 'No se pudieron cargar los datos de ubicación.'); }
}
function selectCustomer(customer: Customer) { if (!saving.value && !editorOpen.value && !loading.value) selected.value = customer; }
function findCustomers() { if (saving.value || editorOpen.value || loading.value) return; appliedSearch.value = search.value.trim(); successMessage.value = ''; void load(1); }
function clearSearch() { if (saving.value || editorOpen.value || loading.value) return; search.value = ''; appliedSearch.value = ''; successMessage.value = ''; void load(1); }
function changeStatus(value: 'active' | 'all' | 'inactive') { if (saving.value || editorOpen.value || loading.value || status.value === value) return; status.value = value; successMessage.value = ''; void load(1); }

function resetForm(customer?: Customer) {
  editingId.value = customer?.id ?? null;
  Object.assign(form, {
    name: customer?.name ?? '', document: customer?.document ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '', address: customer?.address ?? '',
    countryId: customer ? String(customer.countryId) : String(countries.value.find(country => country.isoCode === 'SV')?.id ?? ''),
    departmentId: customer?.departmentId ? String(customer.departmentId) : '', municipalityId: customer?.municipalityId ? String(customer.municipalityId) : '', districtId: customer?.districtId ? String(customer.districtId) : '',
  });
  initialForm = JSON.stringify(form);
}
async function openEditor(customer?: Customer) {
  if (saving.value || loading.value || editorOpen.value || !can(customer ? 'customers.update' : 'customers.create')) return;
  const scope = context(); if (!scope) return;
  if (!countries.value.length) await loadCatalogs(scope);
  if (!current(scope) || !countries.value.length) return;
  formError.value = ''; successMessage.value = ''; errorMessage.value = ''; resetForm(customer); editorOpen.value = true;
}
function closeEditor(force = false) {
  if (saving.value && !force) return;
  if (!force && dirty()) { discardChanges.value = true; return; }
  editorDialog.value?.close(); editorOpen.value = false; discardChanges.value = false; editingId.value = null; formError.value = '';
}
function clearLocation() { form.departmentId = ''; form.municipalityId = ''; form.districtId = ''; }
watch(editorOpen, async open => { if (open) { await nextTick(); editorDialog.value?.showModal(); } });

async function saveCustomer() {
  const scope = context(); if (!scope || saving.value || !can(isEditing.value ? 'customers.update' : 'customers.create')) return;
  let payload: ReturnType<typeof customerFormPayload>;
  try { payload = customerFormPayload(form, isNational.value); }
  catch (error) { formError.value = (error as Error).message; return; }
  const id = editingId.value, token = ++mutationVersion;
  saving.value = true; formError.value = ''; errorMessage.value = '';
  try {
    const response = id ? await http.patch('/customers/' + id, payload, config(scope)) : await http.post('/customers', payload, config(scope));
    if (!current(scope) || token !== mutationVersion) return;
    const saved: Customer = response.data.data;
    closeEditor(true);
    if (!id || status.value !== 'all' && saved.isActive !== (status.value === 'active')) {
      status.value = saved.isActive ? 'active' : 'inactive'; search.value = saved.document || saved.name; appliedSearch.value = search.value;
    }
    await load(id ? meta.value.page : 1, saved.id);
    if (!current(scope) || token !== mutationVersion) return;
    if (!customers.value.some(customer => customer.id === saved.id)) { search.value = saved.document || saved.name; appliedSearch.value = search.value; await load(1, saved.id); }
    if (current(scope) && token === mutationVersion) successMessage.value = id ? 'Cliente actualizado.' : 'Cliente registrado.';
  } catch (error) { if (current(scope) && token === mutationVersion) formError.value = getApiErrorMessage(error, 'No se pudo guardar el cliente.'); }
  finally { if (current(scope) && token === mutationVersion) saving.value = false; }
}
function requestStatusChange() {
  const customer = selected.value;
  if (!customer || saving.value || !can(customer.isActive ? 'customers.deactivate' : 'customers.activate')) return;
  errorMessage.value = ''; statusAction.value = { id: customer.id, name: customer.name, isActive: !customer.isActive };
}
async function toggleStatus() {
  const scope = context(), action = statusAction.value;
  if (!scope || !action || saving.value || !can(action.isActive ? 'customers.activate' : 'customers.deactivate')) return;
  const token = ++mutationVersion; saving.value = true;
  try {
    await http.patch('/customers/' + action.id + '/status', { isActive: action.isActive }, config(scope));
    if (!current(scope) || token !== mutationVersion) return;
    statusAction.value = null; await load();
    if (current(scope) && token === mutationVersion) successMessage.value = action.isActive ? 'Cliente activado.' : 'Cliente desactivado.';
  } catch (error) { if (current(scope) && token === mutationVersion) errorMessage.value = getApiErrorMessage(error, 'No se pudo cambiar el estado del cliente.'); }
  finally { if (current(scope) && token === mutationVersion) saving.value = false; }
}
watch(activeCompanyId, () => {
  ++epoch; ++loadVersion; ++mutationVersion;
  resolveLeave(false); closeEditor(true); statusAction.value = null;
  customers.value = []; countries.value = []; geography.value = { departments: [] }; selected.value = null; meta.value = { total: 0, page: 1, totalPages: 0 };
  search.value = ''; appliedSearch.value = ''; status.value = 'active'; loading.value = false; saving.value = false; errorMessage.value = ''; successMessage.value = '';
  const scope = context(); if (scope) { void load(1); void loadCatalogs(scope); }
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { mounted = false; ++epoch; ++loadVersion; ++mutationVersion; });
</script>

<template>
  <AdminLayout title="Clientes">
    <div class="mx-auto max-w-[1440px] space-y-6">
      <SalesNav />
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div><h1 class="text-3xl font-semibold tracking-tight">Clientes</h1><p class="mt-2 text-sm leading-6 text-muted-fg">Encuentra a tu cliente y mantén sus datos al día.</p></div>
        <div class="flex flex-wrap gap-2"><AppButton variant="outline" :disabled="loading || saving || editorOpen" @click="load()"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" />Actualizar</AppButton><AppButton v-if="can('customers.create')" :disabled="loading || saving || editorOpen" @click="openEditor()"><Plus class="h-4 w-4" />Nuevo cliente</AppButton></div>
      </header>
      <p v-if="errorMessage" role="alert" class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ errorMessage }}</p>
      <p v-if="successMessage" role="status" class="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{{ successMessage }}</p>
      <div class="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside aria-label="Directorio de clientes" class="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-surface">
          <form class="space-y-4 border-b border-border/70 p-4" @submit.prevent="findCustomers">
            <div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold">Directorio</h2><span class="text-xs tabular-nums text-muted-fg">{{ meta.total }} clientes</span></div>
            <nav aria-label="Estado de clientes" class="flex w-fit flex-wrap gap-1 rounded-xl bg-surface-secondary p-1"><button v-for="filter in statusFilters" :key="filter.value" type="button" :aria-pressed="status === filter.value" :disabled="loading || saving || editorOpen" class="min-h-9 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50" :class="status === filter.value ? 'bg-surface text-fg shadow-sm ring-1 ring-border/60' : 'text-muted-fg hover:text-fg'" @click="changeStatus(filter.value)">{{ filter.label }}</button></nav>
            <div class="flex items-center gap-2"><input v-model="search" type="search" aria-label="Buscar clientes por nombre, documento o contacto" placeholder="Nombre, documento o contacto" maxlength="100" :disabled="saving || editorOpen" class="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm" /><AppButton type="submit" variant="outline" :disabled="loading || saving || editorOpen" aria-label="Buscar clientes"><Search class="h-4 w-4" /></AppButton></div>
            <button v-if="search || appliedSearch" type="button" class="text-sm font-medium text-accent" :disabled="loading || saving || editorOpen" @click="clearSearch">Limpiar búsqueda</button>
          </form>
          <p v-if="loading" role="status" class="px-5 py-10 text-sm text-muted-fg">Buscando clientes…</p>
          <div v-else class="scrollbar-thin max-h-[280px] overflow-y-auto p-2 lg:max-h-[580px]">
            <button v-for="customer in customers" :key="customer.id" type="button" :aria-pressed="selected?.id === customer.id" :disabled="saving || editorOpen" class="mb-1 w-full rounded-xl border px-3 py-3 text-left transition-colors" :class="selected?.id === customer.id ? 'border-accent/25 bg-accent-soft' : 'border-transparent hover:bg-surface-secondary'" @click="selectCustomer(customer)">
              <span class="flex items-start justify-between gap-2"><span class="min-w-0 break-words font-semibold">{{ customer.name }}</span><span v-if="!customer.isActive" class="shrink-0 text-xs text-muted-fg">Inactivo</span></span>
              <span class="mt-2 block text-xs text-muted-fg">{{ customer.document || customer.country.name }}</span><span v-if="customer.phone" class="mt-1 block text-xs text-muted-fg">{{ customer.phone }}</span>
            </button>
            <p v-if="!customers.length" class="px-4 py-10 text-center text-sm text-muted-fg">{{ appliedSearch ? 'No hay clientes con esa búsqueda.' : status === 'inactive' ? 'No hay clientes inactivos.' : status === 'active' ? 'No hay clientes activos.' : 'Aún no hay clientes registrados.' }}</p>
          </div>
          <nav v-if="meta.totalPages > 1" aria-label="Páginas de clientes" class="flex items-center justify-between border-t border-border/70 px-4 py-3"><button type="button" class="icon-button" aria-label="Página anterior" :disabled="loading || saving || editorOpen || meta.page <= 1" @click="load(meta.page - 1)"><ChevronLeft class="h-4 w-4" /></button><span class="text-xs tabular-nums text-muted-fg">{{ meta.page }} / {{ meta.totalPages }}</span><button type="button" class="icon-button" aria-label="Página siguiente" :disabled="loading || saving || editorOpen || meta.page >= meta.totalPages" @click="load(meta.page + 1)"><ChevronRight class="h-4 w-4" /></button></nav>
        </aside>
        <section v-if="selected && !loading" aria-label="Ficha del cliente" class="min-w-0 rounded-2xl border border-border/70 bg-surface">
          <header class="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 p-5 sm:p-6">
            <div class="min-w-0"><div class="flex flex-wrap items-center gap-3"><h2 class="break-words text-xl font-semibold tracking-tight">{{ selected.name }}</h2><AppBadge :variant="selected.isActive ? 'success' : 'neutral'">{{ selected.isActive ? 'Activo' : 'Inactivo' }}</AppBadge></div><p class="mt-2 text-sm text-muted-fg">{{ selected.document || 'Sin documento registrado' }}</p></div>
            <div class="flex flex-wrap items-center gap-2"><AppButton v-if="can('customers.update')" variant="outline" :disabled="saving || editorOpen" @click="openEditor(selected)"><Pencil class="h-4 w-4" />Editar cliente</AppButton><details v-if="can(selected.isActive ? 'customers.deactivate' : 'customers.activate') || can('trash.delete')" :key="selected.id" class="relative"><summary class="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-muted-fg">Más acciones</summary><div class="absolute right-0 z-20 mt-2 flex min-w-52 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-subtle"><AppButton v-if="can(selected.isActive ? 'customers.deactivate' : 'customers.activate')" variant="outline" :disabled="saving || editorOpen" @click="requestStatusChange"><Power class="h-4 w-4" />{{ selected.isActive ? 'Desactivar cliente' : 'Activar cliente' }}</AppButton><TrashButton entity="customers" :record-id="selected.id" :label="selected.name" :disabled="saving || editorOpen" @deleted="load()" /></div></details></div>
          </header>
          <div class="grid gap-8 p-5 sm:p-6 xl:grid-cols-2">
            <section><h3 class="text-sm font-semibold">Contacto</h3><div class="mt-4 space-y-4"><a v-if="selected.phone" :href="'tel:' + selected.phone.replace(/[^\d+]/g, '')" class="flex min-w-0 items-center gap-3 text-sm text-fg hover:text-accent"><Phone class="h-4 w-4 shrink-0 text-muted-fg" />{{ selected.phone }}</a><p v-else class="text-sm text-muted-fg">Sin teléfono registrado.</p><a v-if="selected.email" :href="'mailto:' + selected.email" class="flex min-w-0 items-center gap-3 break-all text-sm text-fg hover:text-accent"><Mail class="h-4 w-4 shrink-0 text-muted-fg" />{{ selected.email }}</a><p v-else class="text-sm text-muted-fg">Sin correo registrado.</p></div></section>
            <section><h3 class="text-sm font-semibold">Ubicación</h3><p class="mt-4 whitespace-pre-wrap break-words text-sm leading-6">{{ selected.address || 'Sin dirección registrada.' }}</p><p v-if="selected.district" class="mt-3 flex items-start gap-2 text-sm leading-6 text-muted-fg"><MapPin class="mt-1 h-4 w-4 shrink-0" /><span>{{ selected.district.name }}, {{ selected.municipality?.name }}, {{ selected.department?.name }}</span></p><p class="mt-2 text-sm text-muted-fg">{{ selected.country.name }}</p></section>
          </div>
        </section>
        <section v-else aria-label="Ficha del cliente" class="flex min-h-[360px] min-w-0 flex-col items-center justify-center gap-4 rounded-2xl border border-border/70 bg-surface p-8 text-center"><UserRound class="h-9 w-9 text-muted-fg" /><p class="text-sm text-muted-fg">{{ loading ? 'Cargando directorio…' : appliedSearch ? 'Prueba otro nombre, documento o contacto.' : status === 'inactive' ? 'Consulta el directorio completo para encontrar otros clientes.' : 'Registra un cliente para comenzar.' }}</p><AppButton v-if="!loading && !appliedSearch && status === 'inactive'" variant="outline" :disabled="saving" @click="changeStatus('all')">Ver todos los clientes</AppButton><AppButton v-else-if="!loading && !appliedSearch && can('customers.create')" :disabled="saving" @click="openEditor()"><Plus class="h-4 w-4" />Nuevo cliente</AppButton></section>
      </div>
    </div>
    <dialog v-if="editorOpen" ref="editorDialog" aria-labelledby="customer-editor-title" class="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-2xl border-0 bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/45" @cancel.prevent="closeEditor()">
      <form class="flex h-full min-h-0 flex-col" @submit.prevent="saveCustomer">
        <header class="flex items-start justify-between gap-4 border-b border-border/70 p-5 sm:p-6"><div><h2 id="customer-editor-title" class="text-xl font-semibold">{{ isEditing ? 'Editar cliente' : 'Nuevo cliente' }}</h2><p class="mt-2 text-sm text-muted-fg">Datos de identificación, contacto y ubicación.</p></div><button type="button" class="icon-button" aria-label="Cerrar formulario" :disabled="saving" @click="closeEditor()"><X class="h-5 w-5" /></button></header>
        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          <p v-if="formError" role="alert" class="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{{ formError }}</p>
          <fieldset :disabled="saving" class="space-y-7">
            <section><h3 class="mb-4 text-sm font-semibold">Identificación y contacto</h3><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium sm:col-span-2">Nombre o razón social<input v-model="form.name" required autofocus maxlength="150" class="field-control" autocomplete="organization" /></label><AppInput v-model="form.document" label="Documento (opcional)" maxlength="60" /><AppInput v-model="form.phone" type="tel" label="Teléfono (opcional)" maxlength="30" /><AppInput v-model="form.email" class="sm:col-span-2" type="email" label="Correo (opcional)" maxlength="254" /></div></section>
            <section class="border-t border-border/70 pt-6"><h3 class="mb-4 text-sm font-semibold">Ubicación del cliente</h3><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium sm:col-span-2">País<select v-model="form.countryId" required class="field-control" @change="clearLocation"><option value="" disabled>Selecciona un país</option><option v-for="country in countries" :key="country.id" :value="String(country.id)">{{ country.name }}</option></select></label><NationalLocationFields v-if="isNational" :departments="geography.departments" :department-id="form.departmentId" :municipality-id="form.municipalityId" :district-id="form.districtId" @update:department-id="form.departmentId = $event" @update:municipality-id="form.municipalityId = $event" @update:district-id="form.districtId = $event" /><AppInput v-model="form.address" class="sm:col-span-2" label="Dirección (opcional)" maxlength="300" /></div></section>
          </fieldset>
        </div>
        <footer class="flex justify-end gap-2 border-t border-border/70 p-4 sm:px-6"><AppButton variant="outline" type="button" :disabled="saving" @click="closeEditor()">Cancelar</AppButton><AppButton type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar cliente' }}</AppButton></footer>
      </form>
    </dialog>
    <PurchaseActionDialog v-if="discardChanges" title="Descartar cambios" description="El cliente tiene cambios sin guardar." :busy="saving" @close="discardChanges = false" @confirm="closeEditor(true)" />
    <PurchaseActionDialog v-if="leaving" title="Salir sin guardar" description="Los cambios de este cliente no se han guardado." :busy="saving" @close="resolveLeave(false)" @confirm="resolveLeave(true)" />
    <PurchaseActionDialog v-if="statusAction" :title="statusAction.isActive ? 'Activar cliente' : 'Desactivar cliente'" :description="statusAction.isActive ? statusAction.name + ' volverá a aparecer entre los clientes activos.' : statusAction.name + ' quedará inactivo. Sus datos y documentos se conservan.'" :busy="saving" :error="errorMessage" @close="statusAction = null" @confirm="toggleStatus" />
  </AdminLayout>
</template>
