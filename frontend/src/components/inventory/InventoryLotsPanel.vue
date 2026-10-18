<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, MoveRight, PackageSearch, Printer, Search, Undo2, X } from 'lucide-vue-next';
import AppBadge from '../base/AppBadge.vue';
import AppButton from '../base/AppButton.vue';
import AppDrawer from '../base/AppDrawer.vue';
import SearchField from '../base/SearchField.vue';
import LabelPrintDialog from './LabelPrintDialog.vue';
import RelocateLotDialog from './RelocateLotDialog.vue';
import ReturnLotDialog from './ReturnLotDialog.vue';
import { inventoryGet } from '../../services/inventory.service';
import { activeCompanyId } from '../../services/company-context';
import { usePermissions } from '../../composables/usePermissions';
import { getApiErrorMessage } from '../../utils/api-error';
import { day, dateTime, locationLabel, lotStatusLabels, money, movementLabels, quantity, referenceLabel, transferStatusLabels } from '../../utils/inventory-format';

type Loc = { id: number; code: string; warehouse: { id: number; name: string; branch: { id: number; name: string } } };
type Lot = {
  id: number; lotCode: string; receivedAt: string; quantityReceived: string; unitCost: string; totalCost: string; status: string; onHand: string; inTransit: string;
  product: { id: number; name: string; sku: string; internalCode: string };
  purchaseItem: { unit: { name: string }; purchase: { id: number; documentNumber: string; supplier: { name: string } } } | null;
  locations: { quantity: string; location: Loc }[]; _count: { labelPrints: number };
};
type LotDetail = Lot & {
  purchaseItem: (Lot['purchaseItem'] & { unitCost: string; purchase: { id: number; documentNumber: string; purchaseDate: string; currency: string; supplier: { name: string }; purchaseOrder: { id: number; code: string } | null }; retaceoDetails: { unitCost: string; totalCost: string; retaceo: { id: number; code: string } }[] }) | null;
  transferItems: { id: number; quantity: string; receivedQuantity: string; transfer: { id: number; documentNumber: string; status: string; dispatchedAt: string | null; fromWarehouse: string | null; toWarehouse: string | null } }[];
  movements: { id: number; movementType: string; movementDate: string; quantityIn: string; quantityOut: string; referenceType: string; referenceId: number | null; reason: string; location: Loc | null; user: { username: string } | null }[];
  labelPrints: { id: number; quantityPrinted: number; printDate: string; reprintReason: string | null; user: { username: string } }[];
};

const props = defineProps<{ warehouses: { id: number; name: string; branch: { id: number; name: string }; locations: { id: number; code: string }[] }[] }>();
const { can } = usePermissions();
const lots = ref<Lot[]>([]), loading = ref(false), error = ref('');
const search = ref(''), warehouseId = ref(0), onlyAvailable = ref(true), status = ref('');
const page = ref(1), pages = ref(1), total = ref(0);
const selected = ref<LotDetail | null>(null), detailLoading = ref(false);
const printing = ref<LotDetail | Lot | null>(null);
const returning = ref<LotDetail | null>(null);
const returnable = (lot: LotDetail) => Math.max(0, Number(lot.quantityReceived) - Number(lot.onHand) - Number(lot.inTransit));
const moving = ref<{ lot: LotDetail; from: Loc; available: number } | null>(null);
const destinations = computed(() => props.warehouses.find(w => w.id === moving.value?.from.warehouse.id)?.locations ?? []);
let version = 0;

const statusVariant = (value: string) => value === 'ACTIVE' ? 'success' : value === 'CANCELLED' ? 'danger' : 'neutral';
const hasFilters = computed(() => !!(search.value || warehouseId.value || status.value || !onlyAvailable.value));

