<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronDown, ChevronLeft, ChevronRight, ScrollText } from 'lucide-vue-next';
import AppInput from '../base/AppInput.vue';
import TrackingLink from '../purchases/TrackingLink.vue';
import { inventoryGet } from '../../services/inventory.service';
import { activeCompanyId } from '../../services/company-context';
import { getApiErrorMessage } from '../../utils/api-error';
import { day, dateTime, locationLabel, money, movementFilterLabels, movementLabels, processLabel, quantity, referenceLabel, supportDocumentLabel } from '../../utils/inventory-format';

type Row = {
  id: number; sequence: number; movementType: string; movementDate: string; quantityIn: string; quantityOut: string; unitCost: string;
  runningQuantity: string; runningValue: string; runningAverage: string; entryCost: string | null; exitCost: string | null; costAdjustment: boolean;
  referenceType: string; referenceId: number | null; reason: string;
  supportDocument: { number: string; supplierInvoiceNumber: string | null; supplierInvoiceDate: string | null; receipt: string; receiptId: number; fiscalDocumentMissing: boolean;
    process: { requests: { id: number; code: string }[]; consolidation: { code: string } | null; quotation: { code: string } | null; order: { code: string } | null; receipt: { code: string }; retaceos: { code: string }[] } | null } | null;
  supplier: { name: string; code: string; country: string } | null;
  lot: { id: number; lotCode: string; purchaseItem: { purchase: { documentNumber: string } } | null } | null;
  location: { code: string; warehouse: { name: string } } | null; user: { username: string } | null;
};
type Kardex = {
  header: { title: string; company: { name: string; commercialName: string; nit: string; nrc: string }; period: { from: string | null; to: string | null }; consolidated: boolean; scope: { branch: { id: number; name: string } | null; warehouse: { id: number; name: string } | null } };
  product: { id: number; name: string; sku: string; internalCode: string; presentation: string | null; description: string | null; purchaseUnit: { name: string }; category: { name: string }; subcategory: { name: string } };
  opening: string; openingValue: string; closing: string; closingValue: string; closingAverage: string; missingFiscalDocuments: string[];
  totals: { quantityIn: string; quantityOut: string; entryCost: string; exitCost: string };
  items: Row[]; total: number; totalPages: number;
};

const props = defineProps<{ products: { id: number; name: string; sku: string }[]; warehouses: { id: number; name: string; branch: { id: number; name: string } }[] }>();
const productId = ref(0), branchId = ref(0), warehouseId = ref(0), lotId = ref(0), type = ref(''), dateFrom = ref(''), dateTo = ref('');
const lotOptions = ref<{ id: number; lotCode: string }[]>([]);
const kardex = ref<Kardex | null>(null), loading = ref(false), error = ref('');
const page = ref(1), expanded = ref<Set<number>>(new Set());
let version = 0;

const zone = 'America/El_Salvador';
const dayKey = (date: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(date));
const timeOnly = (date: string) => new Intl.DateTimeFormat('es-SV', { timeStyle: 'short', timeZone: zone }).format(new Date(date));
/** La fecha completa solo cuando cambia el día; el resto de las operaciones del mismo día muestra la hora. */
const whenLabel = (row: Row, index: number) => index === 0 || dayKey(kardex.value!.items[index - 1]!.movementDate) !== dayKey(row.movementDate) ? dateTime(row.movementDate) : timeOnly(row.movementDate);
const title = (row: Row) => row.costAdjustment ? 'Ajuste de costo' : (movementLabels[row.movementType] ?? row.movementType);
const subtitle = (row: Row) => [row.lot?.lotCode ?? 'Sin lote (histórico)', locationLabel(row.location), row.user?.username ?? 'Apertura del sistema'].join(' · ');
const toggle = (id: number) => { const next = new Set(expanded.value); if (next.has(id)) next.delete(id); else next.add(id); expanded.value = next; };

