<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { Check, Circle, Focus, History, Layers, MapPin, Minus, Plus, RefreshCw, Search, X } from 'lucide-vue-next';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { getApiErrorMessage } from '../utils/api-error';
import WarehouseMapRack from './WarehouseMapRack.vue';
import { buildWarehouseScene, type MapSlot, type SlotState } from '../utils/warehouse-scene';
import { matchesMapSearch, resolveMapWarehouse, warehouseBranchKey, warehouseBranches, type MapWarehouse } from '../utils/warehouse-map';

type State = SlotState;
type Slot = MapSlot;
const props = defineProps<{ warehouses: MapWarehouse[]; initialWarehouse?: number; initialLocation?: number;
  productId?: number; productName?: string; refresh: number }>();
const emit = defineEmits<{ movements: [context: { productId: number; productName: string; warehouseId: number; locationId: number; locationCode: string; warehouse?: MapWarehouse }]; 'warehouse-change': [warehouseId: number, branchId?: number] }>();
const { can } = usePermissions();
const branchKey = ref('');
const warehouseId = ref(0);
const slots = ref<Slot[]>([]);
const query = ref('');
const stateFilter = ref<State | ''>('');
const aisleFilter = ref('');
const selectedId = ref(0);
const busy = ref(false);
const error = ref('');
const reloadKey = ref(0);
const cellSize = ref(48);
const viewMode = ref<'iso' | 'grid'>('iso');
const mapRoot = ref<HTMLElement>();
const detailRoot = ref<HTMLElement>();
const branches = computed(() => warehouseBranches(props.warehouses));
const warehouseOptions = computed(() => props.warehouses.filter(warehouse => warehouseBranchKey(warehouse) === branchKey.value));
const currentWarehouse = computed(() => props.warehouses.find(warehouse => warehouse.id === warehouseId.value));
const labels: Record<State, string> = { AVAILABLE: 'Disponibles', OCCUPIED: 'Con existencias', FULL: 'Llenos', INACTIVE: 'Inactivos' };
const singleLabels: Record<State, string> = { AVAILABLE: 'Disponible', OCCUPIED: 'Con existencias', FULL: 'Lleno', INACTIVE: 'Inactivo' };
const states: State[] = ['AVAILABLE', 'OCCUPIED', 'FULL', 'INACTIVE'];
let version = 0;
onBeforeUnmount(() => { version++; });
watch(activeCompanyId, () => { version++; slots.value = []; selectedId.value = 0; warehouseId.value = 0; branchKey.value = ''; });
watch(() => [props.initialWarehouse, props.warehouses] as const, ([preferred], previous) => {
  const current = previous && preferred !== previous[0] ? 0 : warehouseId.value;
  warehouseId.value = resolveMapWarehouse(props.warehouses, preferred, current);
  const selectedWarehouse = props.warehouses.find(warehouse => warehouse.id === warehouseId.value);
  if (selectedWarehouse) branchKey.value = warehouseBranchKey(selectedWarehouse);
  else if (!branches.value.some(branch => branch.key === branchKey.value)) branchKey.value = branches.value.length === 1 ? branches.value[0]!.key : '';
}, { immediate: true });
function chooseBranch(event: Event) {
  branchKey.value = (event.target as HTMLSelectElement).value;
  warehouseId.value = resolveMapWarehouse(warehouseOptions.value, 0, warehouseId.value);
  emit('warehouse-change', warehouseId.value, warehouseOptions.value[0]?.branch.id ?? warehouseOptions.value[0]?.branchId);
}
function chooseWarehouse(event: Event) {
  warehouseId.value = Number((event.target as HTMLSelectElement).value);
  emit('warehouse-change', warehouseId.value, currentWarehouse.value?.branch.id ?? currentWarehouse.value?.branchId);
}
function containsProduct(slot: Slot) { return !!props.productId && slot.stocks.some(stock => stock.product.id === props.productId); }
watch([warehouseId, () => props.refresh, () => props.productId, () => props.initialLocation, reloadKey], async ([id], previous) => {
  const current = ++version;
  const company = activeCompanyId.value;
  const contextChanged = id !== previous?.[0] || props.productId !== previous?.[2] || props.initialLocation !== previous?.[3];
  const previousSelection = !contextChanged ? selectedId.value : 0;
  if (id !== previous?.[0]) { query.value = ''; stateFilter.value = ''; aisleFilter.value = ''; }
  slots.value = []; selectedId.value = 0; error.value = '';
  if (!id || !company || !can('inventory.view')) { busy.value = false; return; }
  busy.value = true;
  try {
    const result = await http.get('/inventory/map', { params: { warehouseId: id }, headers: { 'X-Company-Id': String(company) } });
    if (current !== version || company !== activeCompanyId.value) return;
    slots.value = result.data.data.locations;
    const initial = id === props.initialWarehouse ? slots.value.find(slot => slot.id === props.initialLocation) : undefined;
    selectedId.value = slots.value.find(slot => slot.id === previousSelection)?.id || initial?.id || slots.value.find(containsProduct)?.id || 0;
    if (aisleFilter.value && !slots.value.some(slot => slot.aisle === aisleFilter.value)) aisleFilter.value = '';
  } catch (caught) { if (current === version && company === activeCompanyId.value) error.value = getApiErrorMessage(caught, 'No se pudo cargar el mapa'); }
  finally { if (current === version) { busy.value = false; await nextTick(); if (current === version && company === activeCompanyId.value && props.productId && contextChanged) centerProduct(false); } }
}, { immediate: true });
const selected = computed(() => slots.value.find(slot => slot.id === selectedId.value));
const selectedStocks = computed(() => [...(selected.value?.stocks ?? [])].sort((a, b) => Number(b.product.id === props.productId) - Number(a.product.id === props.productId)));
function matches(slot: Slot) {
  return matchesMapSearch(slot, query.value) && (!stateFilter.value || slot.state === stateFilter.value) && (!aisleFilter.value || slot.aisle === aisleFilter.value);
}
const found = computed(() => slots.value.filter(matches));
const filtersActive = computed(() => !!query.value.trim() || !!stateFilter.value || !!aisleFilter.value);
const productLocations = computed(() => slots.value.filter(containsProduct));
const compare = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });
const aisleNames = computed(() => [...new Set(slots.value.map(slot => slot.aisle))].sort(compare));
const allAisles = computed(() => aisleNames.value.map(aisle => ({
  name: aisle,
  racks: [...new Set(slots.value.filter(slot => slot.aisle === aisle).map(slot => slot.rack))].sort(compare).map(rack => {
    const members = slots.value.filter(slot => slot.aisle === aisle && slot.rack === rack);
    const positions = [...new Set(members.map(slot => slot.position))].sort(compare);
    return { name: rack, count: members.length, matches: members.filter(matches).length, positions,
      levels: [...new Set(members.map(slot => slot.level))].sort((a, b) => compare(b, a)).map(level => ({
        name: level, cells: positions.map(position => members.find(slot => slot.level === level && slot.position === position)),
      })) };
  }),
})));
const aisles = computed(() => allAisles.value.map(aisle => ({ ...aisle, racks: aisle.racks.filter(rack => rack.matches > 0) })).filter(aisle => aisle.racks.length));
// Aerial scene generated from the real records; see utils/warehouse-scene.ts.
const scene = computed(() => buildWarehouseScene(allAisles.value));
const sceneId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
const gid = (name: string) => `${sceneId}-${name}`;
const rackIds = { top: gid('metal-top'), side: gid('metal-side'), front: gid('metal-front'), blur: gid('blur') };
// Keyboard order follows the data hierarchy, skipping what the filters hide.
const logicalOrder = computed(() => allAisles.value.flatMap(aisle => aisle.racks.flatMap(rack => [...rack.levels].reverse().flatMap(level => level.cells.filter((cell): cell is Slot => !!cell && matches(cell))))));
function isoKey(event: KeyboardEvent, slot: Slot) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void selectSlot(slot); return; }
  const list = logicalOrder.value;
  const index = list.findIndex(item => item.id === slot.id);
  const moves: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 };
  if (!(event.key in moves)) return;
  event.preventDefault();
  const next = list[Math.max(0, Math.min(list.length - 1, moves[event.key]!))];
  if (next) mapRoot.value?.querySelector<SVGGElement>(`[data-location-id="${next.id}"]`)?.focus();
}
const isoTabbable = computed(() => selected.value && matches(selected.value) ? selected.value.id : logicalOrder.value[0]?.id ?? 0);
const format = (value: string | number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Number(value));
function clearFilters() { query.value = ''; stateFilter.value = ''; aisleFilter.value = ''; }
function centerProduct(focus = true) {
  const target = productLocations.value.find(slot => slot.id === selectedId.value) || productLocations.value[0];
  if (!target) return;
  selectedId.value = target.id;
  if (!matches(target)) { clearFilters(); void nextTick(() => scrollToSlot(target.id, focus)); }
  else scrollToSlot(target.id, focus);
}
function scrollToSlot(id: number, focus: boolean) {
  const element = mapRoot.value?.querySelector<HTMLButtonElement>(`[data-location-id="${id}"]`);
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
  <section aria-label="Mapa de almacén" class="warehouse-location-map min-w-0">
    <div class="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
      <label class="min-w-0 text-xs font-medium text-muted-fg">Sucursal
        <select :value="branchKey" class="field-control" :disabled="!branches.length" @change="chooseBranch"><option value="" disabled>{{ branches.length ? 'Selecciona una sucursal' : 'Sin sucursales disponibles' }}</option><option v-for="branch in branches" :key="branch.key" :value="branch.key">{{ branch.name }}</option></select>
      </label>
      <label class="min-w-0 text-xs font-medium text-muted-fg">Almacén
        <select :value="warehouseId" class="field-control" :disabled="!branchKey || !warehouseOptions.length" @change="chooseWarehouse"><option :value="0" disabled>{{ branchKey ? 'Selecciona un almacén' : 'Selecciona primero la sucursal' }}</option><option v-for="warehouse in warehouseOptions" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option></select>
      </label>
    </div>
    <div v-if="error" role="alert" class="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border p-5"><p class="text-sm text-danger">{{ error }}</p><button type="button" class="inline-flex shrink-0 items-center gap-2 text-sm font-medium" @click="reloadKey++"><RefreshCw class="h-4 w-4"/>Reintentar</button></div>
    <p v-else-if="busy" role="status" class="py-12 text-center text-sm text-muted-fg">Cargando espacios del almacén…</p>
    <div v-else-if="!warehouseId || !slots.length" class="mt-4 rounded-xl border border-dashed border-border px-5 py-12 text-center"><MapPin class="mx-auto mb-3 h-6 w-6 text-muted-fg"/><p class="text-sm font-medium">{{ !warehouses.length ? 'Sin almacenes disponibles' : !warehouseId ? 'Elige el almacén que quieres explorar' : 'Este almacén aún no tiene espacios' }}</p><p class="mt-2 text-xs text-muted-fg">{{ !warehouseId ? 'Encuentra primero la sucursal y luego su almacén.' : 'Los espacios registrados aparecerán por pasillo y estante.' }}</p></div>
    <template v-else>
      <div v-if="productId" class="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-accent-soft px-4 py-3"><MapPin class="h-4 w-4 shrink-0 text-accent"/><div class="min-w-0 flex-1"><strong class="block break-words text-sm">{{ productName }}</strong><span role="status" class="text-xs text-muted-fg">{{ productLocations.length ? `${productLocations.length} ${productLocations.length === 1 ? 'ubicación con existencias' : 'ubicaciones con existencias'}` : 'Sin existencias en este almacén' }}</span></div><button type="button" title="Encontrar producto en el mapa" aria-label="Encontrar producto en el mapa" class="icon-button shrink-0" :disabled="!productLocations.length" @click="centerProduct()"><Focus class="h-4 w-4"/></button></div>
      <div class="my-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label class="min-w-0 text-sm font-medium text-fg">Buscar espacio o producto<div class="relative mt-1.5"><Search class="pointer-events-none absolute left-3 top-3 h-4 w-4"/><input v-model="query" type="search" maxlength="100" class="field-control !mt-0 !pl-9" placeholder="Código, producto o SKU" /></div></label>
        <label class="text-sm font-medium text-fg">Pasillo<select v-model="aisleFilter" class="field-control"><option value="">Todos los pasillos</option><option v-for="aisle in aisleNames" :key="aisle" :value="aisle">Pasillo {{ aisle }}</option></select></label>
      </div>
      <div class="mb-5 flex flex-wrap items-center gap-2" aria-label="Filtrar espacios por estado">
        <button type="button" class="state-filter" :class="!stateFilter ? 'active-filter' : ''" :aria-pressed="!stateFilter" @click="stateFilter = ''">Todos <span class="tabular-nums text-muted-fg">{{ slots.length }}</span></button>
        <button v-for="state in states" :key="state" type="button" class="state-filter" :class="stateFilter === state ? 'active-filter' : ''" :aria-pressed="stateFilter === state" @click="stateFilter = stateFilter === state ? '' : state"><span class="state-dot" :class="`state-${state}`"/>{{ labels[state] }} <span class="tabular-nums text-muted-fg">{{ slots.filter(slot => slot.state === state).length }}</span></button>
      </div>
      <div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div class="min-w-0 overflow-hidden rounded-[12px] border border-border bg-surface">
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border px-5 py-4">
            <div class="min-w-0"><h2 class="truncate text-xl font-semibold tracking-tight">{{ currentWarehouse?.name }}</h2><p role="status" class="mt-0.5 text-sm text-muted-fg">{{ filtersActive ? `${found.length} coincidencias` : `${slots.length} espacios` }} · Vista por pasillo y estante</p></div>
            <div class="flex flex-wrap items-center gap-2">
              <button v-if="filtersActive" type="button" class="text-sm font-medium text-accent hover:underline" @click="clearFilters">Limpiar</button>
              <div class="inline-flex rounded-lg border border-border p-0.5 text-sm" role="group" aria-label="Tipo de vista"><button type="button" class="rounded-md px-2.5 py-1 font-medium" :class="viewMode === 'iso' ? 'bg-surface-secondary text-fg' : 'text-muted-fg hover:text-fg'" :aria-pressed="viewMode === 'iso'" @click="viewMode = 'iso'">Esquema</button><button type="button" class="rounded-md px-2.5 py-1 font-medium" :class="viewMode === 'grid' ? 'bg-surface-secondary text-fg' : 'text-muted-fg hover:text-fg'" :aria-pressed="viewMode === 'grid'" @click="viewMode = 'grid'">Cuadrícula</button></div>
              <div class="flex items-center rounded-lg border border-border bg-surface px-1"><button type="button" class="icon-button !border-0" title="Reducir mapa" aria-label="Reducir mapa" :disabled="cellSize <= 36" @click="cellSize -= 12"><Minus class="h-4 w-4"/></button><span class="w-12 text-center text-sm tabular-nums text-fg" role="status">{{ Math.round(cellSize / 48 * 100) }}%</span><button type="button" class="icon-button !border-0" title="Ampliar mapa" aria-label="Ampliar mapa" :disabled="cellSize >= 84" @click="cellSize += 12"><Plus class="h-4 w-4"/></button></div>
            </div>
          </div>
          <div class="relative"><div v-if="viewMode === 'iso' && found.length" class="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg shadow-sm" aria-hidden="true">Pasillo → Estante → Nivel → Espacio</div>
          <div ref="mapRoot" class="scrollbar-thin max-h-[72dvh] min-h-64 min-w-0 max-w-full overflow-auto bg-surface-secondary/50" :class="viewMode === 'iso' ? 'p-0' : 'p-4 sm:p-5'" @keydown="viewMode === 'grid' && moveFocus($event)">
            <div v-if="!found.length" class="py-12 text-center"><Search class="mx-auto mb-3 h-5 w-5 text-muted-fg"/><p class="text-sm font-medium">No encontramos espacios con estos filtros</p><button type="button" class="mt-3 text-xs font-medium text-accent hover:underline" @click="clearFilters">Ver todos los espacios</button></div>
            <div v-if="found.length && viewMode === 'iso'" class="mx-auto" :style="{ width: `${cellSize / 48 * 100}%`, minWidth: `${Math.round(scene.svgW * 0.5 * cellSize / 48)}px` }">
              <svg role="group" aria-label="Distribución esquemática del almacén por pasillo, estante, nivel y espacio" class="block h-auto w-full" :viewBox="`0 0 ${scene.svgW} ${scene.svgH}`">
                <defs>
                  <linearGradient :id="gid('floor')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color: hsl(var(--surface-secondary))" /><stop offset=".55" style="stop-color: hsl(var(--border) / .8)" /><stop offset="1" style="stop-color: hsl(var(--surface-secondary))" /></linearGradient>
                  <linearGradient :id="gid('wall-face')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color: hsl(var(--muted-fg) / .38)" /><stop offset="1" style="stop-color: hsl(var(--muted-fg) / .6)" /></linearGradient>
                  <linearGradient :id="gid('wall-cap')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color: hsl(var(--surface))" /><stop offset="1" style="stop-color: hsl(var(--muted-fg) / .25)" /></linearGradient>
                  <linearGradient :id="gid('shade-v')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22" /><stop offset="1" stop-color="#000" stop-opacity="0" /></linearGradient>
                  <linearGradient :id="gid('shade-l')" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".2" /><stop offset="1" stop-color="#000" stop-opacity="0" /></linearGradient>
                  <linearGradient :id="gid('shade-r')" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".2" /><stop offset="1" stop-color="#000" stop-opacity="0" /></linearGradient>
                  <linearGradient :id="rackIds.top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="ms-top-a" /><stop offset="1" class="ms-top-b" /></linearGradient>
                  <linearGradient :id="rackIds.side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="ms-side-a" /><stop offset="1" class="ms-side-b" /></linearGradient>
                  <linearGradient :id="rackIds.front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ms-front-a" /><stop offset="1" class="ms-front-b" /></linearGradient>
                  <filter :id="rackIds.blur" x="-20%" y="-10%" width="150%" height="130%"><feGaussianBlur stdDeviation="5" /></filter>
                </defs>
                <polygon :points="scene.leftWall.face" :fill="`url(#${gid('wall-face')})`" class="wall" /><polygon :points="scene.leftWall.cap" :fill="`url(#${gid('wall-cap')})`" class="wall" />
                <polygon :points="scene.rightWall.face" :fill="`url(#${gid('wall-face')})`" class="wall" /><polygon :points="scene.rightWall.cap" :fill="`url(#${gid('wall-cap')})`" class="wall" />
                <rect :x="scene.back.x" :y="scene.back.y" :width="scene.back.w" :height="scene.back.h" :fill="`url(#${gid('wall-face')})`" class="wall" />
                <polygon :points="scene.back.cap" :fill="`url(#${gid('wall-cap')})`" class="wall" />
                <g v-for="(x, index) in scene.back.pillars" :key="`pillar-${index}`" class="wall-pillar"><rect :x="x - 9" :y="scene.back.y - 4" width="18" :height="scene.back.h + 4" class="pillar-face" /><rect :x="x + 9" :y="scene.back.y - 4" width="6" :height="scene.back.h + 4" class="pillar-side" /><rect :x="x - 9" :y="scene.back.y - 9" width="24" height="5" class="pillar-top" /></g>
                <g class="wall-door"><rect :x="scene.back.door - 64" :y="scene.back.y + 10" width="128" :height="scene.back.h - 10" /><line v-for="n in 4" :key="n" :x1="scene.back.door - 64" :x2="scene.back.door + 64" :y1="scene.back.y + 10 + n * 13" :y2="scene.back.y + 10 + n * 13" /></g>
                <polygon :points="scene.floor" :fill="`url(#${gid('floor')})`" class="iso-floor" />
                <line v-for="(line, index) in scene.joints" :key="`joint-${index}`" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" class="floor-joint" />
                <polygon :points="scene.shades.back" :fill="`url(#${gid('shade-v')})`" class="shade" /><polygon :points="scene.shades.left" :fill="`url(#${gid('shade-l')})`" class="shade" /><polygon :points="scene.shades.right" :fill="`url(#${gid('shade-r')})`" class="shade" />
                <line v-for="(line, index) in scene.lines" :key="`lane-${index}`" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" class="lane-line" />
                <polygon :points="scene.safety" class="safety-line" />
                <template v-for="aisle in scene.aisles" :key="aisle.name">
                  <WarehouseMapRack v-for="rack in aisle.racks" :key="rack.key" :rack="rack" :aisle-name="aisle.name" :ids="rackIds" :selected-id="selectedId" :tabbable-id="isoTabbable" :labels="singleLabels" :is-muted="slot => !matches(slot)" :is-product="containsProduct" @select="selectSlot" @key="isoKey" />
                  <line :x1="aisle.pin.x1" :y1="aisle.pin.y1" :x2="aisle.pin.x2" :y2="aisle.pin.y2" class="aisle-pin" /><circle :cx="aisle.pin.x1" :cy="aisle.pin.y1" r="3.5" class="aisle-dot" />
                  <text :x="aisle.label.x" :y="aisle.label.y" text-anchor="middle" class="aisle-label">Pasillo {{ aisle.name }}</text>
                </template>
                <g class="wall-front"><rect :x="scene.front.x" :y="scene.front.y" :width="scene.front.w" :height="scene.front.h" class="front-face" /><polygon :points="scene.front.cap" class="front-cap" /><g v-for="(x, index) in scene.front.pillars" :key="`fp-${index}`"><rect :x="x - 9" :y="scene.front.y - 10" width="18" :height="scene.front.h + 12" class="pillar-face" /><rect :x="x - 9" :y="scene.front.y - 14" width="18" height="4" class="pillar-top" /></g></g>
              </svg>
            </div>
            <section v-for="aisle in (viewMode === 'grid' ? aisles : [])" :key="aisle.name" class="mb-7 last:mb-0" :aria-label="`Pasillo ${aisle.name}`">
              <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold"><span class="grid h-7 min-w-7 place-items-center rounded-md border border-border bg-surface px-1.5 text-xs">{{ aisle.name }}</span>Pasillo {{ aisle.name }}</h3>
              <div class="flex flex-wrap items-start gap-4">
                <section v-for="rack in aisle.racks" :key="rack.name" class="shrink-0 rounded-lg border border-border bg-surface p-3" :aria-label="`Estante ${rack.name}`">
                  <div class="mb-3 flex items-center justify-between gap-5"><h4 class="flex items-center gap-1.5 text-xs font-semibold"><Layers class="h-3.5 w-3.5 text-muted-fg"/>Estante {{ rack.name }}</h4><span class="text-[11px] text-muted-fg">{{ rack.count }} espacios</span></div>
                  <div :style="{ '--slot-size': `${cellSize}px` }">
                    <div class="mb-1 grid gap-2 text-center text-[11px] text-muted-fg" :style="{ gridTemplateColumns: `44px repeat(${rack.positions.length}, var(--slot-size))` }"><span class="text-left">Nivel</span><span v-for="position in rack.positions" :key="position" class="truncate" :title="`Posición ${position}`">{{ position }}</span></div>
                    <div v-for="level in rack.levels" :key="level.name" class="grid items-center gap-2 py-1.5" :style="{ gridTemplateColumns: `44px repeat(${rack.positions.length}, var(--slot-size))` }">
                      <span class="break-words text-xs font-medium text-muted-fg" :title="`Nivel ${level.name}`">{{ level.name }}</span>
                      <template v-for="(slot, index) in level.cells" :key="rack.positions[index]">
                        <button v-if="slot" type="button" :data-location-id="slot.id" :aria-pressed="selectedId === slot.id" :aria-label="`${slot.code}, ${singleLabels[slot.state]}, pasillo ${slot.aisle}, estante ${slot.rack}, nivel ${slot.level}, posición ${slot.position}${containsProduct(slot) ? ', ubicación del producto' : ''}`" :title="`${slot.code} · ${singleLabels[slot.state]}`" class="location-seat" :class="[`state-${slot.state}`, { 'product-seat': containsProduct(slot), 'selected-seat': selectedId === slot.id, 'muted-seat': !matches(slot) }]" @click="selectSlot(slot)">
                          <MapPin v-if="containsProduct(slot)" class="h-3.5 w-3.5"/><X v-else-if="slot.state === 'INACTIVE'" class="h-3.5 w-3.5"/><Minus v-else-if="slot.state === 'FULL'" class="h-3.5 w-3.5"/><Circle v-else class="h-2.5 w-2.5" :fill="slot.state === 'OCCUPIED' ? 'currentColor' : 'none'"/>
                          <span class="max-w-full truncate text-[10px] font-medium">{{ slot.position }}</span><Check v-if="selectedId === slot.id" class="seat-check h-3 w-3"/>
                        </button>
                        <span v-else aria-hidden="true" class="seat-gap" />
                      </template>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div></div>
          <p v-if="viewMode === 'grid'" class="border-t border-border px-5 py-3 text-sm text-muted-fg">Selecciona un espacio para consultar su contenido. Representación sin escala.</p>
          <div v-else class="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border px-5 py-3 text-sm text-muted-fg"><span>{{ scene.hasRatio ? 'Llenado calculado con la capacidad registrada' : 'Capacidad por definir · se muestra el estado real de cada espacio' }}</span><span>Distribución esquemática · Sin escala</span></div>
        </div>
        <aside ref="detailRoot" aria-label="Contenido del espacio" aria-live="polite" class="min-w-0 self-start rounded-[12px] border border-border bg-surface p-5 lg:min-h-[28rem]">
          <template v-if="selected">
            <p class="text-xs text-muted-fg">Espacio seleccionado</p><h2 class="mt-1 break-all text-lg font-semibold">{{ selected.code }}</h2>
            <p class="mt-2 flex items-center gap-2 text-xs"><span class="state-dot" :class="`state-${selected.state}`"/>{{ singleLabels[selected.state] }}</p>
            <p v-if="!matches(selected)" class="mt-3 text-xs text-muted-fg">Este espacio está fuera del filtro. <button type="button" class="text-accent hover:underline" @click="clearFilters">Mostrarlo</button></p>
            <dl class="my-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-surface-secondary/70 p-3 text-xs"><div><dt class="text-muted-fg">Pasillo</dt><dd class="mt-0.5 break-words font-medium">{{ selected.aisle }}</dd></div><div><dt class="text-muted-fg">Estante</dt><dd class="mt-0.5 break-words font-medium">{{ selected.rack }}</dd></div><div><dt class="text-muted-fg">Nivel</dt><dd class="mt-0.5 break-words font-medium">{{ selected.level }}</dd></div><div><dt class="text-muted-fg">Posición</dt><dd class="mt-0.5 break-words font-medium">{{ selected.position }}</dd></div></dl>
            <div v-if="selected.usedCapacity !== null" class="mb-4 flex justify-between gap-3 text-xs"><span class="text-muted-fg">Ocupación / capacidad</span><span class="font-medium tabular-nums">{{ format(selected.usedCapacity) }} / {{ format(selected.capacity) }}</span></div>
            <p v-else class="mb-4 text-xs leading-5 text-muted-fg">Hay unidades distintas; la capacidad no se compara como una sola cantidad.</p>
            <h3 class="border-t border-border pt-4 text-xs font-semibold">Contenido del espacio</h3>
            <ul class="divide-y divide-border"><li v-for="stock in selectedStocks" :key="stock.product.id" class="py-3" :class="stock.product.id === productId ? 'border-l-2 border-accent pl-3' : ''"><strong class="block break-words text-sm">{{ stock.product.name }}</strong><span class="mt-1 block break-all text-xs text-muted-fg">{{ stock.product.sku }}</span><p class="mt-2 text-sm font-semibold tabular-nums">{{ format(stock.quantity) }} <span class="text-xs font-normal text-muted-fg">{{ stock.product.purchaseUnit.name }}</span></p><button v-if="can('inventory.view')" type="button" class="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline" @click="emit('movements', { productId: stock.product.id, productName: stock.product.name, warehouseId, locationId: selected.id, locationCode: selected.code, warehouse: currentWarehouse })"><History class="h-3.5 w-3.5"/>Ver movimientos</button></li></ul>
            <p v-if="!selected.stocks.length" class="py-5 text-xs text-muted-fg">Sin existencias en este espacio.</p>
          </template>
          <div v-else class="grid min-h-60 place-items-center py-8 text-center"><div><MapPin class="mx-auto mb-4 h-7 w-7 text-muted-fg"/><h2 class="text-lg font-semibold">Detalle del espacio</h2><p class="mx-auto mt-2 max-w-52 text-sm leading-6 text-muted-fg">Elige una ubicación del mapa para ver coordenadas y productos.</p></div></div>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.state-AVAILABLE { color: hsl(var(--success)); background: hsl(var(--success) / .09); border-color: hsl(var(--success) / .35); }
.state-OCCUPIED { color: #37658a; background: #edf3f8; border-color: #b5c9db; }
.state-FULL { color: #94681f; background: #fbf5e9; border-color: #dacaac; }
.state-INACTIVE { color: hsl(var(--muted-fg)); background: hsl(var(--surface-secondary)); border-color: hsl(var(--border)); }
.state-dot { display: inline-block; width: 8px; height: 8px; flex-shrink: 0; border: 2px solid currentColor; border-radius: 50%; }
.state-dot.state-OCCUPIED, .state-dot.state-FULL { background: currentColor; }
.state-filter { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px; padding: 5px 12px; border: 1px solid transparent; border-radius: 8px; font-size: 14px; color: hsl(var(--muted-fg)); }
.state-filter:hover { background: hsl(var(--surface-secondary)); color: hsl(var(--fg)); }
.active-filter { border-color: hsl(var(--border)); background: hsl(var(--surface)); color: hsl(var(--fg)); font-weight: 600; }
.location-seat { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: var(--slot-size); height: var(--slot-size); border-width: 1px; border-radius: 7px; transition: opacity .15s, box-shadow .15s; }
.location-seat:hover { box-shadow: 0 0 0 2px hsl(var(--fg) / .2); }
.location-seat:focus-visible { outline: 2px solid hsl(var(--accent)); outline-offset: 3px; }
.product-seat { border-color: hsl(var(--accent)); box-shadow: inset 0 0 0 1px hsl(var(--accent)); }
.product-seat > svg:first-child { color: hsl(var(--accent)); }
.selected-seat { outline: 2px solid hsl(var(--fg)); outline-offset: 2px; }
.seat-check { position: absolute; right: -5px; top: -5px; border-radius: 50%; background: hsl(var(--fg)); color: hsl(var(--surface)); }
.muted-seat { opacity: .3; }
.wall, .wall-pillar, .wall-door, .iso-floor, .floor-joint, .shade, .lane-line, .safety-line, .aisle-pin, .aisle-dot, .aisle-label, .wall-front { pointer-events: none; }
.wall { stroke: hsl(var(--fg) / .14); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.pillar-face { fill: hsl(var(--muted-fg) / .55); }
.pillar-side { fill: hsl(var(--muted-fg) / .8); }
.pillar-top { fill: hsl(var(--surface)); stroke: hsl(var(--fg) / .12); stroke-width: 1; vector-effect: non-scaling-stroke; }
.wall-door rect { fill: hsl(var(--surface-secondary)); stroke: hsl(var(--fg) / .2); stroke-width: 1; vector-effect: non-scaling-stroke; }
.wall-door line { stroke: hsl(var(--fg) / .2); stroke-width: 1; vector-effect: non-scaling-stroke; }
.iso-floor { stroke: hsl(var(--fg) / .12); stroke-width: 1; vector-effect: non-scaling-stroke; }
.floor-joint { stroke: hsl(var(--fg) / .08); stroke-width: 1; vector-effect: non-scaling-stroke; }
.lane-line { stroke: hsl(var(--surface)); stroke-width: 2; stroke-dasharray: 9 9; opacity: .85; vector-effect: non-scaling-stroke; }
.safety-line { fill: none; stroke: #e8b400; stroke-width: 2; opacity: .9; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.front-face { fill: hsl(var(--muted-fg) / .4); stroke: hsl(var(--fg) / .14); stroke-width: 1; vector-effect: non-scaling-stroke; }
.front-cap { fill: hsl(var(--surface)); stroke: hsl(var(--fg) / .12); stroke-width: 1; vector-effect: non-scaling-stroke; }
.aisle-pin { stroke: hsl(var(--fg)); stroke-width: 2; vector-effect: non-scaling-stroke; }
.aisle-dot { fill: hsl(var(--fg)); }
.aisle-label { fill: hsl(var(--fg)); font-size: 26px; font-weight: 600; }
.ms-top-a { stop-color: hsl(var(--muted-fg) / .55); } .ms-top-b { stop-color: hsl(var(--muted-fg) / .88); }
.ms-side-a { stop-color: hsl(var(--muted-fg) / .7); } .ms-side-b { stop-color: hsl(var(--muted-fg) / .95); }
.ms-front-a { stop-color: hsl(var(--muted-fg) / .72); } .ms-front-b { stop-color: hsl(var(--muted-fg) / .95); }
:global(.dark .warehouse-location-map .ms-top-a) { stop-color: hsl(var(--muted-fg) / .34); } :global(.dark .warehouse-location-map .ms-top-b) { stop-color: hsl(var(--muted-fg) / .58); }
:global(.dark .warehouse-location-map .ms-side-a) { stop-color: hsl(var(--muted-fg) / .4); } :global(.dark .warehouse-location-map .ms-side-b) { stop-color: hsl(var(--muted-fg) / .64); }
:global(.dark .warehouse-location-map .ms-front-a) { stop-color: hsl(var(--muted-fg) / .44); } :global(.dark .warehouse-location-map .ms-front-b) { stop-color: hsl(var(--muted-fg) / .68); }
.seat-gap { width: var(--slot-size); height: var(--slot-size); }
:global(.dark .warehouse-location-map .state-OCCUPIED) { color: #96bede; background: #233544; border-color: #4b697f; }
:global(.dark .warehouse-location-map .state-FULL) { color: #e6c58e; background: #393225; border-color: #796342; }
</style>
