<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Check, Circle, Focus, History, Layers, MapPin, Minus, Plus, RefreshCw, Search, X } from 'lucide-vue-next';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { getApiErrorMessage } from '../utils/api-error';
import { matchesMapSearch, resolveMapWarehouse, warehouseBranchKey, warehouseBranches, type MapWarehouse } from '../utils/warehouse-map';

type State = 'AVAILABLE' | 'OCCUPIED' | 'FULL' | 'INACTIVE';
type Slot = { id: number; code: string; aisle: string; rack: string; level: string; position: string; capacity: number;
  state: State; usedCapacity: string | null; freeCapacity: string | null;
  stocks: { quantity: string; product: { id: number; name: string; sku: string; purchaseUnit: { id: number; name: string } } }[] };
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
const aisles = computed(() => aisleNames.value.map(aisle => ({
  name: aisle,
  racks: [...new Set(slots.value.filter(slot => slot.aisle === aisle).map(slot => slot.rack))].sort(compare).map(rack => {
    const members = slots.value.filter(slot => slot.aisle === aisle && slot.rack === rack);
    const positions = [...new Set(members.map(slot => slot.position))].sort(compare);
    return { name: rack, count: members.length, matches: members.filter(matches).length, positions,
      levels: [...new Set(members.map(slot => slot.level))].sort((a, b) => compare(b, a)).map(level => ({
        name: level, cells: positions.map(position => members.find(slot => slot.level === level && slot.position === position)),
      })) };
  }).filter(rack => rack.matches > 0),
})).filter(aisle => aisle.racks.length));
// Isometric scene: aisles run along gx, racks and positions along gy, levels along gz. Presentation only; the data is the same slots as the grid.
type IsoOp =
  | { kind: 'shelf' | 'floor'; key: string; points: string }
  | { kind: 'post'; key: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'label'; key: string; x: number; y: number; text: string }
  | { kind: 'slot'; key: string; slot: Slot; top: string; left: string; right: string; cx: number; cy: number };
