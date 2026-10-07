<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, ChevronDown, ChevronRight, History, MapPin, Package, RefreshCw, X } from 'lucide-vue-next';
import AppButton from './base/AppButton.vue';
import WarehouseMap from './WarehouseMap.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { getApiErrorMessage } from '../utils/api-error';
import { type MapWarehouse } from '../utils/warehouse-map';

type Stock = { id: number; quantity: string; product: { id: number; name: string; sku: string; purchaseUnit: { name: string } };
  location: { id: number; code: string; warehouse: MapWarehouse } };
const props = defineProps<{ stock: Stock; warehouses: MapWarehouse[]; showMap?: boolean }>();
const emit = defineEmits<{ close: []; movements: [context: { productId: number; productName: string; warehouseId: number; locationId: number; locationCode: string; warehouse?: MapWarehouse }] }>();
const { can } = usePermissions();
const dialog = ref<HTMLDialogElement>();
const map = ref(props.showMap ?? false);
const current = ref(props.stock);
const stocks = ref<Stock[]>([]);
const loading = ref(false);
const error = ref('');
const refresh = ref(0);
let version = 0;
const number = (value: string | number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Number(value));
const availableStocks = computed(() => stocks.value.filter(stock => Number(stock.quantity) > 0));
const totalQuantity = computed(() => availableStocks.value.reduce((total, stock) => total + Math.round(Number(stock.quantity) * 100), 0) / 100);
const stockGroups = computed(() => {
  const groups = new Map<number, { warehouse: MapWarehouse; stocks: Stock[] }>();
  for (const stock of availableStocks.value) {
    const warehouse = stock.location.warehouse;
    if (!groups.has(warehouse.id)) groups.set(warehouse.id, { warehouse, stocks: [] });
    groups.get(warehouse.id)!.stocks.push(stock);
  }
  return [...groups.values()].sort((a, b) => a.warehouse.branch.name.localeCompare(b.warehouse.branch.name, 'es') || a.warehouse.name.localeCompare(b.warehouse.name, 'es'))
    .map(group => ({ ...group, stocks: group.stocks.sort((a, b) => a.location.code.localeCompare(b.location.code, 'es', { numeric: true })) }));
});
const warehouseOptions = computed(() => {
  const options = new Map(props.warehouses.map(warehouse => [warehouse.id, warehouse]));
  for (const stock of [current.value, ...stocks.value]) {
    const warehouse = stock.location.warehouse;
    if (!options.has(warehouse.id)) options.set(warehouse.id, { ...warehouse, locations: warehouse.locations ?? [] });
  }
  return [...options.values()];
});
watch(map, async () => { await nextTick(); dialog.value?.querySelector<HTMLButtonElement>('header button')?.focus(); });
watch(() => [props.stock.id, props.showMap] as const, () => { current.value = props.stock; stocks.value = []; map.value = props.showMap ?? false; void reload(); });
watch(activeCompanyId, () => { version++; stocks.value = []; emit('close'); });
async function reload() {
  const request = ++version;
  const company = activeCompanyId.value;
  const product = props.stock.product.id;
  loading.value = true; error.value = '';
  if (!company || !can('inventory.view')) { loading.value = false; error.value = 'No tienes acceso al inventario de esta empresa.'; return; }
  try {
    const rows: Stock[] = [];
    let page = 1;
    let pages = 1;
    do {
      const response = await http.get('/inventory/stocks', { params: { productId: product, limit: 100, page }, headers: { 'X-Company-Id': String(company) } });
      if (request !== version || company !== activeCompanyId.value) return;
      rows.push(...response.data.data.items);
      pages = response.data.data.totalPages;
      page++;
    } while (page <= pages);
    stocks.value = [...new Map(rows.map(stock => [stock.id, stock])).values()];
    const selected = rows.find(stock => stock.id === current.value.id);
    if (selected) current.value = selected;
    else current.value = { ...current.value, quantity: '0' };
    refresh.value++;
  } catch (caught) { if (request === version && company === activeCompanyId.value) error.value = getApiErrorMessage(caught, 'No se pudo actualizar el inventario de este producto'); }
  finally { if (request === version) loading.value = false; }
}
onMounted(() => { dialog.value?.showModal(); void reload(); });
onBeforeUnmount(() => { version++; dialog.value?.close(); });
function showMovements(stock = current.value) {
  emit('movements', { productId: stock.product.id, productName: stock.product.name,
    warehouseId: stock.location.warehouse.id, locationId: stock.location.id, locationCode: stock.location.code, warehouse: stock.location.warehouse });
}
function showLocation(stock = current.value) { current.value = stock; map.value = true; }
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" aria-labelledby="inventory-product-title" class="inventory-detail m-auto max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/50" :class="map ? 'max-w-6xl' : 'max-w-2xl'" @cancel.prevent="emit('close')">
      <header class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4 sm:px-6">
        <div class="min-w-0"><p class="text-xs text-muted-fg">{{ map ? 'Ubicación física' : 'Ficha de inventario' }}</p><h2 id="inventory-product-title" class="mt-1 break-words text-lg font-semibold">{{ current.product.name }}</h2><p class="mt-1 break-all text-xs text-muted-fg">{{ current.product.sku }}</p></div>
        <button type="button" class="icon-button shrink-0" aria-label="Cerrar ficha de inventario" autofocus @click="emit('close')"><X class="h-4 w-4"/></button>
      </header>
      <div class="min-w-0 p-5 sm:p-6">
        <div v-if="map" class="mb-5 flex items-center justify-between gap-3"><AppButton variant="outline" @click="map = false"><ArrowLeft class="h-4 w-4"/>Existencias del producto</AppButton><button type="button" class="icon-button shrink-0" title="Actualizar inventario" aria-label="Actualizar inventario" :disabled="loading" @click="reload"><RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''"/></button></div>
        <p v-if="error" role="alert" class="mb-4 text-sm text-danger">{{ error }}</p>
        <WarehouseMap v-if="map && can('inventory.view')" :warehouses="warehouseOptions" :initial-warehouse="current.location.warehouse.id" :initial-location="current.location.id" :product-id="current.product.id" :product-name="current.product.name" :refresh="refresh" @movements="emit('movements', $event)" />
        <p v-else-if="loading" role="status" class="py-12 text-center text-sm text-muted-fg">Actualizando existencias del producto…</p>
        <div v-else-if="error" class="py-5 text-center"><AppButton variant="outline" @click="reload"><RefreshCw class="h-4 w-4"/>Reintentar</AppButton></div>
        <template v-else>
          <div class="flex items-start justify-between gap-4 rounded-xl bg-surface-secondary/70 p-4"><div><p class="text-xs text-muted-fg">Existencias totales</p><p class="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{{ number(totalQuantity) }} <span class="text-sm font-normal text-muted-fg">{{ current.product.purchaseUnit.name }}</span></p><p class="mt-2 text-xs text-muted-fg">{{ availableStocks.length }} {{ availableStocks.length === 1 ? 'ubicación con existencias' : 'ubicaciones con existencias' }}</p></div><button type="button" class="icon-button shrink-0" title="Actualizar inventario" aria-label="Actualizar inventario" :disabled="loading" @click="reload"><RefreshCw class="h-4 w-4"/></button></div>
          <div class="mt-5 flex items-center justify-between gap-3"><h3 class="text-sm font-semibold">Existencias por ubicación</h3><span class="text-xs text-muted-fg">{{ stockGroups.length }} {{ stockGroups.length === 1 ? 'almacén' : 'almacenes' }}</span></div>
          <div class="mt-3 space-y-4">
            <details v-for="group in stockGroups" :key="group.warehouse.id" :open="group.warehouse.id === current.location.warehouse.id || stockGroups.length === 1" class="group overflow-hidden rounded-xl border border-border">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-3 bg-surface-secondary/40 px-4 py-3"><span class="min-w-0"><strong class="block break-words text-sm font-medium">{{ group.warehouse.name }}</strong><span class="mt-1 block text-xs text-muted-fg">{{ group.warehouse.branch.name }} · {{ group.stocks.length }} {{ group.stocks.length === 1 ? 'ubicación' : 'ubicaciones' }}</span></span><ChevronDown class="h-4 w-4 shrink-0 text-muted-fg transition-transform group-open:rotate-180"/></summary>
              <ul class="divide-y divide-border border-t border-border"><li v-for="stock in group.stocks" :key="stock.id" class="flex flex-wrap items-center gap-3 px-4 py-3"><MapPin class="h-4 w-4 shrink-0 text-muted-fg"/><div class="min-w-0 flex-1"><button type="button" class="break-all text-left text-sm font-medium hover:text-accent hover:underline" :aria-label="`Ver ubicación ${stock.location.code}`" @click="showLocation(stock)">{{ stock.location.code }}</button><span v-if="stock.id === current.id" class="ml-2 text-[11px] text-muted-fg">Seleccionada</span></div><span class="text-sm font-semibold tabular-nums">{{ number(stock.quantity) }} <span class="text-xs font-normal text-muted-fg">{{ stock.product.purchaseUnit.name }}</span></span><button v-if="can('inventory.view')" type="button" class="icon-button shrink-0" :title="`Movimientos en ${stock.location.code}`" :aria-label="`Ver movimientos en ${stock.location.code}`" @click="showMovements(stock)"><History class="h-4 w-4"/></button><button type="button" class="icon-button shrink-0" :title="`Ver ${stock.location.code} en el mapa`" :aria-label="`Ver ${stock.location.code} en el mapa`" @click="showLocation(stock)"><ChevronRight class="h-4 w-4"/></button></li></ul>
            </details>
          </div>
          <div v-if="!availableStocks.length" class="mt-4 rounded-xl border border-dashed border-border p-8 text-center"><Package class="mx-auto mb-3 h-6 w-6 text-muted-fg"/><p class="text-sm font-medium">Este producto no tiene existencias disponibles</p><p class="mt-2 text-xs text-muted-fg">Consulta sus movimientos para revisar el historial.</p></div>
          <details v-if="Number(current.quantity) <= 0" class="mt-5 rounded-lg border border-border px-4 py-3 text-xs"><summary class="cursor-pointer font-medium">Ubicación consultada sin existencias</summary><p class="mt-3 break-words text-muted-fg">{{ current.location.warehouse.branch.name }} · {{ current.location.warehouse.name }} · {{ current.location.code }}</p></details>
          <div v-if="can('inventory.view')" class="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4"><AppButton variant="outline" @click="showMovements()"><History class="h-4 w-4"/>Movimientos de esta ubicación</AppButton><AppButton @click="showLocation()"><MapPin class="h-4 w-4"/>Ver en el mapa</AppButton></div>
        </template>
      </div>
    </dialog>
  </Teleport>
</template>
