<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Check, Circle, Focus, History, MapPin, Minus, Plus, Search, X } from 'lucide-vue-next';
import { http } from '../services/http.service';
import { getApiErrorMessage } from '../utils/api-error';

type State = 'AVAILABLE' | 'OCCUPIED' | 'FULL' | 'INACTIVE';
type Slot = { id: number; code: string; aisle: string; rack: string; level: string; position: string; capacity: number;
  state: State; usedCapacity: string | null; freeCapacity: string | null;
  stocks: { quantity: string; product: { id: number; name: string; sku: string; purchaseUnit: { id: number; name: string } } }[] };
const props = defineProps<{ warehouses: { id: number; name: string; branch: { name: string }; locations: { id: number }[] }[];
  initialWarehouse?: number; initialLocation?: number; productId?: number; productName?: string; refresh: number }>();
const emit = defineEmits<{ movements: [context: { productId: number; productName: string; warehouseId: number; locationId: number; locationCode: string }] }>();
const warehouseId = ref(0);
const slots = ref<Slot[]>([]);
const query = ref('');
const selectedId = ref(0);
const busy = ref(false);
const error = ref('');
const cellSize = ref(48);
const mapRoot = ref<HTMLElement>();
const detailRoot = ref<HTMLElement>();
const labels: Record<State, string> = { AVAILABLE: 'Disponible', OCCUPIED: 'Ocupado', FULL: 'Lleno', INACTIVE: 'Inactivo' };
const states: State[] = ['AVAILABLE', 'OCCUPIED', 'FULL', 'INACTIVE'];
let version = 0;
onBeforeUnmount(() => { version++; });
watch(() => [props.initialWarehouse, props.initialLocation, props.productId, props.warehouses] as const, () => {
  warehouseId.value = props.initialWarehouse || warehouseId.value || props.warehouses.find(w => w.locations.length)?.id || props.warehouses[0]?.id || 0;
  selectedId.value = props.initialLocation || 0;
}, { immediate: true });
function containsProduct(slot: Slot) { return !!props.productId && slot.stocks.some(stock => stock.product.id === props.productId); }
watch([warehouseId, () => props.refresh, () => props.productId], async () => {
  const current = ++version;
  slots.value = []; error.value = '';
  if (!warehouseId.value) { busy.value = false; return; }
  busy.value = true;
  try {
    const result = await http.get('/inventory/map', { params: { warehouseId: warehouseId.value } });
    if (current !== version) return;
    slots.value = result.data.data.locations;
    const initial = warehouseId.value === props.initialWarehouse ? slots.value.find(slot => slot.id === props.initialLocation) : undefined;
    selectedId.value = initial?.id || slots.value.find(containsProduct)?.id || 0;
  } catch (caught) { if (current === version) error.value = getApiErrorMessage(caught, 'No se pudo cargar el mapa'); }
  finally { if (current === version) { busy.value = false; await nextTick(); if (props.productId) centerProduct(false); } }
}, { immediate: true });
const selected = computed(() => slots.value.find(slot => slot.id === selectedId.value));
const selectedStocks = computed(() => [...(selected.value?.stocks ?? [])].sort((a, b) => Number(b.product.id === props.productId) - Number(a.product.id === props.productId)));
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function matches(slot: Slot) {
  const value = normalized(query.value.trim());
  return !value || normalized([slot.code, slot.aisle, slot.rack, ...slot.stocks.flatMap(s => [s.product.name, s.product.sku])].join(' ')).includes(value);
}
const found = computed(() => slots.value.filter(matches));
const productLocations = computed(() => slots.value.filter(containsProduct));
const compare = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });
const aisles = computed(() => [...new Set(slots.value.map(s => s.aisle))].sort(compare).map(aisle => ({
  name: aisle,
  racks: [...new Set(slots.value.filter(s => s.aisle === aisle).map(s => s.rack))].sort(compare).map(rack => {
    const members = slots.value.filter(s => s.aisle === aisle && s.rack === rack);
    const positions = [...new Set(members.map(s => s.position))].sort(compare);
    return { name: rack, positions, levels: [...new Set(members.map(s => s.level))].sort((a, b) => compare(b, a)).map(level => ({
      name: level, cells: positions.map(position => members.find(s => s.level === level && s.position === position)),
    })) };
  }),
})));
const format = (value: string | number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Number(value));
function centerProduct(focus = true) {
  const target = productLocations.value.find(slot => slot.id === selectedId.value) || productLocations.value[0];
  if (!target) return;
  selectedId.value = target.id;
  const element = mapRoot.value?.querySelector<HTMLButtonElement>(`[data-location-id="${target.id}"]`);
  if (element && mapRoot.value) {
    const cell = element.getBoundingClientRect();
    const viewport = mapRoot.value.getBoundingClientRect();
    mapRoot.value.scrollBy({ left: cell.left - viewport.left - viewport.width / 2 + cell.width / 2,
      top: cell.top - viewport.top - viewport.height / 2 + cell.height / 2, behavior: 'instant' });
  }
  if (focus) element?.focus({ preventScroll: true });
}
async function selectSlot(slot: Slot) {
  selectedId.value = slot.id;
  await nextTick();
  if (window.matchMedia('(max-width: 1023px)').matches) detailRoot.value?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}