async function load() {
  const request = ++version;
  if (!activeCompanyId.value) return;
  loading.value = true; error.value = '';
  try {
    const result = await inventoryGet<{ items: Lot[]; total: number; totalPages: number }>('lots', { page: page.value, limit: 20, search: search.value.trim(), warehouseId: warehouseId.value, status: status.value, onlyAvailable: onlyAvailable.value });
    if (request !== version || result.company !== activeCompanyId.value) return;
    lots.value = result.data.items; total.value = result.data.total; pages.value = Math.max(1, result.data.totalPages);
    if (page.value > pages.value) { page.value = pages.value; await load(); }
  } catch (caught) { if (request === version) error.value = getApiErrorMessage(caught, 'No se pudieron cargar los lotes'); }
  finally { if (request === version) loading.value = false; }
}
async function openDetail(lot: Lot) {
  detailLoading.value = true; error.value = '';
  try { const result = await inventoryGet<LotDetail>(`lots/${lot.id}`); if (result.company === activeCompanyId.value) selected.value = result.data; }
  catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo cargar el lote'); }
  finally { detailLoading.value = false; }
}
function applyFilters() { page.value = 1; void load(); }
function clear() { search.value = ''; warehouseId.value = 0; status.value = ''; onlyAvailable.value = true; applyFilters(); }
async function moved() { await printed(); }
async function printed() { await load(); if (selected.value) { const id = selected.value.id; const result = await inventoryGet<LotDetail>(`lots/${id}`); if (result.company === activeCompanyId.value) selected.value = result.data; } }
watch(activeCompanyId, () => { selected.value = null; printing.value = null; moving.value = null; returning.value = null; lots.value = []; page.value = 1; search.value = ''; warehouseId.value = 0; status.value = ''; void load(); }, { immediate: true });
</script>

