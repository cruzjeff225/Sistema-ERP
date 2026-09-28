<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, MapPin, Plus, RefreshCw, Search, X } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import AppButton from '../components/base/AppButton.vue';
import AppInput from '../components/base/AppInput.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import WarehouseMap from '../components/WarehouseMap.vue';
import InventoryProductDetail from '../components/InventoryProductDetail.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { getApiErrorMessage } from '../utils/api-error';

type Product = { id: number; name: string; sku: string; purchaseUnit: { name: string } };
type Warehouse = { id: number; name: string; branch: { name: string }; locations: { id: number; code: string }[] };
type Stock = { id: number; quantity: string; product: Product; location: { id: number; code: string; warehouse: Warehouse } };
type Movement = { id: number; type: string; quantity: string; balance: string; reason: string; createdAt: string; stock: Stock; user: { username: string } | null; purchaseItem: { unit: { name: string }; purchase: { id: number; documentNumber: string } } | null; costReference: { valuationUnitCost: string; currency: string; source: string; retaceo: { id: number; code: string } | null } | null };
const { can } = usePermissions();
const tab = ref<'stocks' | 'movements' | 'map'>('stocks');
const mapRefresh = ref(0);
const detailStock = ref<Stock | null>(null);
const detailMap = ref(false);
type LocationContext = { productId: number; productName: string; warehouseId: number; locationId: number; locationCode: string };
const locationContext = ref<LocationContext | null>(null);
function openDetail(stock: Stock, showMap = false) { detailStock.value = stock; detailMap.value = showMap; }
function openMovements(context: LocationContext) {
  detailStock.value = null; locationContext.value = context; tab.value = 'movements';
  warehouseId.value = context.warehouseId; search.value = ''; movementType.value = ''; dateFrom.value = ''; dateTo.value = ''; page.value = 1;
  void load();
}
function clearLocation() { locationContext.value = null; page.value = 1; void load(); }
const stocks = ref<Stock[]>([]);
const movements = ref<Movement[]>([]);
const products = ref<Product[]>([]);
const warehouses = ref<Warehouse[]>([]);
const search = ref('');
const warehouseId = ref(0);
const movementType = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const available = ref<number | null>(null);
const balanceError = ref('');
const balanceLoading = ref(false);
const balanceRefresh = ref(0);
const page = ref(1);
const total = ref(0);
const pages = ref(1);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const success = ref('');
const editor = ref(false);
const confirm = ref(false);
const form = reactive({ productId: 0, warehouseId: 0, locationId: 0, direction: 'in', quantity: '', reason: '', requestId: '' });
const locations = computed(() => warehouses.value.find(w => w.id === form.warehouseId)?.locations ?? []);
const unit = computed(() => products.value.find(p => p.id === form.productId)?.purchaseUnit.name ?? '');
const labels: Record<string, string> = { OPENING: 'Apertura', RECEIPT: 'Recepcion', REVERSAL: 'Reversion', ADJUSTMENT: 'Ajuste' };
const number = (n: string) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Number(n));
let version = 0;
let balanceVersion = 0;
onBeforeUnmount(() => { version++; balanceVersion++; });
const projectedBalance = computed(() => available.value === null ? null : Math.round((available.value + Number(form.quantity || 0) * (form.direction === 'out' ? -1 : 1)) * 100) / 100);
watch([() => form.productId, () => form.locationId, editor, balanceRefresh], async () => {
  const current = ++balanceVersion;
  available.value = null; balanceError.value = ''; balanceLoading.value = false;
  if (!editor.value || !form.productId || !form.locationId) return;
  balanceLoading.value = true;
  try {
    const response = await http.get('/inventory/stocks', { params: { productId: form.productId, locationId: form.locationId }, headers: { 'X-Company-Id': String(activeCompanyId.value) } });
    if (current === balanceVersion) available.value = Number(response.data.data.items[0]?.quantity ?? 0);
  } catch (caught) { if (current === balanceVersion) balanceError.value = getApiErrorMessage(caught, 'No se pudo consultar el saldo'); }
  finally { if (current === balanceVersion) balanceLoading.value = false; }
});
watch(() => form.warehouseId, () => { form.locationId = locations.value[0]?.id ?? 0; });
watch(warehouseId, value => { if (locationContext.value && value !== locationContext.value.warehouseId) clearLocation(); });
async function load(catalogs = false) {
  const current = ++version;
  const company = activeCompanyId.value;
  if (!company) { loading.value = false; return; }
  const config = { headers: { 'X-Company-Id': String(company) } };
  loading.value = true; error.value = '';
  try {
    if (catalogs) {
      const result = await http.get('/inventory/catalogs', config);
      if (current !== version) return;
      products.value = result.data.data.products; warehouses.value = result.data.data.warehouses;
    }
    if (tab.value === 'map') { mapRefresh.value++; return; }
    const response = await http.get(`/inventory/${tab.value}`, { ...config, params: { page: page.value, search: search.value, ...(locationContext.value ? { productId: locationContext.value.productId, locationId: locationContext.value.locationId } : {}), ...(warehouseId.value ? { warehouseId: warehouseId.value } : {}), ...(tab.value === 'movements' ? { ...(movementType.value ? { type: movementType.value } : {}), ...(dateFrom.value ? { dateFrom: dateFrom.value } : {}), ...(dateTo.value ? { dateTo: dateTo.value } : {}) } : {}) } });
    if (current !== version) return;
    if (tab.value === 'stocks') stocks.value = response.data.data.items;
    else movements.value = response.data.data.items;
    total.value = response.data.data.total; pages.value = Math.max(1, response.data.data.totalPages);
  } catch (caught) { if (current === version) error.value = getApiErrorMessage(caught, 'No se pudo cargar el inventario'); }
  finally { if (current === version) loading.value = false; }
}
watch(activeCompanyId, () => { version++; detailStock.value = null; locationContext.value = null; page.value = 1; stocks.value = []; movements.value = []; products.value = []; warehouses.value = []; warehouseId.value = 0; editor.value = false; confirm.value = false; success.value = ''; void load(true); }, { immediate: true });
function changeTab(value: 'stocks' | 'movements' | 'map') { locationContext.value = null; tab.value = value; page.value = 1; void load(); }
function openAdjustment() {
  const destination = warehouses.value.find(w => w.locations.length) ?? warehouses.value[0];
  Object.assign(form, { productId: products.value[0]?.id ?? 0, warehouseId: destination?.id ?? 0, locationId: destination?.locations[0]?.id ?? 0, direction: 'in', quantity: '', reason: '', requestId: crypto.randomUUID() });
  error.value = ''; success.value = ''; editor.value = true;
}
function review() {
  if (balanceLoading.value || available.value === null) { error.value = balanceError.value || 'Espere la consulta del saldo de la ubicacion'; return; }
  if (projectedBalance.value !== null && projectedBalance.value < 0) { error.value = 'La salida supera las existencias de esta ubicacion'; return; }
  if (!form.productId || !form.locationId || Number(form.quantity) <= 0 || form.reason.trim().length < 5) { error.value = 'Seleccione producto y ubicacion, una cantidad positiva y un motivo de al menos 5 caracteres'; return; }
  error.value = ''; confirm.value = true;
}
async function save() {
  if (busy.value) return;
  const company = activeCompanyId.value;
  busy.value = true; error.value = '';
  try {
    await http.post('/inventory/adjustments', { productId: form.productId, locationId: form.locationId, quantity: Number(form.quantity) * (form.direction === 'out' ? -1 : 1), reason: form.reason.trim(), requestId: form.requestId }, { headers: { 'X-Company-Id': String(company) } });
    if (company !== activeCompanyId.value) return;
    editor.value = false; confirm.value = false; success.value = 'Ajuste registrado en existencias y kardex'; page.value = 1; await load();
  } catch (caught) { if (company === activeCompanyId.value) { error.value = getApiErrorMessage(caught, 'No se pudo registrar el ajuste'); balanceRefresh.value++; } }
  finally { busy.value = false; }
}
</script>
<template>
  <AdminLayout title="Inventario">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 class="page-title">Inventario</h1><div class="flex gap-2"><AppButton variant="outline" :disabled="loading || busy" @click="load(true)"><RefreshCw class="h-4 w-4" />Actualizar</AppButton><AppButton v-if="can('inventory.adjust')" :disabled="loading || busy" @click="openAdjustment"><Plus class="h-4 w-4" />Ajuste</AppButton></div></header>
    <div role="tablist" aria-label="Vistas de inventario" class="mb-5 flex gap-5 border-b border-border"><button v-for="view in (['stocks','map','movements'] as const)" :key="view" role="tab" :aria-selected="tab === view" class="border-b-2 pb-3 text-sm font-medium" :class="tab === view ? 'border-accent text-accent' : 'border-transparent text-muted-fg'" @click="changeTab(view)">{{ view === 'stocks' ? 'Existencias' : view === 'map' ? 'Mapa de bodega' : 'Kardex' }}</button></div>
    <p v-if="error" role="alert" class="my-4 text-sm text-danger">{{ error }}</p>
    <p v-if="success" role="status" class="my-4 text-sm text-success">{{ success }}</p>
    <div v-if="locationContext" class="mb-4 flex items-center gap-3 border-l-2 border-accent bg-accent-soft px-3 py-2 text-sm"><MapPin class="h-4 w-4 shrink-0 text-accent"/><div class="min-w-0 flex-1"><strong class="block break-words">{{ locationContext.productName }}</strong><span class="break-all text-xs text-muted-fg">{{ locationContext.locationCode }}</span></div><button type="button" class="icon-button shrink-0" title="Quitar filtro de ubicación" @click="clearLocation"><X class="h-4 w-4"/></button></div>
    <form v-if="editor" class="mb-6 border-y border-border py-5" @submit.prevent="review"><fieldset :disabled="busy || confirm" class="space-y-4"><h2 class="text-lg font-semibold">Ajuste de existencias</h2><div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label class="text-sm">Producto<select v-model.number="form.productId" required class="field-control"><option :value="0" disabled>Seleccionar producto</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.sku }} · {{ p.name }}</option></select></label>
      <label class="text-sm">Almacen<select v-model.number="form.warehouseId" required class="field-control"><option :value="0" disabled>Seleccionar almacen</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.branch.name }} · {{ w.name }}</option></select></label>
      <label class="text-sm">Ubicacion<select v-model.number="form.locationId" required class="field-control" :disabled="!locations.length"><option :value="0" disabled>Seleccionar ubicacion</option><option v-for="l in locations" :key="l.id" :value="l.id">{{ l.code }}</option></select><span v-if="!locations.length" class="mt-2 block text-sm text-muted-fg">Este almacen no tiene ubicaciones activas. <RouterLink v-if="can('companies.view')" to="/organization" class="text-accent">Abrir Organizacion</RouterLink></span></label>
      <label class="text-sm">Movimiento<select v-model="form.direction" class="field-control"><option value="in">Entrada</option><option value="out">Salida</option></select></label>
      <AppInput v-model="form.quantity" type="number" :label="`Cantidad${unit ? ` (${unit})` : ''}`" min="0.01" :max="form.direction === 'out' && available !== null ? available : 9999999999.99" step="0.01" required />
      <AppInput v-model="form.reason" label="Motivo" minlength="5" maxlength="500" required />
    </div><p v-if="balanceLoading" role="status" class="text-sm text-muted-fg">Consultando saldo...</p><p v-else-if="balanceError" role="alert" class="text-sm text-danger">{{ balanceError }}</p><dl v-else-if="available !== null" class="flex flex-wrap gap-6 border-y border-border py-3 text-sm"><div><dt class="text-muted-fg">Existencia actual</dt><dd class="font-semibold">{{ number(String(available)) }} {{ unit }}</dd></div><div><dt class="text-muted-fg">Saldo despues del ajuste</dt><dd class="font-semibold" :class="(projectedBalance ?? 0) < 0 ? 'text-danger' : ''">{{ number(String(projectedBalance)) }} {{ unit }}</dd></div></dl><div class="flex justify-end gap-2"><AppButton type="button" variant="outline" @click="editor = false">Cancelar</AppButton><AppButton type="submit" :disabled="balanceLoading || available === null">Revisar ajuste</AppButton></div></fieldset></form>
    <form v-if="tab !== 'map'" class="mb-5 flex flex-wrap items-end gap-3" @submit.prevent="page = 1; load()"><AppInput v-model="search" label="Producto o SKU" type="search" maxlength="100" /><label class="text-sm">Almacen<select v-model.number="warehouseId" class="field-control"><option :value="0">Todos</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.branch.name }} · {{ w.name }}</option></select></label><template v-if="tab === 'movements'"><label class="text-sm">Tipo de movimiento<select v-model="movementType" class="field-control"><option value="">Todos</option><option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option></select></label><AppInput v-model="dateFrom" type="date" label="Desde" :max="dateTo || undefined" /><AppInput v-model="dateTo" type="date" label="Hasta" :min="dateFrom || undefined" /></template><AppButton type="submit" :disabled="loading"><Search class="h-4 w-4" />Buscar</AppButton></form>
    <WarehouseMap v-if="tab === 'map'" :warehouses="warehouses" :initial-warehouse="warehouseId" :refresh="mapRefresh" @movements="openMovements" />
    <template v-else>
    <p v-if="loading" role="status" class="py-8 text-muted-fg">Cargando inventario...</p>
    <p v-else-if="!total" class="border-y border-border py-10 text-center text-sm text-muted-fg">{{ tab === 'stocks' ? 'No hay existencias para estos filtros.' : 'No hay movimientos para estos filtros.' }}</p>
    <div v-else class="min-w-0 max-w-full overflow-x-auto border-y border-border">
      <table v-if="tab === 'stocks'" class="w-full min-w-[700px] text-left text-sm"><thead class="bg-surface-secondary text-muted-fg"><tr><th class="p-3">Producto</th><th class="p-3">Sucursal / Almacen</th><th class="p-3">Ubicacion</th><th class="p-3">Unidad</th><th class="p-3 text-right">Existencia</th><th class="p-3"><span class="sr-only">Acciones</span></th></tr></thead><tbody class="divide-y divide-border"><tr v-for="stock in stocks" :key="stock.id"><td class="p-3"><button type="button" class="block text-left font-semibold text-accent hover:underline" :aria-label="`Ver detalle de ${stock.product.name}`" @click="openDetail(stock)">{{ stock.product.name }}</button><span class="text-xs text-muted-fg">{{ stock.product.sku }}</span></td><td class="p-3">{{ stock.location.warehouse.branch.name }} / {{ stock.location.warehouse.name }}</td><td class="p-3">{{ stock.location.code }}</td><td class="p-3">{{ stock.product.purchaseUnit.name }}</td><td class="p-3 text-right font-semibold tabular-nums">{{ number(stock.quantity) }}</td><td class="p-3"><button type="button" class="icon-button" title="Ver ubicación" :aria-label="`Ver ubicación de ${stock.product.name}`" @click="openDetail(stock, true)"><MapPin class="h-4 w-4" /></button></td></tr><tr v-if="!stocks.length"><td colspan="6" class="p-8 text-center text-muted-fg">No hay existencias para estos filtros.</td></tr></tbody></table>
      <table v-else class="w-full min-w-[1000px] text-left text-sm"><thead class="bg-surface-secondary text-muted-fg"><tr><th class="p-3">Fecha / Usuario</th><th class="p-3">Producto</th><th class="p-3">Ubicacion</th><th class="p-3">Movimiento</th><th class="p-3 text-right">Cantidad</th><th class="p-3 text-right">Saldo</th><th class="p-3">Motivo / Documento</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="m in movements" :key="m.id"><td class="p-3">{{ new Date(m.createdAt).toLocaleString('es-SV') }}<span class="block text-xs text-muted-fg">{{ m.user?.username ?? 'Apertura del sistema' }}</span></td><td class="p-3">{{ m.stock.product.name }}<span class="block text-xs text-muted-fg">{{ m.stock.product.sku }} · {{ m.purchaseItem?.unit.name ?? m.stock.product.purchaseUnit.name }}</span></td><td class="p-3">{{ m.stock.location.warehouse.name }} / {{ m.stock.location.code }}</td><td class="p-3">{{ labels[m.type] }}</td><td class="p-3 text-right tabular-nums" :class="Number(m.quantity) < 0 ? 'text-danger' : 'text-success'">{{ number(m.quantity) }}</td><td class="p-3 text-right tabular-nums">{{ number(m.balance) }}</td><td class="max-w-sm break-words p-3">{{ m.reason }}<RouterLink v-if="m.purchaseItem && can('purchases.view')" class="block text-accent" :to="`/purchases/receipts?id=${m.purchaseItem.purchase.id}`">{{ m.purchaseItem.purchase.documentNumber }}</RouterLink><span v-if="m.costReference" class="mt-1 block text-xs text-muted-fg">Costo unitario: {{ new Intl.NumberFormat('es-SV', { style: 'currency', currency: m.costReference.currency, minimumFractionDigits: 4 }).format(Number(m.costReference.valuationUnitCost)) }} · {{ m.costReference.source === 'retaceo' ? 'Costo real' : 'Compra' }}</span><RouterLink v-if="m.costReference?.retaceo && can('retaceos.view')" class="block text-xs text-accent" :to="`/purchases/retaceos?id=${m.costReference.retaceo.id}`">{{ m.costReference.retaceo.code }}</RouterLink></td></tr><tr v-if="!movements.length"><td colspan="7" class="p-8 text-center text-muted-fg">No hay movimientos para estos filtros.</td></tr></tbody></table>
    </div>
    <footer class="mt-4 flex items-center justify-between text-sm text-muted-fg"><span>{{ total }} registros</span><div class="flex items-center gap-3"><button class="icon-button" title="Pagina anterior" :disabled="loading || page <= 1" @click="page--; load()"><ChevronLeft class="h-4 w-4" /></button><span>{{ page }} / {{ pages }}</span><button class="icon-button" title="Pagina siguiente" :disabled="loading || page >= pages" @click="page++; load()"><ChevronRight class="h-4 w-4" /></button></div></footer>
    </template>
    <InventoryProductDetail v-if="detailStock" :stock="detailStock" :warehouses="warehouses" :show-map="detailMap" @close="detailStock = null" @movements="openMovements" />
    <PurchaseActionDialog v-if="confirm" title="Confirmar ajuste de inventario" :description="`${form.direction === 'in' ? 'Entrada' : 'Salida'} de ${form.quantity} ${unit}. ${form.reason}. El movimiento quedara registrado en el kardex.`" :busy="busy" :error="error" @close="confirm = false" @confirm="save" />
  </AdminLayout>
</template>