function moveFocus(event: KeyboardEvent) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(mapRoot.value?.querySelectorAll<HTMLButtonElement>('[data-location-id]') ?? []);
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
  buttons[next]?.focus();
}
</script>

<template>
  <section aria-label="Mapa de bodega" class="warehouse-location-map min-w-0">
    <div class="mb-4 grid gap-3 sm:grid-cols-2">
      <label class="min-w-0 text-sm">Bodega<select v-model.number="warehouseId" class="field-control"><option v-if="!warehouses.length" :value="0">Sin bodegas disponibles</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }} · {{ w.branch.name }}</option></select></label>
      <label class="min-w-0 text-sm">Buscar en el mapa<div class="relative mt-1.5"><Search class="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-fg"/><input v-model="query" type="search" maxlength="100" class="field-control !mt-0 !pl-9" placeholder="Producto, SKU o espacio" /></div></label>
    </div>
    <p v-if="error" role="alert" class="py-5 text-danger">{{ error }}</p>
    <p v-else-if="busy" role="status" class="py-10 text-muted-fg">Cargando ubicaciones...</p>
    <p v-else-if="!slots.length" class="border-y border-border py-10 text-center text-muted-fg">Esta bodega no tiene espacios registrados.</p>
    <template v-else>
      <div v-if="productId" class="mb-4 flex flex-wrap items-center gap-3 border-l-2 border-accent pl-3"><MapPin class="h-5 w-5 shrink-0 text-accent"/><div class="min-w-0 flex-1"><strong class="block break-words text-sm">{{ productName }}</strong><span role="status" class="text-xs text-muted-fg">{{ productLocations.length ? `${productLocations.length} ${productLocations.length === 1 ? 'ubicación' : 'ubicaciones'} con existencias en esta bodega` : 'Sin existencias en esta bodega' }}</span></div><button type="button" title="Centrar producto" class="icon-button shrink-0" :disabled="!productLocations.length" @click="centerProduct()"><Focus class="h-4 w-4"/></button></div>
      <div class="mb-4 flex flex-wrap gap-x-4 gap-y-2 border-y border-border py-3 text-xs" aria-label="Estados de los espacios">
        <span v-if="productId" class="flex items-center gap-1.5"><MapPin class="h-4 w-4 text-accent"/>Producto</span>
        <span v-for="state in states" :key="state" class="flex items-center gap-1.5"><span class="state-key" :class="`state-${state}`"><X v-if="state === 'INACTIVE'" class="h-3 w-3"/><Minus v-else-if="state === 'FULL'" class="h-3 w-3"/><Circle v-else class="h-2 w-2" :fill="state === 'OCCUPIED' ? 'currentColor' : 'none'"/></span>{{ labels[state] }} <span class="tabular-nums text-muted-fg">{{ slots.filter(s => s.state === state).length }}</span></span>
      </div>
      <div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div class="min-w-0">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><p role="status" class="text-xs text-muted-fg">{{ query ? `${found.length} coincidencias` : `${slots.length} espacios` }} · Sin escala</p><div class="flex items-center gap-1"><button type="button" class="icon-button" title="Reducir mapa" :disabled="cellSize <= 40" @click="cellSize -= 8"><Minus class="h-4 w-4"/></button><span class="w-12 text-center text-xs tabular-nums">{{ Math.round(cellSize / 48 * 100) }}%</span><button type="button" class="icon-button" title="Ampliar mapa" :disabled="cellSize >= 72" @click="cellSize += 8"><Plus class="h-4 w-4"/></button></div></div>
          <div ref="mapRoot" class="max-h-[60dvh] min-h-48 min-w-0 max-w-full overflow-auto border-y border-border bg-surface-secondary p-3 sm:p-4" @keydown="moveFocus">
            <section v-for="aisle in aisles" :key="aisle.name" class="mb-6 last:mb-0" :aria-label="`Pasillo ${aisle.name}`">
              <h2 class="mb-4 flex items-center gap-2 border-y border-dashed border-border py-3 text-xs font-semibold uppercase text-muted-fg"><MapPin class="h-4 w-4"/>Pasillo {{ aisle.name }}</h2>
              <div class="flex flex-wrap items-start gap-5">
                <section v-for="rack in aisle.racks" :key="rack.name" class="shrink-0" :aria-label="`Estante ${rack.name}`">
                  <h3 class="mb-2 text-sm font-semibold">Estante {{ rack.name }}</h3>
                  <div class="border-x-2 border-border px-2" :style="{ '--slot-size': `${cellSize}px` }">
                    <div class="mb-1 grid gap-2 text-center text-[11px] text-muted-fg" :style="{ gridTemplateColumns: `48px repeat(${rack.positions.length}, var(--slot-size))` }"><span>Pos.</span><span v-for="position in rack.positions" :key="position" class="truncate" :title="position">{{ position }}</span></div>
                    <div v-for="level in rack.levels" :key="level.name" class="grid items-center gap-2 border-b-2 border-border py-2" :style="{ gridTemplateColumns: `48px repeat(${rack.positions.length}, var(--slot-size))` }">
                      <span class="break-words text-xs text-muted-fg">Nivel {{ level.name }}</span>
                      <template v-for="(slot, index) in level.cells" :key="rack.positions[index]">
                        <button v-if="slot" type="button" :data-location-id="slot.id" :aria-pressed="selectedId === slot.id" :aria-label="`${slot.code}, ${labels[slot.state]}, pasillo ${slot.aisle}, estante ${slot.rack}, nivel ${slot.level}, posicion ${slot.position}${containsProduct(slot) ? ', ubicacion del producto' : ''}`" :title="`${slot.code} · ${labels[slot.state]}`" class="location-seat" :class="[`state-${slot.state}`, { 'product-seat': containsProduct(slot), 'selected-seat': selectedId === slot.id, 'muted-seat': query && !matches(slot) && !containsProduct(slot) }]" @click="selectSlot(slot)">
                          <MapPin v-if="containsProduct(slot)" class="h-4 w-4"/><X v-else-if="slot.state === 'INACTIVE'" class="h-4 w-4"/><Minus v-else-if="slot.state === 'FULL'" class="h-4 w-4"/><Circle v-else class="h-3 w-3" :fill="slot.state === 'OCCUPIED' ? 'currentColor' : 'none'"/>
                          <span class="max-w-full truncate text-[11px]">{{ slot.position }}</span><Check v-if="selectedId === slot.id" class="seat-check h-3 w-3"/>
                        </button>
                        <span v-else aria-hidden="true" class="seat-gap" />
                      </template>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </div>
        <aside ref="detailRoot" aria-label="Contenido del espacio" aria-live="polite" class="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <template v-if="selected">
            <p class="text-xs text-muted-fg">Espacio seleccionado</p><h2 class="mt-1 break-all text-lg font-semibold">{{ selected.code }}</h2>
            <p class="mt-2 flex items-center gap-2 text-sm"><span class="state-key" :class="`state-${selected.state}`"/><span>Estado: <strong>{{ labels[selected.state] }}</strong></span></p>
            <dl class="my-4 grid grid-cols-2 gap-3 text-sm"><div><dt class="text-muted-fg">Pasillo</dt><dd class="break-words font-medium">{{ selected.aisle }}</dd></div><div><dt class="text-muted-fg">Estante</dt><dd class="break-words font-medium">{{ selected.rack }}</dd></div><div><dt class="text-muted-fg">Nivel</dt><dd class="break-words font-medium">{{ selected.level }}</dd></div><div><dt class="text-muted-fg">Posición</dt><dd class="break-words font-medium">{{ selected.position }}</dd></div><div><dt class="text-muted-fg">Capacidad nominal</dt><dd>{{ format(selected.capacity) }}</dd></div><div><dt class="text-muted-fg">Ocupación</dt><dd>{{ selected.usedCapacity === null ? 'Unidades mixtas' : format(selected.usedCapacity) }}</dd></div></dl>
            <p v-if="selected.usedCapacity === null" class="mb-3 text-xs text-muted-fg">Capacidad disponible no comparable entre unidades distintas.</p>
            <ul class="divide-y divide-border"><li v-for="stock in selectedStocks" :key="stock.product.id" class="py-3" :class="stock.product.id === productId ? 'border-l-2 border-accent pl-3' : ''"><p class="mb-1 text-xs text-muted-fg">Producto</p><strong class="block break-words text-sm">{{ stock.product.name }}</strong><span class="block break-all text-xs text-muted-fg">{{ stock.product.sku }}</span><p class="mt-2 text-xs text-muted-fg">Cantidad disponible</p><span class="block text-sm font-semibold">{{ format(stock.quantity) }} {{ stock.product.purchaseUnit.name }}</span><button type="button" class="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline" @click="emit('movements', { productId: stock.product.id, productName: stock.product.name, warehouseId, locationId: selected.id, locationCode: selected.code })"><History class="h-3.5 w-3.5"/>Ver movimientos</button></li></ul>
            <p v-if="!selected.stocks.length" class="py-4 text-sm text-muted-fg">Sin existencias.</p>
          </template>
          <p v-else class="py-4 text-sm text-muted-fg">Ningún espacio seleccionado</p>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.state-AVAILABLE { color: #047857; background: #ecfdf5; border-color: #6ee7b7; }
.state-OCCUPIED { color: #0369a1; background: #e0f2fe; border-color: #7dd3fc; }
.state-FULL { color: #92400e; background: #fef3c7; border-color: #fbbf24; }
.state-INACTIVE { color: #52525b; background: repeating-linear-gradient(135deg,#f4f4f5,#f4f4f5 4px,#e4e4e7 4px,#e4e4e7 5px); border-color: #a1a1aa; }
.state-key { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; border-width: 1px; border-radius: 4px; }
.location-seat { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: var(--slot-size); height: var(--slot-size); border-width: 1px; border-bottom-width: 4px; border-radius: 7px 7px 4px 4px; transition: opacity .15s, box-shadow .15s; }
.location-seat:hover { box-shadow: 0 0 0 2px var(--color-fg); }
.location-seat:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 3px; }
.product-seat { border-color: #0071e3; box-shadow: 0 0 0 2px #0071e3; }
.product-seat > svg:first-child { color: #0071e3; }
.selected-seat { outline: 2px solid var(--color-fg); outline-offset: 3px; }
.seat-check { position: absolute; right: -5px; top: -5px; border-radius: 50%; background: var(--color-fg); color: var(--color-bg); }
.muted-seat { opacity: .35; }
.seat-gap { width: var(--slot-size); height: var(--slot-size); }
:global(.dark .warehouse-location-map .state-AVAILABLE) { color: #6ee7b7; background: #123c32; border-color: #397965; }
:global(.dark .warehouse-location-map .state-OCCUPIED) { color: #7dd3fc; background: #123446; border-color: #36718b; }
:global(.dark .warehouse-location-map .state-FULL) { color: #fde68a; background: #463714; border-color: #927435; }
:global(.dark .warehouse-location-map .state-INACTIVE) { color: #a1a1aa; background: repeating-linear-gradient(135deg,#27272a,#27272a 4px,#3f3f46 4px,#3f3f46 5px); border-color: #71717a; }
:global(.dark .warehouse-location-map .product-seat) { border-color: #60a5fa; box-shadow: 0 0 0 2px #60a5fa; }
:global(.dark .warehouse-location-map .product-seat > svg:first-child) { color: #60a5fa; }
</style>
