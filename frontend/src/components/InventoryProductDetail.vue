<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, History, MapPin, RefreshCw, X } from 'lucide-vue-next';
import AppButton from './base/AppButton.vue';
import WarehouseMap from './WarehouseMap.vue';
import { http } from '../services/http.service';
import { getApiErrorMessage } from '../utils/api-error';

type Warehouse = { id: number; name: string; branch: { name: string }; locations: { id: number }[] };
type Stock = { id: number; quantity: string; product: { id: number; name: string; sku: string; purchaseUnit: { name: string } };
  location: { id: number; code: string; warehouse: Warehouse } };
const props = defineProps<{ stock: Stock; warehouses: Warehouse[]; showMap?: boolean }>();
const emit = defineEmits<{ close: []; movements: [context: { productId: number; productName: string; warehouseId: number; locationId: number; locationCode: string }] }>();
const dialog = ref<HTMLDialogElement>();
const map = ref(props.showMap ?? false);
watch(map, async () => { await nextTick(); dialog.value?.querySelector<HTMLButtonElement>('header button')?.focus(); });
const current = ref(props.stock);
const loading = ref(false);
const error = ref('');
const refresh = ref(0);
let version = 0;
const warehouseOptions = computed(() => props.warehouses.some(w => w.id === props.stock.location.warehouse.id)
  ? props.warehouses : [...props.warehouses, { ...props.stock.location.warehouse, locations: [] }]);
async function reload() {
  const request = ++version;
  loading.value = true; error.value = '';
  try {
    const response = await http.get('/inventory/stocks', { params: { productId: props.stock.product.id, locationId: props.stock.location.id } });
    if (request !== version) return;
    const row = response.data.data.items.find((item: Stock) => item.id === props.stock.id);
    if (!row) throw new Error('La existencia ya no esta disponible');
    current.value = row; refresh.value++;
  } catch (caught) { if (request === version) error.value = getApiErrorMessage(caught, 'No se pudo actualizar el detalle'); }
  finally { if (request === version) loading.value = false; }
}
onMounted(() => { dialog.value?.showModal(); void reload(); });
onBeforeUnmount(() => { version++; dialog.value?.close(); });
function showMovements() {
  emit('movements', { productId: current.value.product.id, productName: current.value.product.name,
    warehouseId: current.value.location.warehouse.id, locationId: current.value.location.id, locationCode: current.value.location.code });
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" aria-labelledby="inventory-product-title" class="inventory-detail m-auto max-h-[94dvh] w-[calc(100%-1rem)] rounded-lg border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/50" :class="map ? 'max-w-6xl' : 'max-w-xl'" @cancel.prevent="emit('close')">
      <header class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div class="min-w-0"><p class="text-xs text-muted-fg">{{ map ? 'Ubicación del producto' : 'Detalle de inventario' }}</p><h2 id="inventory-product-title" class="mt-1 break-words text-lg font-semibold">{{ current.product.name }}</h2></div>
        <button type="button" class="icon-button shrink-0" aria-label="Cerrar detalle de inventario" autofocus @click="emit('close')"><X class="h-4 w-4"/></button>
      </header>
      <div class="min-w-0 p-4 sm:p-6">
        <div class="mb-4 flex items-center justify-between gap-2"><AppButton v-if="map" variant="outline" @click="map = false"><ArrowLeft class="h-4 w-4"/>Detalle</AppButton><span v-else class="break-all text-sm text-muted-fg">{{ current.product.sku }}</span><button type="button" class="icon-button shrink-0" title="Actualizar detalle" :disabled="loading" @click="reload"><RefreshCw class="h-4 w-4"/></button></div>
        <p v-if="error" role="alert" class="mb-4 text-sm text-danger">{{ error }}</p>
        <WarehouseMap v-if="map" :warehouses="warehouseOptions" :initial-warehouse="current.location.warehouse.id" :initial-location="current.location.id" :product-id="current.product.id" :product-name="current.product.name" :refresh="refresh" @movements="emit('movements', $event)" />
        <p v-else-if="loading" role="status" class="py-5 text-sm text-muted-fg">Actualizando existencias...</p>
        <template v-else-if="!error">
          <dl class="grid grid-cols-1 gap-5 sm:grid-cols-2"><div><dt class="text-xs text-muted-fg">Cantidad disponible en este espacio</dt><dd class="mt-1 text-xl font-semibold">{{ Number(current.quantity).toLocaleString('es-SV') }} <span class="text-sm font-normal">{{ current.product.purchaseUnit.name }}</span></dd></div><div><dt class="text-xs text-muted-fg">Ubicación</dt><dd class="mt-1 break-all font-medium">{{ current.location.code }}</dd></div><div><dt class="text-xs text-muted-fg">Bodega</dt><dd class="mt-1 break-words">{{ current.location.warehouse.name }}</dd></div><div><dt class="text-xs text-muted-fg">Sucursal</dt><dd class="mt-1 break-words">{{ current.location.warehouse.branch.name }}</dd></div></dl>
          <div class="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4"><AppButton variant="outline" @click="showMovements"><History class="h-4 w-4"/>Ver movimientos</AppButton><AppButton @click="map = true"><MapPin class="h-4 w-4"/>Ver ubicación</AppButton></div>
        </template>
      </div>
    </dialog>
  </Teleport>
</template>