const U = 34, COS = Math.cos(Math.PI / 6);
const project = (gx: number, gy: number, gz: number) => ({ x: (gx - gy) * COS * U, y: (gx + gy) * 0.5 * U - gz * U });
const pts = (list: { x: number; y: number }[]) => list.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
const logicalOrder = computed(() => aisles.value.flatMap(aisle => aisle.racks.flatMap(rack => rack.levels.flatMap(level => level.cells.filter((cell): cell is Slot => !!cell)))));
const isoScene = computed(() => {
  const ops: IsoOp[] = [];
  const all: { x: number; y: number }[] = [];
  const STEP = 1.18, AISLE = 3.2;
  const PER_ROW = 4;
  let rowOffset = 0, rowDepth = 0, maxX = 0;
  const layout = aisles.value.map((aisle, ai) => {
    const col = ai % PER_ROW;
    if (ai > 0 && col === 0) { rowOffset += rowDepth + 1.6; rowDepth = 0; }
    let cursor = rowOffset;
    const racks = aisle.racks.map(rack => {
      const start = cursor, length = rack.positions.length * STEP;
      cursor += length + 1.1;
      return { rack, start, end: start + length };
    });
    rowDepth = Math.max(rowDepth, cursor - rowOffset);
    maxX = Math.max(maxX, col * AISLE + 1);
    return { aisle, gx: col * AISLE, racks, labelY: cursor - 0.85 };
  });
  const maxY = rowOffset + rowDepth;
  const floorCorners = [project(-1.2, -1, 0), project(maxX + 1.4, -1, 0), project(maxX + 1.4, maxY + 0.6, 0), project(-1.2, maxY + 0.6, 0)];
  ops.push({ kind: 'floor', key: 'floor', points: pts(floorCorners) });
  all.push(...floorCorners);
  for (const { aisle, gx, racks, labelY } of layout) {
    for (const { rack, start, end } of racks) {
      const levels = rack.levels.length;
      const x0 = gx - 0.08, x1 = gx + 1.08, y0 = start - 0.08, y1 = end - (STEP - 1) + 0.08;
      const key = `${aisle.name}-${rack.name}`;
      [[x0, y0], [x1, y0]].forEach(([px, py], i) => { const a = project(px!, py!, 0), b = project(px!, py!, levels); ops.push({ kind: 'post', key: `${key}-pb${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y }); all.push(b); });
      for (let li = 0; li < levels; li++) {
        const gz = levels - 1 - li;
        ops.push({ kind: 'shelf', key: `${key}-shelf${li}`, points: pts([project(x0, y0, gz), project(x1, y0, gz), project(x1, y1, gz), project(x0, y1, gz)]) });
      }
      for (let pi = 0; pi < rack.positions.length; pi++) {
        for (let li = levels - 1; li >= 0; li--) {
          const slot = rack.levels[li]!.cells[pi];
          if (!slot) continue;
          const gz = levels - 1 - li, ya = start + pi * STEP, yb = ya + 1, xa = gx, xb = gx + 1, za = gz + 0.05, zb = gz + 0.78;
          const P = project;
          ops.push({ kind: 'slot', key: `slot-${slot.id}`, slot,
            top: pts([P(xa, ya, zb), P(xb, ya, zb), P(xb, yb, zb), P(xa, yb, zb)]),
            right: pts([P(xb, ya, za), P(xb, yb, za), P(xb, yb, zb), P(xb, ya, zb)]),
            left: pts([P(xa, yb, za), P(xb, yb, za), P(xb, yb, zb), P(xa, yb, zb)]),
            cx: P(xa + 0.5, ya + 0.5, zb).x, cy: P(xa + 0.5, ya + 0.5, zb).y });
        }
      }
      [[x0, y1], [x1, y1]].forEach(([px, py], i) => { const a = project(px!, py!, 0), b = project(px!, py!, levels); ops.push({ kind: 'post', key: `${key}-pf${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y }); all.push(b); });
    }
    const label = project(gx + 0.5, labelY, 0);
    ops.push({ kind: 'label', key: `label-${aisle.name}`, x: label.x, y: label.y + 4, text: `Pasillo ${aisle.name}` });
  }
  const minX = Math.min(...all.map(point => point.x)) - 20, maxPX = Math.max(...all.map(point => point.x)) + 20;
  const minY = Math.min(...all.map(point => point.y)) - 20, maxPY = Math.max(...all.map(point => point.y)) + 26;
  return { ops, viewBox: `${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxPX - minX).toFixed(0)} ${(maxPY - minY).toFixed(0)}`, width: maxPX - minX, height: maxPY - minY };
});
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
          <div ref="mapRoot" class="scrollbar-thin max-h-[70dvh] min-h-64 min-w-0 max-w-full overflow-auto bg-surface-secondary/50 p-4 sm:p-5" @keydown="viewMode === 'grid' && moveFocus($event)">
            <div v-if="!found.length" class="py-12 text-center"><Search class="mx-auto mb-3 h-5 w-5 text-muted-fg"/><p class="text-sm font-medium">No encontramos espacios con estos filtros</p><button type="button" class="mt-3 text-xs font-medium text-accent hover:underline" @click="clearFilters">Ver todos los espacios</button></div>
            <svg v-if="found.length && viewMode === 'iso'" role="group" aria-label="Distribución esquemática del almacén por pasillo y estante" class="mx-auto block max-w-none" :viewBox="isoScene.viewBox" :width="isoScene.width * cellSize / 48 * 0.9" :height="isoScene.height * cellSize / 48 * 0.9">
              <template v-for="op in isoScene.ops" :key="op.key">
                <polygon v-if="op.kind === 'floor'" :points="op.points" class="iso-floor" />
                <polygon v-else-if="op.kind === 'shelf'" :points="op.points" class="iso-shelf" />
                <line v-else-if="op.kind === 'post'" :x1="op.x1" :y1="op.y1" :x2="op.x2" :y2="op.y2" class="iso-post" />
                <text v-else-if="op.kind === 'label'" :x="op.x" :y="op.y" text-anchor="middle" class="iso-label">{{ op.text }}</text>
                <g v-else-if="op.kind === 'slot'" :data-location-id="op.slot.id" role="button" :tabindex="isoTabbable === op.slot.id ? 0 : -1" :aria-pressed="selectedId === op.slot.id" :aria-label="`${op.slot.code}, ${singleLabels[op.slot.state]}, pasillo ${op.slot.aisle}, estante ${op.slot.rack}, nivel ${op.slot.level}, posición ${op.slot.position}${containsProduct(op.slot) ? ', ubicación del producto' : ''}`" class="iso-slot" :class="[`iso-${op.slot.state}`, { 'iso-selected': selectedId === op.slot.id, 'iso-product': containsProduct(op.slot), 'iso-muted': !matches(op.slot) }]" @click="selectSlot(op.slot)" @keydown="isoKey($event, op.slot)">
                  <title>{{ op.slot.code }} · {{ singleLabels[op.slot.state] }}</title>
                  <polygon :points="op.left" class="iso-l" /><polygon :points="op.right" class="iso-r" /><polygon :points="op.top" class="iso-t" />
                </g>
              </template>
            </svg>
            <p v-if="found.length && viewMode === 'iso'" class="mt-3 text-center text-xs text-muted-fg">Distribución esquemática · Representación sin escala</p>
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
          </div>
          <p class="border-t border-border px-5 py-3 text-sm text-muted-fg">Selecciona un espacio para consultar su contenido. Representación sin escala.</p>
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
.iso-floor, .iso-shelf, .iso-post, .iso-label { pointer-events: none; }
.iso-floor { fill: hsl(var(--surface-secondary)); stroke: hsl(var(--border)); stroke-width: 1; vector-effect: non-scaling-stroke; }
.iso-shelf { fill: hsl(var(--surface)); stroke: hsl(var(--border)); stroke-width: 1; vector-effect: non-scaling-stroke; }
.iso-post { stroke: hsl(var(--muted-fg) / .55); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.iso-label { fill: hsl(var(--fg)); font-size: 15px; font-weight: 600; }
.iso-slot { cursor: pointer; outline: none; transition: opacity .15s; }
.iso-slot polygon { stroke: hsl(var(--fg) / .28); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.iso-t { fill: var(--iso-t); } .iso-l { fill: var(--iso-l); } .iso-r { fill: var(--iso-r); }
.iso-AVAILABLE { --iso-t: #8fdcaa; --iso-l: #5fbf84; --iso-r: #48a56c; }
.iso-OCCUPIED { --iso-t: #8dbcf0; --iso-l: #5f9be0; --iso-r: #4682cb; }
.iso-FULL { --iso-t: #f5c47c; --iso-l: #e3a14a; --iso-r: #cb8736; }
.iso-INACTIVE { --iso-t: #d5dae0; --iso-l: #b9c0c8; --iso-r: #a2aab4; }
.iso-slot:hover polygon { stroke: hsl(var(--fg)); }
.iso-slot:focus-visible polygon { stroke: hsl(var(--accent)); stroke-width: 3; }
.iso-product polygon { stroke: hsl(var(--accent)); stroke-width: 2; }
.iso-selected polygon { stroke: hsl(var(--fg)); stroke-width: 3; }
.iso-muted { opacity: .25; }
.seat-gap { width: var(--slot-size); height: var(--slot-size); }
:global(.dark .warehouse-location-map .iso-AVAILABLE) { --iso-t: #4fae75; --iso-l: #3b8f5c; --iso-r: #2f774c; }
:global(.dark .warehouse-location-map .iso-OCCUPIED) { --iso-t: #5b8fcf; --iso-l: #4575b3; --iso-r: #365f96; }
:global(.dark .warehouse-location-map .iso-FULL) { --iso-t: #d29a4a; --iso-l: #b47f35; --iso-r: #98692a; }
:global(.dark .warehouse-location-map .iso-INACTIVE) { --iso-t: #6a7078; --iso-l: #555b63; --iso-r: #464b52; }
:global(.dark .warehouse-location-map .state-OCCUPIED) { color: #96bede; background: #233544; border-color: #4b697f; }
:global(.dark .warehouse-location-map .state-FULL) { color: #e6c58e; background: #393225; border-color: #796342; }
</style>