const branches = computed(() => [...new Map(props.warehouses.map(w => [w.branch.id, w.branch])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es')));
const warehouseOptions = computed(() => branchId.value ? props.warehouses.filter(w => w.branch.id === branchId.value) : props.warehouses);
const scopeLabel = computed(() => {
  if (!kardex.value) return '';
  const { branch, warehouse } = kardex.value.header.scope;
  const extras = `${lotId.value ? ' · un lote' : ''}${type.value ? ' · ' + (movementLabels[type.value] ?? type.value) : ''}`;
  if (kardex.value.header.consolidated) return 'Consolidado de la empresa; los traslados entre almacenes no se cuentan como entradas ni salidas.';
  if (warehouse) return `Almacén ${warehouse.name}${branch ? ' · ' + branch.name : ''}${extras}; el traslado hacia otro almacén es una salida y el que llega, una entrada.`;
  if (branch) return `Sucursal ${branch.name}${extras}; el traslado hacia otra sucursal es una salida y el que llega, una entrada. Los traslados entre sus propios almacenes no se cuentan.`;
  return `Filtrado${extras}; incluye los traslados entre almacenes.`;
});
const periodLabel = computed(() => {
  const period = kardex.value?.header.period;
  if (!period) return '';
  const format = (value: string) => day(`${value}T12:00:00-06:00`);
  return period.from && period.to ? `Del ${format(period.from)} al ${format(period.to)}` : period.from ? `Desde el ${format(period.from)}` : period.to ? `Hasta el ${format(period.to)}` : 'Todo el historial';
});

async function loadLots() {
  lotId.value = 0; lotOptions.value = [];
  if (!productId.value) return;
  try { const result = await inventoryGet<{ items: { id: number; lotCode: string }[] }>('lots', { productId: productId.value, limit: 100 }); if (result.company === activeCompanyId.value) lotOptions.value = result.data.items; } catch { lotOptions.value = []; }
}
async function load() {
  const request = ++version;
  kardex.value = null; error.value = ''; expanded.value = new Set();
  if (!productId.value || !activeCompanyId.value) return;
  loading.value = true;
  try {
    const result = await inventoryGet<Kardex>('kardex', { productId: productId.value, branchId: branchId.value, warehouseId: warehouseId.value, lotId: lotId.value, type: type.value, dateFrom: dateFrom.value, dateTo: dateTo.value, page: page.value, limit: 100 });
    if (request === version && result.company === activeCompanyId.value) kardex.value = result.data;
  } catch (caught) { if (request === version) error.value = getApiErrorMessage(caught, 'No se pudo cargar el Kardex'); }
  finally { if (request === version) loading.value = false; }
}
function filter() { page.value = 1; void load(); }
function pickBranch() { if (warehouseId.value && !warehouseOptions.value.some(w => w.id === warehouseId.value)) warehouseId.value = 0; filter(); }
function pickProduct() { void loadLots(); filter(); }
watch(activeCompanyId, () => { productId.value = 0; branchId.value = 0; warehouseId.value = 0; lotId.value = 0; type.value = ''; dateFrom.value = ''; dateTo.value = ''; lotOptions.value = []; kardex.value = null; page.value = 1; });
</script>

<template>
  <section class="space-y-4">
    <form class="surface-panel p-4 sm:p-5" @submit.prevent="filter">
      <div class="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label class="text-xs font-medium text-muted-fg">Producto<select v-model.number="productId" class="field-control" @change="pickProduct"><option :value="0">Seleccione un producto</option><option v-for="p in props.products" :key="p.id" :value="p.id">{{ p.sku }} · {{ p.name }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Sucursal<select v-model.number="branchId" class="field-control" :disabled="!productId" @change="pickBranch"><option :value="0">Consolidado de la empresa</option><option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Almacén<select v-model.number="warehouseId" class="field-control" :disabled="!productId" @change="filter"><option :value="0">{{ branchId ? 'Todos los almacenes de la sucursal' : 'Todos los almacenes' }}</option><option v-for="w in warehouseOptions" :key="w.id" :value="w.id">{{ w.name }}{{ branchId ? '' : ' · ' + w.branch.name }}</option></select></label>
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="text-xs font-medium text-muted-fg">Lote<select v-model.number="lotId" class="field-control" :disabled="!productId" @change="filter"><option :value="0">Todos los lotes</option><option v-for="l in lotOptions" :key="l.id" :value="l.id">{{ l.lotCode }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Tipo<select v-model="type" class="field-control" :disabled="!productId" @change="filter"><option value="">Todos los movimientos</option><option v-for="(label, value) in movementFilterLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <AppInput v-model="dateFrom" type="date" label="Desde" :max="dateTo || undefined" :disabled="!productId" @change="filter" />
        <AppInput v-model="dateTo" type="date" label="Hasta" :min="dateFrom || undefined" :disabled="!productId" @change="filter" />
      </div>
    </form>
    <p v-if="error" role="alert" class="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{{ error }}</p>
    <div v-if="!productId" class="surface-panel px-6 py-14 text-center"><ScrollText class="mx-auto mb-3 h-7 w-7 text-muted-fg" /><p class="text-sm font-medium">Elija un producto para ver su registro de control de inventarios</p><p class="mt-1 text-xs text-muted-fg">Se construye con los movimientos confirmados e incluye unidades y costo de entradas, salidas y saldo.</p></div>
    <p v-else-if="loading" role="status" class="surface-panel px-5 py-12 text-center text-sm text-muted-fg">Consultando Kardex…</p>
    <template v-else-if="kardex">
      <header class="surface-panel p-4 sm:p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-fg">{{ kardex.header.title }} · Art. 142-A del Código Tributario</p>
        <dl class="mt-3 grid gap-x-8 gap-y-4 text-sm lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
          <div><dt class="text-xs text-muted-fg">Contribuyente</dt><dd class="mt-0.5 font-semibold">{{ kardex.header.company.name }}</dd><dd v-if="kardex.header.scope.branch" class="mt-0.5 text-muted-fg">Establecimiento: {{ kardex.header.scope.branch.name }}{{ kardex.header.scope.warehouse ? ' · ' + kardex.header.scope.warehouse.name : '' }}</dd></div>
          <div><dt class="text-xs text-muted-fg">NIT</dt><dd class="mt-0.5 font-semibold tabular-nums">{{ kardex.header.company.nit }}</dd></div>
          <div><dt class="text-xs text-muted-fg">NRC</dt><dd class="mt-0.5 font-semibold tabular-nums">{{ kardex.header.company.nrc }}</dd></div>
          <div><dt class="text-xs text-muted-fg">Producto</dt><dd class="mt-0.5 font-semibold">{{ [kardex.product.name, kardex.product.presentation].filter(Boolean).join(' · ') }}</dd><dd v-if="kardex.product.description" class="mt-0.5 text-muted-fg">{{ kardex.product.description }}</dd></div>
          <div><dt class="text-xs text-muted-fg">Código · Unidad</dt><dd class="mt-0.5 font-semibold">{{ kardex.product.sku }} · {{ kardex.product.internalCode }}</dd><dd class="mt-0.5 text-muted-fg">{{ kardex.product.purchaseUnit.name }}</dd></div>
          <div><dt class="text-xs text-muted-fg">Período</dt><dd class="mt-0.5 font-semibold">{{ periodLabel }}</dd></div>
          <div class="lg:col-span-3"><dt class="text-xs text-muted-fg">Categoría</dt><dd class="mt-0.5">{{ kardex.product.category.name }} › {{ kardex.product.subcategory.name }}</dd><dd class="mt-1 text-xs text-muted-fg">{{ scopeLabel }}</dd></div>
        </dl>
      </header>

      <dl class="surface-panel grid grid-cols-2 divide-border/70 text-sm lg:grid-cols-4 lg:divide-x">
        <div class="p-4 sm:px-5"><dt class="text-xs text-muted-fg">Saldo inicial</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(kardex.opening) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.openingValue) }}</dd></div>
        <div class="p-4 sm:px-5"><dt class="text-xs text-muted-fg">Entradas del período</dt><dd class="mt-1 font-semibold tabular-nums text-success">+{{ quantity(kardex.totals.quantityIn) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.totals.entryCost) }}</dd></div>
        <div class="p-4 sm:px-5"><dt class="text-xs text-muted-fg">Salidas del período</dt><dd class="mt-1 font-semibold tabular-nums text-danger">−{{ quantity(kardex.totals.quantityOut) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.totals.exitCost) }}</dd></div>
        <div class="p-4 sm:px-5"><dt class="text-xs text-muted-fg">Saldo final</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(kardex.closing) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.closingValue) }} · promedio {{ money(kardex.closingAverage, 'USD', 4) }}</dd></div>
      </dl>

      <div class="surface-panel overflow-hidden">
        <p class="border-b border-border/70 px-4 py-2.5 text-xs text-muted-fg sm:px-5">Cantidades en {{ kardex.product.purchaseUnit.name }} · Importes en dólares</p>
        <div v-if="!kardex.items.length" class="px-6 py-12 text-center text-sm text-muted-fg">No hay movimientos con estos filtros.</div>
        <template v-else>
          <table class="hidden w-full table-fixed text-left text-sm md:table">
            <colgroup><col /><col class="w-[88px]" /><col class="w-[88px]" /><col class="w-[96px]" /><col class="w-[96px]" /><col class="w-[96px]" /></colgroup>
            <thead class="data-thead"><tr><th class="px-4 py-2.5 font-medium">Movimiento y respaldo</th><th class="px-2 py-2.5 text-right font-medium">Entrada</th><th class="px-2 py-2.5 text-right font-medium">Salida</th><th class="px-2 py-2.5 text-right font-medium">Saldo</th><th class="px-2 py-2.5 text-right font-medium leading-tight">Costo unit. aplicado</th><th class="px-3 py-2.5 text-right font-medium leading-tight">Promedio resultante</th></tr></thead>
            <tbody class="divide-y divide-border/70">
              <template v-for="(row, index) in kardex.items" :key="row.id">
                <tr class="align-top hover:bg-surface-secondary/40">
                  <td class="px-4 py-3">
                    <div class="flex items-start gap-2">
                      <span class="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-muted-fg">{{ row.sequence }}</span>
                      <button type="button" class="icon-button -my-1 shrink-0" :aria-expanded="expanded.has(row.id)" :aria-label="`${expanded.has(row.id) ? 'Ocultar' : 'Ver'} el detalle de la operación ${row.sequence}`" @click="toggle(row.id)"><ChevronDown class="h-4 w-4 transition-transform" :class="expanded.has(row.id) ? '' : '-rotate-90'" /></button>
                      <span class="w-[5.5rem] shrink-0 pt-0.5 text-xs leading-tight text-muted-fg">{{ whenLabel(row, index) }}</span>
                      <div class="min-w-0"><p class="font-medium">{{ title(row) }}</p><p class="mt-0.5 truncate text-xs text-muted-fg" :title="subtitle(row)">{{ subtitle(row) }}</p></div>
                    </div>
                  </td>
                  <td class="px-2 py-3 text-right tabular-nums"><template v-if="Number(row.quantityIn)"><p class="font-medium text-success">+{{ quantity(row.quantityIn) }} u.</p><p class="text-xs text-muted-fg">{{ money(row.entryCost ?? 0) }}</p></template><template v-else-if="row.costAdjustment"><p class="text-xs text-muted-fg">{{ money(row.entryCost ?? 0) }}</p></template><span v-else class="text-muted-fg">—</span></td>
                  <td class="px-2 py-3 text-right tabular-nums"><template v-if="Number(row.quantityOut)"><p class="font-medium text-danger">−{{ quantity(row.quantityOut) }} u.</p><p class="text-xs text-muted-fg">{{ money(row.exitCost ?? 0) }}</p></template><span v-else class="text-muted-fg">—</span></td>
                  <td class="px-2 py-3 text-right tabular-nums"><p class="font-semibold">{{ quantity(row.runningQuantity) }} u.</p><p class="text-xs text-muted-fg">{{ money(row.runningValue) }}</p></td>
                  <td class="px-2 py-3 text-right tabular-nums">{{ row.costAdjustment ? '—' : money(row.unitCost, 'USD', 4) }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ money(row.runningAverage, 'USD', 4) }}</td>
                </tr>
                <tr v-if="expanded.has(row.id)" class="bg-surface-secondary/50">
                  <td colspan="6" class="px-4 py-4 sm:pl-[4.5rem]">
                    <dl class="grid gap-x-8 gap-y-3 text-sm lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <div><dt class="text-xs text-muted-fg">{{ row.supportDocument ? 'Cadena de documentos' : 'Documento de origen' }}</dt>
                        <dd v-if="row.supportDocument" class="mt-0.5 font-medium">{{ processLabel(row.supportDocument.process, row.supportDocument.receipt) }}</dd><dd v-else class="mt-0.5 font-medium">{{ referenceLabel(row) }}</dd>
                        <dd v-if="row.supportDocument" class="mt-0.5 text-xs text-muted-fg">{{ row.supportDocument.fiscalDocumentMissing ? 'Documento del proveedor: no registrado' : supportDocumentLabel(row.supportDocument) }}</dd>
                        <dd v-else class="mt-0.5 text-xs text-muted-fg">{{ row.reason }}</dd>
                        <dd v-if="row.supportDocument" class="mt-1"><TrackingLink type="receipt" :id="row.supportDocument.receiptId" /></dd></div>
                      <div v-if="row.supplier"><dt class="text-xs text-muted-fg">Proveedor</dt><dd class="mt-0.5 font-medium">{{ row.supplier.name }}</dd><dd class="mt-0.5 text-xs text-muted-fg">{{ row.supplier.code }} · {{ row.supplier.country }}</dd></div>
                      <div><dt class="text-xs text-muted-fg">Almacén · ubicación · registró</dt><dd class="mt-0.5 font-medium">{{ locationLabel(row.location) }}</dd><dd class="mt-0.5 text-xs text-muted-fg">{{ row.lot?.lotCode ?? 'Sin lote (histórico)' }} · {{ row.user?.username ?? 'Apertura del sistema' }}</dd></div>
                    </dl>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>

          <div class="divide-y divide-border/70 md:hidden">
            <article v-for="(row, index) in kardex.items" :key="row.id" class="p-4">
              <div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="text-xs text-muted-fg">N.° {{ row.sequence }} · {{ whenLabel(row, index) }}</p><p class="mt-1 text-sm font-medium">{{ title(row) }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ subtitle(row) }}</p></div><p class="shrink-0 font-semibold tabular-nums" :class="Number(row.quantityOut) ? 'text-danger' : 'text-success'">{{ Number(row.quantityOut) ? '−' + quantity(row.quantityOut) : '+' + quantity(row.quantityIn) }} u.</p></div>
              <dl class="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt class="text-muted-fg">Saldo</dt><dd class="font-medium tabular-nums">{{ quantity(row.runningQuantity) }} u.</dd><dd class="tabular-nums text-muted-fg">{{ money(row.runningValue) }}</dd></div><div><dt class="text-muted-fg">Costo unit.</dt><dd class="font-medium tabular-nums">{{ row.costAdjustment ? '—' : money(row.unitCost, 'USD', 4) }}</dd></div><div><dt class="text-muted-fg">Promedio</dt><dd class="font-medium tabular-nums">{{ money(row.runningAverage, 'USD', 4) }}</dd></div></dl>
              <button type="button" class="mt-3 inline-flex items-center gap-1 text-xs text-accent" :aria-expanded="expanded.has(row.id)" @click="toggle(row.id)"><ChevronDown class="h-3.5 w-3.5 transition-transform" :class="expanded.has(row.id) ? '' : '-rotate-90'" />{{ expanded.has(row.id) ? 'Ocultar respaldo' : 'Ver respaldo' }}</button>
              <div v-if="expanded.has(row.id)" class="mt-2 space-y-1 rounded-lg bg-surface-secondary/60 p-3 text-xs">
                <p class="font-medium">{{ row.supportDocument ? processLabel(row.supportDocument.process, row.supportDocument.receipt) : referenceLabel(row) }}</p>
                <p v-if="row.supportDocument" class="text-muted-fg">{{ row.supportDocument.fiscalDocumentMissing ? 'Documento del proveedor: no registrado' : supportDocumentLabel(row.supportDocument) }}</p>
                <p v-if="row.supplier" class="text-muted-fg">{{ row.supplier.name }} · {{ row.supplier.code }} · {{ row.supplier.country }}</p>
                <TrackingLink v-if="row.supportDocument" type="receipt" :id="row.supportDocument.receiptId" />
              </div>
            </article>
          </div>
          <footer class="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-5"><span class="text-xs text-muted-fg">{{ kardex.total }} {{ kardex.total === 1 ? 'operación' : 'operaciones' }} · página {{ page }} de {{ kardex.totalPages }}</span><div class="flex items-center gap-1"><button type="button" class="icon-button" aria-label="Página anterior" :disabled="loading || page <= 1" @click="page--; load()"><ChevronLeft class="h-4 w-4" /></button><button type="button" class="icon-button" aria-label="Página siguiente" :disabled="loading || page >= kardex.totalPages" @click="page++; load()"><ChevronRight class="h-4 w-4" /></button></div></footer>
        </template>
      </div>
    </template>
  </section>
</template>
