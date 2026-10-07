<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Boxes, ChevronLeft, ChevronRight, History, LayoutGrid, MapPin, MoreHorizontal, Plus, RefreshCw, Search, SlidersHorizontal, Warehouse as WarehouseIcon, X } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import OperationsNav from '../components/operations/OperationsNav.vue';
import AppButton from '../components/base/AppButton.vue';
import AppInput from '../components/base/AppInput.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import WarehouseMap from '../components/WarehouseMap.vue';
import InventoryProductDetail from '../components/InventoryProductDetail.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { useUnsavedChanges } from '../composables/useUnsavedChanges';
import { getApiErrorMessage } from '../utils/api-error';
import { onlyOptionId } from '../utils/purchase-workflow';
import type { MapWarehouse } from '../utils/warehouse-map';

type Product = { id: number; name: string; sku: string; purchaseUnit: { name: string } };
type Warehouse = { id: number; name: string; branchId: number; branch: { id: number; name: string }; locations: { id: number; code: string }[] };
type Stock = { id: number; quantity: string; product: Product; location: { id: number; code: string; warehouse: Warehouse } };
type Movement = { id: number; type: string; quantity: string; balance: string; reason: string; createdAt: string; stock: Stock; user: { username: string } | null; purchaseItem: { unit: { name: string }; purchase: { id: number; documentNumber: string } } | null; costReference: { valuationUnitCost: string; currency: string; source: string; retaceo: { id: number; code: string } | null } | null };
type LocationContext = { productId: number; productName: string; warehouseId: number; locationId: number; locationCode: string; warehouse?: MapWarehouse };
type Tab = 'stocks' | 'map' | 'movements';
const { can } = usePermissions();
const tab = ref<Tab>('stocks');
const views = [{ id: 'stocks' as const, label: 'Existencias', icon: Boxes }, { id: 'map' as const, label: 'Mapa de bodega', icon: LayoutGrid }, { id: 'movements' as const, label: 'Movimientos', icon: History }];
const mapRefresh = ref(0), detailStock = ref<Stock | null>(null), detailMap = ref(false);
const locationContext = ref<LocationContext | null>(null), historicWarehouse = ref<Pick<Warehouse, 'id' | 'name' | 'branch'> | null>(null);
const stocks = ref<Stock[]>([]), movements = ref<Movement[]>([]), products = ref<Product[]>([]), warehouses = ref<Warehouse[]>([]);
const search = ref(''), branchId = ref(0), warehouseId = ref(0), movementType = ref(''), dateFrom = ref(''), dateTo = ref('');
const advancedFilters = ref(false), loading = ref(false), busy = ref(false), error = ref(''), success = ref('');
const page = ref(1), total = ref(0), pages = ref(1);
const available = ref<number | null>(null), balanceError = ref(''), balanceLoading = ref(false), balanceRefresh = ref(0);
const editor = ref(false), confirm = ref(false), discardChanges = ref(false), adjustmentDialog = ref<HTMLDialogElement>();
const optionsMenu = ref<HTMLDetailsElement>();
const form = reactive({ productId: 0, warehouseId: 0, locationId: 0, direction: 'in', quantity: '', reason: '', requestId: '' });
let initialForm = '', version = 0, balanceVersion = 0;
const dirty = () => editor.value && JSON.stringify(form) !== initialForm;
const { leaving, resolveLeave } = useUnsavedChanges(dirty, () => busy.value);
const labels: Record<string, string> = { OPENING: 'Apertura', RECEIPT: 'Recepción', REVERSAL: 'Reversión', ADJUSTMENT: 'Ajuste', TRANSFER_OUT: 'Despacho a sucursal', TRANSFER_IN: 'Recepción de traslado' };
const number = (n: string | number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Number(n));
const dateTime = (date: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/El_Salvador' }).format(new Date(date));
const locations = computed(() => warehouses.value.find(w => w.id === form.warehouseId)?.locations ?? []);
const unit = computed(() => products.value.find(p => p.id === form.productId)?.purchaseUnit.name ?? '');
const branches = computed(() => {
  const availableBranches = new Map(warehouses.value.map(w => [w.branch.id, w.branch]));
  if (historicWarehouse.value) availableBranches.set(historicWarehouse.value.branch.id, historicWarehouse.value.branch);
  return [...availableBranches.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
});
const warehouseOptions = computed(() => {
  const list = branchId.value ? warehouses.value.filter(w => w.branch.id === branchId.value) : warehouses.value;
  const previous = historicWarehouse.value;
  return previous && !list.some(w => w.id === previous.id) && (!branchId.value || previous.branch.id === branchId.value) ? [...list, previous] : list;
});
const extraFilterCount = computed(() => Number(!!movementType.value) + Number(!!dateFrom.value) + Number(!!dateTo.value));
const hasFilters = computed(() => !!(search.value || branchId.value || warehouseId.value || locationContext.value || (tab.value === 'movements' && extraFilterCount.value)));
const projectedBalance = computed(() => available.value === null ? null : Math.round((available.value + Number(form.quantity || 0) * (form.direction === 'out' ? -1 : 1)) * 100) / 100);

onBeforeUnmount(() => { version++; balanceVersion++; adjustmentDialog.value?.close(); });
watch(editor, async open => { await nextTick(); if (open) adjustmentDialog.value?.showModal(); else adjustmentDialog.value?.close(); });
watch([() => form.productId, () => form.locationId, editor, balanceRefresh], async () => {
  const request = ++balanceVersion, company = activeCompanyId.value;
  available.value = null; balanceError.value = ''; balanceLoading.value = false;
  if (!editor.value || !company || !form.productId || !form.locationId) return;
  balanceLoading.value = true;
  try {
    const response = await http.get('/inventory/stocks', { params: { productId: form.productId, locationId: form.locationId }, headers: { 'X-Company-Id': String(company) } });
    if (request === balanceVersion && company === activeCompanyId.value) available.value = Number(response.data.data.items[0]?.quantity ?? 0);
  } catch (caught) { if (request === balanceVersion && company === activeCompanyId.value) balanceError.value = getApiErrorMessage(caught, 'No se pudo consultar el saldo'); }
  finally { if (request === balanceVersion && company === activeCompanyId.value) balanceLoading.value = false; }
});
watch(() => form.warehouseId, () => { form.locationId = onlyOptionId(locations.value) ?? 0; });
async function load(catalogs = false) {
  const request = ++version, company = activeCompanyId.value;
  if (!company) { loading.value = false; return; }
  const config = { headers: { 'X-Company-Id': String(company) } };
  loading.value = true; error.value = '';
  try {
    if (catalogs) {
      const response = await http.get('/inventory/catalogs', config);
      if (request !== version || company !== activeCompanyId.value) return;
      products.value = response.data.data.products; warehouses.value = response.data.data.warehouses;
    }
    if (tab.value === 'map') { mapRefresh.value++; return; }
    const response = await http.get(`/inventory/${tab.value}`, { ...config, params: {
      page: page.value, search: search.value.trim(), ...(branchId.value ? { branchId: branchId.value } : {}), ...(warehouseId.value ? { warehouseId: warehouseId.value } : {}),
      ...(locationContext.value ? { productId: locationContext.value.productId, locationId: locationContext.value.locationId } : {}),
      ...(tab.value === 'movements' ? { ...(movementType.value ? { type: movementType.value } : {}), ...(dateFrom.value ? { dateFrom: dateFrom.value } : {}), ...(dateTo.value ? { dateTo: dateTo.value } : {}) } : {}),
    } });
    if (request !== version || company !== activeCompanyId.value) return;
    pages.value = Math.max(1, response.data.data.totalPages); total.value = response.data.data.total;
    if (page.value > pages.value) { page.value = pages.value; await load(); return; }
    if (tab.value === 'stocks') stocks.value = response.data.data.items; else movements.value = response.data.data.items;
  } catch (caught) { if (request === version && company === activeCompanyId.value) error.value = getApiErrorMessage(caught, 'No se pudo cargar el inventario'); }
  finally { if (request === version && company === activeCompanyId.value) loading.value = false; }
}
watch(activeCompanyId, () => {
  version++; balanceVersion++; detailStock.value = null; locationContext.value = null; historicWarehouse.value = null;
  page.value = 1; total.value = 0; pages.value = 1; stocks.value = []; movements.value = []; products.value = []; warehouses.value = [];
  branchId.value = 0; warehouseId.value = 0; search.value = ''; movementType.value = ''; dateFrom.value = ''; dateTo.value = ''; advancedFilters.value = false;
  adjustmentDialog.value?.close(); editor.value = false; confirm.value = false; discardChanges.value = false; busy.value = false; success.value = ''; error.value = '';
  void load(true);
}, { immediate: true });
function applyFilters() { page.value = 1; void load(); }
function changeBranch() { warehouseId.value = 0; if (historicWarehouse.value?.branch.id !== branchId.value) historicWarehouse.value = null; locationContext.value = null; applyFilters(); }
function changeWarehouse() { locationContext.value = null; applyFilters(); }
function clearFilters() { search.value = ''; branchId.value = 0; warehouseId.value = 0; locationContext.value = null; historicWarehouse.value = null; movementType.value = ''; dateFrom.value = ''; dateTo.value = ''; applyFilters(); }
function clearLocation() { locationContext.value = null; applyFilters(); }
function changeTab(value: Tab) { if (tab.value === value) return; if (optionsMenu.value) optionsMenu.value.open = false; locationContext.value = null; tab.value = value; page.value = 1; void load(); }
function selectMapWarehouse(id: number, selectedBranchId?: number) { warehouseId.value = id; branchId.value = warehouses.value.find(w => w.id === id)?.branch.id ?? selectedBranchId ?? 0; historicWarehouse.value = null; }
function openDetail(stock: Stock, showMap = false) { detailStock.value = stock; detailMap.value = showMap; }
function openMovements(context: LocationContext) {
  const origin = context.warehouse ?? detailStock.value?.location.warehouse;
  const originBranchId = origin?.branch.id ?? origin?.branchId;
  historicWarehouse.value = origin?.id === context.warehouseId && originBranchId && !warehouses.value.some(w => w.id === origin.id)
    ? { id: origin.id, name: origin.name, branch: { id: originBranchId, name: origin.branch.name } } : null;
  const known = warehouses.value.find(w => w.id === context.warehouseId) ?? historicWarehouse.value;
  branchId.value = known?.branch.id ?? 0; warehouseId.value = context.warehouseId;
  detailStock.value = null; locationContext.value = context; tab.value = 'movements'; search.value = ''; movementType.value = ''; dateFrom.value = ''; dateTo.value = ''; page.value = 1;
  void load();
}
function openAdjustment() {
  if (optionsMenu.value) optionsMenu.value.open = false;
  const selected = warehouses.value.find(w => w.id === warehouseId.value);
  const target = selected?.id ?? onlyOptionId(warehouses.value) ?? 0;
  Object.assign(form, { productId: onlyOptionId(products.value) ?? 0, warehouseId: target, locationId: onlyOptionId(warehouses.value.find(w => w.id === target)?.locations ?? []) ?? 0, direction: 'in', quantity: '', reason: '', requestId: crypto.randomUUID() });
  error.value = ''; success.value = ''; initialForm = JSON.stringify(form); editor.value = true;
}
function closeEditor(force = false) {
  if (busy.value) return;
  if (!force && dirty()) { discardChanges.value = true; return; }
  adjustmentDialog.value?.close(); editor.value = false; discardChanges.value = false; confirm.value = false;
}
function review() {
  if (balanceLoading.value || available.value === null) { error.value = balanceError.value || 'Espere la consulta del saldo de la ubicación'; return; }
  const quantity = Number(form.quantity);
  if (!form.productId || !form.locationId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 9999999999.99 || form.reason.trim().length < 5) { error.value = 'Seleccione producto y espacio, una cantidad entera positiva y un motivo de al menos 5 caracteres'; return; }
  if (projectedBalance.value !== null && projectedBalance.value < 0) { error.value = 'La salida supera las existencias de este espacio'; return; }
  error.value = ''; confirm.value = true;
}
async function save() {
  if (busy.value) return;
  const company = activeCompanyId.value;
  busy.value = true; error.value = '';
  try {
    await http.post('/inventory/adjustments', { productId: form.productId, locationId: form.locationId, quantity: Number(form.quantity) * (form.direction === 'out' ? -1 : 1), reason: form.reason.trim(), requestId: form.requestId }, { headers: { 'X-Company-Id': String(company) } });
    if (company !== activeCompanyId.value) return;
    adjustmentDialog.value?.close(); editor.value = false; confirm.value = false; success.value = 'Ajuste registrado en existencias y movimientos'; page.value = 1; await load();
  } catch (caught) { if (company === activeCompanyId.value) { error.value = getApiErrorMessage(caught, 'No se pudo registrar el ajuste'); balanceRefresh.value++; } }
  finally { if (company === activeCompanyId.value) busy.value = false; }
}
</script>

<template>
  <AdminLayout title="Inventario">
    <div class="mx-auto max-w-7xl space-y-5">
      <OperationsNav />
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div><h1 class="page-title">Inventario</h1><p class="page-subtitle">Consulte existencias, encuentre productos y revise sus movimientos.</p></div>
        <div class="flex items-center gap-2">
          <AppButton variant="outline" :disabled="loading || busy" @click="load(true)"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton>
          <details ref="optionsMenu" class="relative"><summary class="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-lg border border-border bg-surface text-muted-fg hover:text-fg" aria-label="Opciones de inventario"><MoreHorizontal class="h-5 w-5" /></summary><div class="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-subtle">
            <button v-if="can('inventory.adjust')" type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-secondary" :disabled="loading || busy" @click="openAdjustment"><Plus class="h-4 w-4" />Ajustar existencias</button>
            <RouterLink to="/inventory/warehouse" class="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-surface-secondary"><WarehouseIcon class="h-4 w-4" />Ubicar y distribuir</RouterLink>
            <RouterLink v-if="can('locations.view')" :to="{ path: '/organization/locations', query: warehouseId ? { warehouse: String(warehouseId) } : branchId ? { branch: String(branchId) } : {} }" class="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-surface-secondary"><MapPin class="h-4 w-4" />Gestionar espacios</RouterLink>
          </div></details>
        </div>
      </header>
      <nav aria-label="Vistas de inventario" class="flex gap-1 rounded-xl border border-border/70 bg-surface p-1.5 sm:w-fit">
        <button v-for="view in views" :key="view.id" type="button" :aria-pressed="tab === view.id" class="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors sm:flex-none sm:px-5" :class="tab === view.id ? 'bg-surface-secondary font-semibold text-fg' : 'text-muted-fg hover:text-fg'" @click="changeTab(view.id)"><component :is="view.icon" class="hidden h-4 w-4 sm:block" />{{ view.label }}</button>
      </nav>
      <p v-if="error && !editor" role="alert" class="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{{ error }}</p>
      <p v-if="success" role="status" class="text-sm text-success">{{ success }}</p>
      <section v-if="tab !== 'map'" class="surface-panel overflow-hidden">
        <form class="border-b border-border/70 p-4 sm:p-5" @submit.prevent="applyFilters">
          <div class="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(230px,1.4fr)_minmax(160px,1fr)_minmax(180px,1fr)_auto]">
            <label class="text-xs font-medium text-muted-fg">Producto o SKU<div class="relative mt-1.5"><Search class="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-fg" /><input v-model="search" type="search" maxlength="100" class="field-control !mt-0 !pl-9" placeholder="Buscar en el inventario" /></div></label>
            <label class="text-xs font-medium text-muted-fg">Sucursal<select v-model.number="branchId" class="field-control" @change="changeBranch"><option :value="0">Todas las sucursales</option><option v-for="branch in branches" :key="branch.id" :value="branch.id">{{ branch.name }}</option></select></label>
            <label class="text-xs font-medium text-muted-fg">Almacén<select v-model.number="warehouseId" class="field-control" @change="changeWarehouse"><option :value="0">Todos los almacenes</option><option v-for="warehouse in warehouseOptions" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}{{ !branchId ? ' · ' + warehouse.branch.name : '' }}</option></select></label>
            <AppButton type="submit" variant="outline" :disabled="loading"><Search class="h-4 w-4" />Buscar</AppButton>
          </div>
          <div v-if="tab === 'movements' || hasFilters" class="mt-3 flex flex-wrap items-center gap-3">
            <button v-if="tab === 'movements'" type="button" class="inline-flex items-center gap-1.5 text-xs text-muted-fg hover:text-fg" :aria-expanded="advancedFilters" @click="advancedFilters = !advancedFilters"><SlidersHorizontal class="h-3.5 w-3.5" />{{ advancedFilters ? 'Ocultar filtros' : 'Más filtros' }}<span v-if="extraFilterCount" class="rounded bg-surface-secondary px-1.5 py-0.5">{{ extraFilterCount }}</span></button>
            <button v-if="hasFilters" type="button" class="text-xs text-accent hover:underline" @click="clearFilters">Limpiar filtros</button>
          </div>
          <div v-if="tab === 'movements' && advancedFilters" class="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3"><label class="text-xs font-medium text-muted-fg">Tipo de movimiento<select v-model="movementType" class="field-control"><option value="">Todos los movimientos</option><option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option></select></label><AppInput v-model="dateFrom" type="date" label="Desde" :max="dateTo || undefined" /><AppInput v-model="dateTo" type="date" label="Hasta" :min="dateFrom || undefined" /></div>
        </form>
        <div v-if="locationContext" class="mx-4 mt-4 flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-2.5 text-sm"><MapPin class="h-4 w-4 shrink-0 text-accent" /><div class="min-w-0 flex-1"><strong class="block truncate">{{ locationContext.productName }}</strong><span class="text-xs text-muted-fg">Espacio {{ locationContext.locationCode }}</span></div><button type="button" class="icon-button" aria-label="Quitar filtro del espacio" @click="clearLocation"><X class="h-4 w-4" /></button></div>
        <div class="flex items-center justify-between gap-3 px-4 py-4 sm:px-5"><h2 class="text-sm font-semibold">{{ tab === 'stocks' ? 'Existencias por ubicación' : 'Historial de movimientos' }}</h2><span class="text-xs tabular-nums text-muted-fg">{{ total }} registros</span></div>
        <p v-if="loading" role="status" class="px-5 py-12 text-center text-sm text-muted-fg">{{ tab === 'stocks' ? 'Consultando existencias…' : 'Consultando movimientos…' }}</p>
        <div v-else-if="!total" class="px-6 py-14 text-center"><component :is="tab === 'stocks' ? Boxes : History" class="mx-auto mb-3 h-7 w-7 text-muted-fg" /><p class="text-sm font-medium">{{ tab === 'stocks' ? 'No hay existencias para mostrar' : 'No hay movimientos para mostrar' }}</p><p class="mt-1 text-xs text-muted-fg">{{ hasFilters ? 'Pruebe otra búsqueda o limpie los filtros.' : 'Los registros aparecerán al confirmar entradas o movimientos de inventario.' }}</p><button v-if="hasFilters" type="button" class="mt-4 text-sm text-accent" @click="clearFilters">Mostrar todos los registros</button></div>
        <template v-else>
          <div class="hidden max-w-full overflow-x-auto md:block">
            <table v-if="tab === 'stocks'" class="w-full min-w-[720px] text-left text-sm"><thead class="border-y border-border/70 bg-surface-secondary/60 text-xs text-muted-fg"><tr><th class="px-5 py-3 font-medium">Producto</th><th class="px-5 py-3 font-medium">Almacén y espacio</th><th class="px-5 py-3 font-medium">Sucursal</th><th class="px-5 py-3 text-right font-medium">Existencias</th><th class="w-12 px-4 py-3"><span class="sr-only">Ubicación</span></th></tr></thead><tbody class="divide-y divide-border/70"><tr v-for="stock in stocks" :key="stock.id" class="hover:bg-surface-secondary/40"><td class="px-5 py-4"><button type="button" class="text-left font-medium hover:text-accent" @click="openDetail(stock)">{{ stock.product.name }}</button><p class="mt-1 text-xs text-muted-fg">{{ stock.product.sku }}</p></td><td class="px-5 py-4"><p>{{ stock.location.warehouse.name }}</p><p class="mt-1 flex items-center gap-1 text-xs text-muted-fg"><MapPin class="h-3 w-3" />{{ stock.location.code }}</p></td><td class="px-5 py-4 text-muted-fg">{{ stock.location.warehouse.branch.name }}</td><td class="px-5 py-4 text-right"><p class="font-semibold tabular-nums" :class="Number(stock.quantity) === 0 ? 'text-muted-fg' : ''">{{ number(stock.quantity) }}</p><p class="mt-1 text-xs text-muted-fg">{{ stock.product.purchaseUnit.name }}</p></td><td class="px-4 py-4"><button type="button" class="icon-button" :aria-label="`Ver ubicación de ${stock.product.name}`" @click="openDetail(stock, true)"><MapPin class="h-4 w-4" /></button></td></tr></tbody></table>
            <table v-else class="w-full min-w-[920px] text-left text-sm"><thead class="border-y border-border/70 bg-surface-secondary/60 text-xs text-muted-fg"><tr><th class="px-5 py-3 font-medium">Fecha y movimiento</th><th class="px-5 py-3 font-medium">Producto y ubicación</th><th class="px-5 py-3 text-right font-medium">Cantidad</th><th class="px-5 py-3 text-right font-medium">Saldo</th><th class="px-5 py-3 font-medium">Referencia</th></tr></thead><tbody class="divide-y divide-border/70"><tr v-for="movement in movements" :key="movement.id" class="align-top hover:bg-surface-secondary/40"><td class="px-5 py-4"><p class="font-medium">{{ labels[movement.type] }}</p><p class="mt-1 text-xs text-muted-fg">{{ dateTime(movement.createdAt) }}</p></td><td class="px-5 py-4"><p class="font-medium">{{ movement.stock.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ movement.stock.location.warehouse.name }} · {{ movement.stock.location.code }}</p></td><td class="px-5 py-4 text-right"><p class="font-medium tabular-nums" :class="Number(movement.quantity) < 0 ? 'text-danger' : 'text-success'">{{ Number(movement.quantity) > 0 ? '+' : '' }}{{ number(movement.quantity) }}</p><p class="mt-1 text-xs text-muted-fg">{{ movement.purchaseItem?.unit.name ?? movement.stock.product.purchaseUnit.name }}</p></td><td class="px-5 py-4 text-right tabular-nums">{{ number(movement.balance) }}</td><td class="max-w-xs px-5 py-4"><RouterLink v-if="movement.purchaseItem && can('purchases.view')" class="text-xs text-accent" :to="`/purchases/receipts?id=${movement.purchaseItem.purchase.id}`">{{ movement.purchaseItem.purchase.documentNumber }}</RouterLink><details class="mt-1 text-xs"><summary class="cursor-pointer text-muted-fg">Motivo y documentos</summary><p class="mt-2 break-words leading-5">{{ movement.reason }}</p><p class="mt-1 text-muted-fg">Registró: {{ movement.user?.username ?? 'Apertura del sistema' }}</p><p v-if="movement.costReference" class="mt-2 text-muted-fg">Costo unitario: {{ new Intl.NumberFormat('es-SV', { style: 'currency', currency: movement.costReference.currency, minimumFractionDigits: 4 }).format(Number(movement.costReference.valuationUnitCost)) }}</p><RouterLink v-if="movement.costReference?.retaceo && can('retaceos.view')" class="mt-1 block text-accent" :to="`/purchases/retaceos?id=${movement.costReference.retaceo.id}`">{{ movement.costReference.retaceo.code }}</RouterLink></details></td></tr></tbody></table>
          </div>
          <div class="divide-y divide-border/70 md:hidden">
            <article v-for="stock in tab === 'stocks' ? stocks : []" :key="stock.id" class="p-4"><div class="flex items-start justify-between gap-4"><button type="button" class="min-w-0 text-left" @click="openDetail(stock)"><p class="font-medium">{{ stock.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ stock.product.sku }}</p></button><div class="shrink-0 text-right"><p class="font-semibold tabular-nums">{{ number(stock.quantity) }}</p><p class="text-xs text-muted-fg">{{ stock.product.purchaseUnit.name }}</p></div></div><p class="mt-3 text-xs text-muted-fg">{{ stock.location.warehouse.branch.name }} · {{ stock.location.warehouse.name }}</p><button type="button" class="mt-2 inline-flex items-center gap-1 text-xs text-accent" @click="openDetail(stock, true)"><MapPin class="h-3.5 w-3.5" />{{ stock.location.code }} · Ver ubicación</button></article>
            <article v-for="movement in tab === 'movements' ? movements : []" :key="movement.id" class="p-4"><div class="flex items-start justify-between gap-3"><div><p class="text-xs text-muted-fg">{{ dateTime(movement.createdAt) }}</p><p class="mt-1 text-sm font-medium">{{ labels[movement.type] }}</p></div><p class="font-semibold tabular-nums" :class="Number(movement.quantity) < 0 ? 'text-danger' : 'text-success'">{{ Number(movement.quantity) > 0 ? '+' : '' }}{{ number(movement.quantity) }}</p></div><p class="mt-3 text-sm font-medium">{{ movement.stock.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ movement.stock.location.warehouse.name }} · {{ movement.stock.location.code }}</p><p class="mt-2 text-xs text-muted-fg">Saldo: {{ number(movement.balance) }} {{ movement.purchaseItem?.unit.name ?? movement.stock.product.purchaseUnit.name }}</p><details class="mt-3 text-xs"><summary class="cursor-pointer text-accent">Motivo y documentos</summary><p class="mt-2 leading-5">{{ movement.reason }}</p><p class="mt-1 text-muted-fg">Registró: {{ movement.user?.username ?? 'Apertura del sistema' }}</p><RouterLink v-if="movement.purchaseItem && can('purchases.view')" class="mt-2 block text-accent" :to="`/purchases/receipts?id=${movement.purchaseItem.purchase.id}`">{{ movement.purchaseItem.purchase.documentNumber }}</RouterLink><p v-if="movement.costReference" class="mt-2 text-muted-fg">Costo unitario: {{ new Intl.NumberFormat('es-SV', { style: 'currency', currency: movement.costReference.currency, minimumFractionDigits: 4 }).format(Number(movement.costReference.valuationUnitCost)) }}</p><RouterLink v-if="movement.costReference?.retaceo && can('retaceos.view')" class="mt-1 block text-accent" :to="`/purchases/retaceos?id=${movement.costReference.retaceo.id}`">{{ movement.costReference.retaceo.code }}</RouterLink></details></article>
          </div>
        </template>
        <footer v-if="total" class="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-5"><span class="text-xs text-muted-fg">Página {{ page }} de {{ pages }}</span><div class="flex items-center gap-1"><button type="button" class="icon-button" aria-label="Página anterior" :disabled="loading || page <= 1" @click="page--; load()"><ChevronLeft class="h-4 w-4" /></button><button type="button" class="icon-button" aria-label="Página siguiente" :disabled="loading || page >= pages" @click="page++; load()"><ChevronRight class="h-4 w-4" /></button></div></footer>
      </section>
      <section v-else class="surface-panel min-w-0 p-4 sm:p-5"><WarehouseMap :warehouses="warehouses" :initial-warehouse="warehouseId" :refresh="mapRefresh" @warehouse-change="selectMapWarehouse" @movements="openMovements" /></section>
    </div>
    <InventoryProductDetail v-if="detailStock" :key="detailStock.id" :stock="detailStock" :warehouses="warehouses" :show-map="detailMap" @close="detailStock = null" @movements="openMovements" />
    <Teleport to="body">
      <dialog v-if="editor" ref="adjustmentDialog" aria-labelledby="adjustment-title" class="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40" @cancel.prevent="closeEditor()">
        <form class="flex h-full min-h-0 flex-col" @submit.prevent="review"><header class="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6"><div><h2 id="adjustment-title" class="text-lg font-semibold">Ajustar existencias</h2><p class="mt-1 text-sm text-muted-fg">Seleccione el producto y el espacio que va a corregir.</p></div><button type="button" class="icon-button shrink-0" aria-label="Cerrar ajuste" :disabled="busy" @click="closeEditor()"><X class="h-4 w-4" /></button></header><fieldset :disabled="busy || confirm" class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6"><p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p><label class="block text-sm">Producto<select v-model.number="form.productId" required class="field-control"><option :value="0" disabled>Seleccionar producto</option><option v-for="product in products" :key="product.id" :value="product.id">{{ product.sku }} · {{ product.name }}</option></select></label><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm">Almacén<select v-model.number="form.warehouseId" required class="field-control"><option :value="0" disabled>Seleccionar almacén</option><option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.branch.name }} · {{ warehouse.name }}</option></select></label><label class="text-sm">Espacio<select v-model.number="form.locationId" required class="field-control" :disabled="!locations.length"><option :value="0" disabled>Seleccionar espacio</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.code }}</option></select></label></div><p v-if="form.warehouseId && !locations.length" class="text-sm text-muted-fg">Este almacén no tiene espacios activos. <RouterLink v-if="can('locations.view')" :to="{ path: '/organization/locations', query: { warehouse: String(form.warehouseId) } }" class="text-accent">Gestionar espacios</RouterLink></p><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm">Movimiento<select v-model="form.direction" class="field-control"><option value="in">Entrada</option><option value="out">Salida</option></select></label><AppInput v-model="form.quantity" type="number" :label="`Cantidad${unit ? ` (${unit})` : ''}`" min="1" :max="form.direction === 'out' && available !== null ? available : 9999999999.99" step="1" required /></div><AppInput v-model="form.reason" label="Motivo del ajuste" placeholder="Explique la corrección de existencias" minlength="5" maxlength="500" required /><p v-if="balanceLoading" role="status" class="text-sm text-muted-fg">Consultando saldo…</p><p v-else-if="balanceError" role="alert" class="text-sm text-danger">{{ balanceError }}</p><dl v-else-if="available !== null" class="grid grid-cols-2 gap-4 rounded-xl bg-surface-secondary p-4 text-sm"><div><dt class="text-xs text-muted-fg">Existencia actual</dt><dd class="mt-1 font-semibold">{{ number(available) }} {{ unit }}</dd></div><div><dt class="text-xs text-muted-fg">Después del ajuste</dt><dd class="mt-1 font-semibold" :class="(projectedBalance ?? 0) < 0 ? 'text-danger' : ''">{{ number(projectedBalance ?? 0) }} {{ unit }}</dd></div></dl></fieldset><footer class="flex justify-end gap-2 border-t border-border p-5"><AppButton type="button" variant="outline" :disabled="busy" @click="closeEditor()">Cancelar</AppButton><AppButton type="submit" :disabled="busy || balanceLoading || available === null">Revisar ajuste</AppButton></footer></form>
      </dialog>
    </Teleport>
    <PurchaseActionDialog v-if="confirm" title="Confirmar ajuste de inventario" :description="`${form.direction === 'in' ? 'Entrada' : 'Salida'} de ${form.quantity} ${unit}. ${form.reason}. El movimiento quedará registrado en el kardex.`" :busy="busy" :error="error" @close="confirm = false" @confirm="save" />
    <PurchaseActionDialog v-if="discardChanges" title="Descartar ajuste" description="Los datos del ajuste no se han guardado." @close="discardChanges = false" @confirm="closeEditor(true)" />
    <PurchaseActionDialog v-if="leaving" title="Salir sin guardar" description="Los datos del ajuste no se han guardado." @close="resolveLeave(false)" @confirm="resolveLeave(true)" />
  </AdminLayout>
</template>