<template>
  <section class="surface-panel overflow-hidden">
    <form class="border-b border-border/70 p-4 sm:p-5" @submit.prevent="applyFilters">
      <div class="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(230px,1.4fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_auto]">
        <label class="text-xs font-medium text-muted-fg">Lote, producto o SKU<SearchField v-model="search" maxlength="100" placeholder="Buscar lotes" class="mt-1.5" /></label>
        <label class="text-xs font-medium text-muted-fg">Almacén<select v-model.number="warehouseId" class="field-control" @change="applyFilters"><option :value="0">Todos los almacenes</option><option v-for="w in props.warehouses" :key="w.id" :value="w.id">{{ w.name }} · {{ w.branch.name }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Estado<select v-model="status" class="field-control" @change="applyFilters"><option value="">Todos</option><option v-for="(label, value) in lotStatusLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <AppButton type="submit" variant="outline" :disabled="loading"><Search class="h-4 w-4" />Buscar</AppButton>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-4">
        <label class="inline-flex items-center gap-2 text-xs text-muted-fg"><input v-model="onlyAvailable" type="checkbox" class="h-4 w-4" @change="applyFilters" />Solo lotes con existencias</label>
        <button v-if="hasFilters" type="button" class="text-xs text-accent hover:underline" @click="clear">Limpiar filtros</button>
      </div>
    </form>
    <div class="flex items-center justify-between gap-3 px-4 py-4 sm:px-5"><h2 class="text-sm font-semibold">Lotes recibidos</h2><span class="text-xs tabular-nums text-muted-fg">{{ total }} lotes</span></div>
    <p v-if="error" role="alert" class="mx-4 mb-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger sm:mx-5">{{ error }}</p>
    <p v-if="loading" role="status" class="px-5 py-12 text-center text-sm text-muted-fg">Consultando lotes…</p>
    <div v-else-if="!lots.length" class="px-6 py-14 text-center"><PackageSearch class="mx-auto mb-3 h-7 w-7 text-muted-fg" /><p class="text-sm font-medium">No hay lotes para mostrar</p><p class="mt-1 text-xs text-muted-fg">Los lotes se crean al confirmar la colocación de una recepción de compra.</p></div>
    <template v-else>
      <div class="hidden max-w-full overflow-x-auto md:block">
        <table class="w-full min-w-[860px] text-left text-sm">
          <thead class="data-thead"><tr><th class="px-5 py-3 font-medium">Lote y producto</th><th class="px-5 py-3 font-medium">Recepción</th><th class="px-5 py-3 text-right font-medium">Recibido</th><th class="px-5 py-3 text-right font-medium">En existencia</th><th class="px-5 py-3 text-right font-medium">Costo unitario</th><th class="px-5 py-3 font-medium">Estado</th><th class="w-24 px-4 py-3"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody class="divide-y divide-border/70">
            <tr v-for="lot in lots" :key="lot.id" class="align-top hover:bg-surface-secondary/40">
              <td class="px-5 py-4"><button type="button" class="font-mono text-sm font-medium hover:text-accent" @click="openDetail(lot)">{{ lot.lotCode }}</button><p class="mt-1 text-sm">{{ lot.product.name }}</p><p class="text-xs text-muted-fg">{{ lot.product.sku }}</p></td>
              <td class="px-5 py-4"><p>{{ day(lot.receivedAt) }}</p><p class="mt-1 text-xs text-muted-fg">{{ lot.purchaseItem ? lot.purchaseItem.purchase.documentNumber : 'Lote de ajuste / apertura' }}</p></td>
              <td class="px-5 py-4 text-right tabular-nums">{{ quantity(lot.quantityReceived) }}<p class="mt-1 text-xs text-muted-fg">{{ lot.purchaseItem?.unit.name }}</p></td>
              <td class="px-5 py-4 text-right"><p class="font-semibold tabular-nums">{{ quantity(lot.onHand) }}</p><p v-if="Number(lot.inTransit) > 0" class="mt-1 text-xs text-warning">{{ quantity(lot.inTransit) }} en tránsito</p><p v-else class="mt-1 text-xs text-muted-fg">{{ lot.locations.length }} {{ lot.locations.length === 1 ? 'ubicación' : 'ubicaciones' }}</p></td>
              <td class="px-5 py-4 text-right tabular-nums">{{ money(lot.unitCost, 'USD', 4) }}</td>
              <td class="px-5 py-4"><AppBadge :variant="statusVariant(lot.status)">{{ lotStatusLabels[lot.status] }}</AppBadge></td>
              <td class="px-4 py-4"><div class="flex justify-end gap-1"><button v-if="can('inventory.label.print') && lot.status !== 'CANCELLED'" type="button" class="icon-button" :aria-label="`Imprimir etiquetas del lote ${lot.lotCode}`" @click="printing = lot"><Printer class="h-4 w-4" /></button></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="divide-y divide-border/70 md:hidden">
        <article v-for="lot in lots" :key="lot.id" class="p-4">
          <div class="flex items-start justify-between gap-3"><button type="button" class="min-w-0 text-left" @click="openDetail(lot)"><p class="font-mono text-sm font-medium">{{ lot.lotCode }}</p><p class="mt-1 text-sm">{{ lot.product.name }}</p></button><AppBadge :variant="statusVariant(lot.status)">{{ lotStatusLabels[lot.status] }}</AppBadge></div>
          <dl class="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt class="text-muted-fg">Recibido</dt><dd class="mt-0.5 font-medium tabular-nums">{{ quantity(lot.quantityReceived) }}</dd></div><div><dt class="text-muted-fg">Existencia</dt><dd class="mt-0.5 font-medium tabular-nums">{{ quantity(lot.onHand) }}</dd></div><div><dt class="text-muted-fg">Costo</dt><dd class="mt-0.5 font-medium tabular-nums">{{ money(lot.unitCost, 'USD', 4) }}</dd></div></dl>
          <button v-if="can('inventory.label.print') && lot.status !== 'CANCELLED'" type="button" class="mt-3 inline-flex items-center gap-1 text-xs text-accent" @click="printing = lot"><Printer class="h-3.5 w-3.5" />Imprimir etiquetas</button>
        </article>
      </div>
      <footer class="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-5"><span class="text-xs text-muted-fg">Página {{ page }} de {{ pages }}</span><div class="flex items-center gap-1"><button type="button" class="icon-button" aria-label="Página anterior" :disabled="loading || page <= 1" @click="page--; load()"><ChevronLeft class="h-4 w-4" /></button><button type="button" class="icon-button" aria-label="Página siguiente" :disabled="loading || page >= pages" @click="page++; load()"><ChevronRight class="h-4 w-4" /></button></div></footer>
    </template>
  </section>

  <AppDrawer v-if="selected" :label="`Lote ${selected.lotCode}`" size="lg" @close="selected = null">
    <div class="flex h-full min-h-0 flex-col">
      <header class="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
        <div class="min-w-0"><p class="font-mono text-xs text-muted-fg">{{ selected.lotCode }}</p><h2 class="mt-1 truncate text-lg font-semibold">{{ selected.product.name }}</h2><p class="mt-1 text-sm text-muted-fg">{{ selected.product.sku }} · código interno {{ selected.product.internalCode }}</p></div>
        <div class="flex shrink-0 items-center gap-2"><AppButton v-if="can('inventory.receive') && selected.status !== 'CANCELLED' && returnable(selected) > 0" variant="outline" @click="returning = selected"><Undo2 class="h-4 w-4" />Devolución</AppButton><AppButton v-if="can('inventory.label.print') && selected.status !== 'CANCELLED'" variant="outline" @click="printing = selected"><Printer class="h-4 w-4" />Etiquetas</AppButton><button type="button" class="icon-button" aria-label="Cerrar detalle" @click="selected = null"><X class="h-4 w-4" /></button></div>
      </header>
      <div class="min-h-0 flex-1 space-y-7 overflow-y-auto p-5 sm:p-6">
        <dl class="grid grid-cols-2 gap-4 rounded-xl bg-surface-secondary p-4 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-muted-fg">Recibido</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(selected.quantityReceived) }} {{ selected.purchaseItem?.unit.name }}</dd></div>
          <div><dt class="text-xs text-muted-fg">En ubicaciones</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(selected.onHand) }}</dd></div>
          <div><dt class="text-xs text-muted-fg">En tránsito</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(selected.inTransit) }}</dd></div>
          <div><dt class="text-xs text-muted-fg">Costo unitario</dt><dd class="mt-1 font-semibold tabular-nums">{{ money(selected.unitCost, selected.purchaseItem?.purchase.currency ?? 'USD', 4) }}</dd></div>
        </dl>

        <section><h3 class="text-sm font-semibold">Origen</h3>
          <dl v-if="selected.purchaseItem" class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt class="text-xs text-muted-fg">Recepción</dt><dd class="mt-0.5"><RouterLink v-if="can('purchases.view')" class="text-accent" :to="`/purchases/receipts?id=${selected.purchaseItem.purchase.id}`">{{ selected.purchaseItem.purchase.documentNumber }}</RouterLink><span v-else>{{ selected.purchaseItem.purchase.documentNumber }}</span> · {{ day(selected.purchaseItem.purchase.purchaseDate) }}</dd></div>
            <div><dt class="text-xs text-muted-fg">Proveedor</dt><dd class="mt-0.5">{{ selected.purchaseItem.purchase.supplier.name }}</dd></div>
            <div v-if="selected.purchaseItem.purchase.purchaseOrder"><dt class="text-xs text-muted-fg">Orden de compra</dt><dd class="mt-0.5">{{ selected.purchaseItem.purchase.purchaseOrder.code }}</dd></div>
            <div><dt class="text-xs text-muted-fg">Costo</dt><dd class="mt-0.5">Compra {{ money(selected.purchaseItem.unitCost, selected.purchaseItem.purchase.currency, 4) }}<template v-if="selected.purchaseItem.retaceoDetails[0]"> · final por retaceo <RouterLink v-if="can('retaceos.view')" class="text-accent" :to="`/purchases/retaceos?id=${selected.purchaseItem.retaceoDetails[0].retaceo.id}`">{{ selected.purchaseItem.retaceoDetails[0].retaceo.code }}</RouterLink><span v-else>{{ selected.purchaseItem.retaceoDetails[0].retaceo.code }}</span> {{ money(selected.purchaseItem.retaceoDetails[0].unitCost, selected.purchaseItem.purchase.currency, 4) }}</template></dd></div>
          </dl>
          <p v-else class="mt-3 text-sm text-muted-fg">Lote creado por un ajuste o por la apertura del inventario; no proviene de una recepción de compra.</p>
        </section>

        <section><h3 class="text-sm font-semibold">Distribución actual</h3>
          <p v-if="!selected.locations.length" class="mt-3 text-sm text-muted-fg">Este lote no tiene existencias en ubicaciones.</p>
          <ul v-else class="mt-3 divide-y divide-border/70 rounded-xl border border-border/70 text-sm"><li v-for="row in selected.locations" :key="row.location.id" class="flex items-center justify-between gap-4 px-4 py-3"><span>{{ row.location.warehouse.name }} <span class="text-muted-fg">· {{ row.location.warehouse.branch.name }} · {{ row.location.code }}</span></span><span class="flex items-center gap-3"><strong class="tabular-nums">{{ quantity(row.quantity) }}</strong><button v-if="can('inventory.location.assign') && selected.status !== 'CANCELLED'" type="button" class="inline-flex items-center gap-1 text-xs text-accent hover:underline" :aria-label="`Mover lote desde ${row.location.code}`" @click="moving = { lot: selected, from: row.location, available: Number(row.quantity) }"><MoveRight class="h-3.5 w-3.5" />Mover</button></span></li></ul>
        </section>

        <section v-if="selected.transferItems.length"><h3 class="text-sm font-semibold">Traslados</h3>
          <ul class="mt-3 divide-y divide-border/70 rounded-xl border border-border/70 text-sm"><li v-for="t in selected.transferItems" :key="t.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><span><strong>{{ t.transfer.documentNumber }}</strong> <span class="text-muted-fg">· {{ t.transfer.fromWarehouse }} → {{ t.transfer.toWarehouse }}</span></span><span class="flex items-center gap-2"><span class="tabular-nums">{{ quantity(t.receivedQuantity) }} / {{ quantity(t.quantity) }}</span><AppBadge :variant="t.transfer.status === 'COMPLETED' ? 'success' : t.transfer.status === 'INCIDENT' ? 'danger' : 'warning'">{{ transferStatusLabels[t.transfer.status] ?? t.transfer.status }}</AppBadge></span></li></ul>
        </section>

        <section><h3 class="text-sm font-semibold">Movimientos del lote</h3>
          <ol class="mt-3 divide-y divide-border/70 rounded-xl border border-border/70 text-sm"><li v-for="m in selected.movements" :key="m.id" class="flex flex-wrap items-start justify-between gap-3 px-4 py-3"><div><p class="font-medium">{{ movementLabels[m.movementType] ?? m.movementType }} · {{ referenceLabel({ ...m, lot: { purchaseItem: { purchase: selected.purchaseItem?.purchase } } }) }}</p><p class="mt-1 text-xs text-muted-fg">{{ dateTime(m.movementDate) }} · {{ locationLabel(m.location) }} · {{ m.user?.username ?? 'Sistema' }}</p></div><strong class="tabular-nums" :class="Number(m.quantityOut) > 0 ? 'text-danger' : 'text-success'">{{ Number(m.quantityOut) > 0 ? '−' + quantity(m.quantityOut) : '+' + quantity(m.quantityIn) }}</strong></li></ol>
        </section>

        <section><h3 class="text-sm font-semibold">Etiquetas impresas</h3>
          <p v-if="!selected.labelPrints.length" class="mt-3 text-sm text-muted-fg">Aún no se imprimieron etiquetas para este lote.</p>
          <ul v-else class="mt-3 divide-y divide-border/70 rounded-xl border border-border/70 text-sm"><li v-for="p in selected.labelPrints" :key="p.id" class="px-4 py-3"><p class="font-medium">{{ p.quantityPrinted }} {{ p.quantityPrinted === 1 ? 'etiqueta' : 'etiquetas' }} · {{ dateTime(p.printDate) }}</p><p class="mt-1 text-xs text-muted-fg">{{ p.user.username }}<template v-if="p.reprintReason"> · Reimpresión: {{ p.reprintReason }}</template></p></li></ul>
        </section>
      </div>
    </div>
  </AppDrawer>

  <ReturnLotDialog v-if="returning" :lot="{ id: returning.id, lotCode: returning.lotCode, productName: returning.product.name, returnable: returnable(returning) }" :warehouses="props.warehouses" @close="returning = null" @returned="moved" />
  <RelocateLotDialog v-if="moving" :lot="{ id: moving.lot.id, lotCode: moving.lot.lotCode, productName: moving.lot.product.name }" :from="{ id: moving.from.id, code: moving.from.code, warehouseName: moving.from.warehouse.name, available: moving.available }" :destinations="destinations" @close="moving = null" @moved="moved" />
  <LabelPrintDialog v-if="printing" :lot="{ id: printing.id, lotCode: printing.lotCode, productName: printing.product.name, onHand: Number(printing.onHand), hasPrints: 'labelPrints' in printing ? printing.labelPrints.length > 0 : printing._count.labelPrints > 0 }" @close="printing = null" @printed="printed" />
</template>
