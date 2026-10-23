<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-vue-next';
import AppInput from '../base/AppInput.vue';
import TrackingLink from '../purchases/TrackingLink.vue';
import { inventoryGet } from '../../services/inventory.service';
import { activeCompanyId } from '../../services/company-context';
import { getApiErrorMessage } from '../../utils/api-error';
import { day, dateTime, locationLabel, money, movementLabels, processLabel, quantity, referenceLabel, supportDocumentLabel } from '../../utils/inventory-format';

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
  header: { title: string; company: { name: string; commercialName: string; nit: string; nrc: string }; period: { from: string | null; to: string | null }; consolidated: boolean };
  product: { id: number; name: string; sku: string; internalCode: string; descriptionFull: string; purchaseUnit: { name: string }; category: { name: string }; subcategory: { name: string } };
  opening: string; openingValue: string; closing: string; closingValue: string; closingAverage: string; missingFiscalDocuments: string[];
  totals: { quantityIn: string; quantityOut: string; entryCost: string; exitCost: string };
  items: Row[]; total: number; totalPages: number;
};

const props = defineProps<{ products: { id: number; name: string; sku: string }[]; warehouses: { id: number; name: string; branch: { id: number; name: string } }[] }>();
const productId = ref(0), warehouseId = ref(0), lotId = ref(0), type = ref(''), dateFrom = ref(''), dateTo = ref('');
const lotOptions = ref<{ id: number; lotCode: string }[]>([]);
const kardex = ref<Kardex | null>(null), loading = ref(false), error = ref('');
const page = ref(1);
let version = 0;

const scopeLabel = computed(() => {
  if (!kardex.value) return '';
  if (kardex.value.header.consolidated) return 'Consolidado de la empresa; los traslados entre almacenes no se cuentan como entradas ni salidas.';
  const warehouse = props.warehouses.find(w => w.id === warehouseId.value);
  return `Filtrado${warehouse ? ' · ' + warehouse.branch.name + ' · ' + warehouse.name : ''}${lotId.value ? ' · un lote' : ''}${type.value ? ' · ' + (movementLabels[type.value] ?? type.value) : ''}; incluye los traslados entre almacenes.`;
});
const periodLabel = computed(() => {
  const period = kardex.value?.header.period;
  if (!period) return '';
  const format = (value: string) => day(`${value}T12:00:00-06:00`);
  return period.from && period.to ? `Del ${format(period.from)} al ${format(period.to)}` : period.from ? `Desde el ${format(period.from)}` : period.to ? `Hasta el ${format(period.to)}` : 'Todo el historial';
});
const empty = (value: string | null) => value === null ? '' : money(value);

async function loadLots() {
  lotId.value = 0; lotOptions.value = [];
  if (!productId.value) return;
  try { const result = await inventoryGet<{ items: { id: number; lotCode: string }[] }>('lots', { productId: productId.value, limit: 100 }); if (result.company === activeCompanyId.value) lotOptions.value = result.data.items; } catch { lotOptions.value = []; }
}
async function load() {
  const request = ++version;
  kardex.value = null; error.value = '';
  if (!productId.value || !activeCompanyId.value) return;
  loading.value = true;
  try {
    const result = await inventoryGet<Kardex>('kardex', { productId: productId.value, warehouseId: warehouseId.value, lotId: lotId.value, type: type.value, dateFrom: dateFrom.value, dateTo: dateTo.value, page: page.value, limit: 100 });
    if (request === version && result.company === activeCompanyId.value) kardex.value = result.data;
  } catch (caught) { if (request === version) error.value = getApiErrorMessage(caught, 'No se pudo cargar el Kardex'); }
  finally { if (request === version) loading.value = false; }
}
function filter() { page.value = 1; void load(); }
function pickProduct() { void loadLots(); filter(); }
watch(activeCompanyId, () => { productId.value = 0; warehouseId.value = 0; lotId.value = 0; type.value = ''; dateFrom.value = ''; dateTo.value = ''; lotOptions.value = []; kardex.value = null; page.value = 1; });
</script>

<template>
  <section class="surface-panel overflow-hidden">
    <form class="border-b border-border/70 p-4 sm:p-5" @submit.prevent="filter">
      <div class="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="text-xs font-medium text-muted-fg sm:col-span-2">Producto<select v-model.number="productId" class="field-control" @change="pickProduct"><option :value="0">Seleccione un producto</option><option v-for="p in props.products" :key="p.id" :value="p.id">{{ p.sku }} · {{ p.name }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Almacén<select v-model.number="warehouseId" class="field-control" :disabled="!productId" @change="filter"><option :value="0">Consolidado de la empresa</option><option v-for="w in props.warehouses" :key="w.id" :value="w.id">{{ w.name }} · {{ w.branch.name }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Lote<select v-model.number="lotId" class="field-control" :disabled="!productId" @change="filter"><option :value="0">Todos los lotes</option><option v-for="l in lotOptions" :key="l.id" :value="l.id">{{ l.lotCode }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Tipo<select v-model="type" class="field-control" :disabled="!productId" @change="filter"><option value="">Todos los movimientos</option><option v-for="(label, value) in movementLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <AppInput v-model="dateFrom" type="date" label="Desde" :max="dateTo || undefined" :disabled="!productId" @change="filter" />
        <AppInput v-model="dateTo" type="date" label="Hasta" :min="dateFrom || undefined" :disabled="!productId" @change="filter" />
      </div>
    </form>
    <p v-if="error" role="alert" class="m-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger sm:m-5">{{ error }}</p>
    <div v-if="!productId" class="px-6 py-14 text-center"><ScrollText class="mx-auto mb-3 h-7 w-7 text-muted-fg" /><p class="text-sm font-medium">Elija un producto para ver su registro de control de inventarios</p><p class="mt-1 text-xs text-muted-fg">Se construye con los movimientos confirmados e incluye unidades y costo de entradas, salidas y saldo.</p></div>
    <p v-else-if="loading" role="status" class="px-5 py-12 text-center text-sm text-muted-fg">Consultando Kardex…</p>
    <template v-else-if="kardex">
      <header class="border-b border-border/70 p-4 sm:p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-fg">{{ kardex.header.title }} · Art. 142-A del Código Tributario</p>
        <dl class="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div class="sm:col-span-2"><dt class="text-xs text-muted-fg">Contribuyente</dt><dd class="mt-0.5 font-medium">{{ kardex.header.company.name }}</dd></div>
          <div><dt class="text-xs text-muted-fg">NIT</dt><dd class="mt-0.5 font-medium tabular-nums">{{ kardex.header.company.nit }}</dd></div>
          <div><dt class="text-xs text-muted-fg">NRC</dt><dd class="mt-0.5 font-medium tabular-nums">{{ kardex.header.company.nrc }}</dd></div>
          <div class="sm:col-span-2"><dt class="text-xs text-muted-fg">Producto</dt><dd class="mt-0.5 font-medium">{{ kardex.product.descriptionFull }}</dd><dd class="mt-0.5 text-xs text-muted-fg">{{ kardex.product.category.name }} › {{ kardex.product.subcategory.name }}</dd></div>
          <div><dt class="text-xs text-muted-fg">Código · Unidad</dt><dd class="mt-0.5 font-medium">{{ kardex.product.sku }} · {{ kardex.product.internalCode }}</dd><dd class="mt-0.5 text-xs text-muted-fg">{{ kardex.product.purchaseUnit.name }}</dd></div>
          <div><dt class="text-xs text-muted-fg">Período</dt><dd class="mt-0.5 font-medium">{{ periodLabel }}</dd></div>
        </dl>
        <p class="mt-3 text-xs text-muted-fg">{{ scopeLabel }}</p>
      </header>
      <dl class="grid grid-cols-2 gap-4 border-b border-border/70 p-4 text-sm lg:grid-cols-4 sm:p-5">
        <div><dt class="text-xs text-muted-fg">Saldo inicial</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(kardex.opening) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.openingValue) }}</dd></div>
        <div><dt class="text-xs text-muted-fg">Entradas del período</dt><dd class="mt-1 font-semibold tabular-nums text-success">+{{ quantity(kardex.totals.quantityIn) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.totals.entryCost) }}</dd></div>
        <div><dt class="text-xs text-muted-fg">Salidas del período</dt><dd class="mt-1 font-semibold tabular-nums text-danger">−{{ quantity(kardex.totals.quantityOut) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.totals.exitCost) }}</dd></div>
        <div><dt class="text-xs text-muted-fg">Saldo final</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(kardex.closing) }} u.</dd><dd class="text-xs tabular-nums text-muted-fg">{{ money(kardex.closingValue) }} · promedio {{ money(kardex.closingAverage, 'USD', 4) }}</dd></div>
      </dl>
      <div v-if="!kardex.items.length" class="px-6 py-12 text-center text-sm text-muted-fg">No hay movimientos con estos filtros.</div>
      <template v-else>
        <div class="hidden max-w-full overflow-x-auto md:block">
          <table class="w-full min-w-[1380px] text-left text-sm">
            <thead class="data-thead">
              <tr><th rowspan="2" class="px-3 py-2 font-medium">N.°</th><th rowspan="2" class="px-3 py-2 font-medium">Fecha</th><th rowspan="2" class="px-3 py-2 font-medium">Documento de respaldo</th><th rowspan="2" class="px-3 py-2 font-medium">Proveedor</th><th rowspan="2" class="px-3 py-2 font-medium">Operación</th><th colspan="3" class="border-l border-border/60 px-3 py-2 text-center font-medium">Unidades</th><th colspan="5" class="border-l border-border/60 px-3 py-2 text-center font-medium">Costo</th></tr>
              <tr><th class="border-l border-border/60 px-3 py-2 text-right font-medium">Entran</th><th class="px-3 py-2 text-right font-medium">Salen</th><th class="px-3 py-2 text-right font-medium">Saldo</th><th class="border-l border-border/60 px-3 py-2 text-right font-medium">Entradas</th><th class="px-3 py-2 text-right font-medium">Salidas</th><th class="px-3 py-2 text-right font-medium">Saldo</th><th class="border-l border-border/60 px-3 py-2 text-right font-medium">Costo unit. aplicado</th><th class="px-3 py-2 text-right font-medium">Promedio resultante</th></tr>
            </thead>
            <tbody class="divide-y divide-border/70">
              <tr v-for="row in kardex.items" :key="row.id" class="align-top hover:bg-surface-secondary/40">
                <td class="px-3 py-3 text-xs tabular-nums text-muted-fg">{{ row.sequence }}</td>
                <td class="whitespace-nowrap px-3 py-3 text-xs text-muted-fg">{{ dateTime(row.movementDate) }}</td>
                <td class="px-3 py-3"><template v-if="row.supportDocument"><p class="font-medium">{{ processLabel(row.supportDocument.process, row.supportDocument.receipt) }}</p><p class="mt-0.5 text-xs" :class="row.supportDocument.fiscalDocumentMissing ? 'text-muted-fg' : ''">{{ row.supportDocument.fiscalDocumentMissing ? 'Documento del proveedor: no registrado' : supportDocumentLabel(row.supportDocument) }}</p><TrackingLink type="receipt" :id="row.supportDocument.receiptId" /></template><p v-else class="text-sm">{{ referenceLabel(row) }}</p></td>
                <td class="px-3 py-3"><template v-if="row.supplier"><p>{{ row.supplier.name }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ row.supplier.code }} · {{ row.supplier.country }}</p></template><span v-else class="text-muted-fg">—</span></td>
                <td class="px-3 py-3"><p class="font-medium">{{ row.costAdjustment ? 'Ajuste de costo' : (movementLabels[row.movementType] ?? row.movementType) }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ row.lot?.lotCode ?? 'Sin lote (histórico)' }} · {{ locationLabel(row.location) }} · {{ row.user?.username ?? 'Apertura del sistema' }}</p><p v-if="row.costAdjustment" class="mt-0.5 text-xs text-muted-fg">{{ row.reason }}</p></td>
                <td class="border-l border-border/60 px-3 py-3 text-right tabular-nums text-success">{{ Number(row.quantityIn) ? '+' + quantity(row.quantityIn) : '' }}</td>
                <td class="px-3 py-3 text-right tabular-nums text-danger">{{ Number(row.quantityOut) ? '−' + quantity(row.quantityOut) : '' }}</td>
                <td class="px-3 py-3 text-right font-medium tabular-nums">{{ quantity(row.runningQuantity) }}</td>
                <td class="border-l border-border/60 px-3 py-3 text-right tabular-nums">{{ empty(row.entryCost) }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ empty(row.exitCost) }}</td>
                <td class="px-3 py-3 text-right font-medium tabular-nums">{{ money(row.runningValue) }}</td>
                <td class="border-l border-border/60 px-3 py-3 text-right tabular-nums">{{ row.costAdjustment ? '' : money(row.unitCost, 'USD', 4) }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ money(row.runningAverage, 'USD', 4) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="divide-y divide-border/70 md:hidden">
          <article v-for="row in kardex.items" :key="row.id" class="p-4">
            <div class="flex items-start justify-between gap-3"><div><p class="text-xs text-muted-fg">N.° {{ row.sequence }} · {{ dateTime(row.movementDate) }}</p><p class="mt-1 text-sm font-medium">{{ row.costAdjustment ? 'Ajuste de costo' : (movementLabels[row.movementType] ?? row.movementType) }}</p></div><p class="font-semibold tabular-nums" :class="Number(row.quantityOut) ? 'text-danger' : 'text-success'">{{ Number(row.quantityOut) ? '−' + quantity(row.quantityOut) : '+' + quantity(row.quantityIn) }}</p></div>
            <p class="mt-2 text-xs text-muted-fg">{{ row.supportDocument ? processLabel(row.supportDocument.process, row.supportDocument.receipt) + (row.supportDocument.fiscalDocumentMissing ? '' : ' · ' + supportDocumentLabel(row.supportDocument)) : referenceLabel(row) }}<template v-if="row.supplier"> · {{ row.supplier.name }} ({{ row.supplier.country }})</template></p>
            <p class="mt-1 text-xs text-muted-fg">{{ row.lot?.lotCode ?? 'Sin lote' }} · {{ locationLabel(row.location) }}</p>
            <dl class="mt-2 grid grid-cols-2 gap-2 text-xs"><div><dt class="text-muted-fg">Costo unit. aplicado</dt><dd class="font-medium tabular-nums">{{ row.costAdjustment ? '—' : money(row.unitCost, 'USD', 4) }}</dd></div><div><dt class="text-muted-fg">Promedio resultante</dt><dd class="font-medium tabular-nums">{{ money(row.runningAverage, 'USD', 4) }}</dd></div></dl>
            <dl class="mt-2 grid grid-cols-3 gap-2 text-xs"><div><dt class="text-muted-fg">Saldo u.</dt><dd class="font-medium tabular-nums">{{ quantity(row.runningQuantity) }}</dd></div><div><dt class="text-muted-fg">{{ row.exitCost ? 'Costo salida' : 'Costo entrada' }}</dt><dd class="font-medium tabular-nums">{{ money(row.exitCost ?? row.entryCost ?? 0) }}</dd></div><div><dt class="text-muted-fg">Saldo $</dt><dd class="font-medium tabular-nums">{{ money(row.runningValue) }}</dd></div></dl>
          </article>
        </div>
        <footer class="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-5"><span class="text-xs text-muted-fg">{{ kardex.total }} operaciones · página {{ page }} de {{ kardex.totalPages }}</span><div class="flex items-center gap-1"><button type="button" class="icon-button" aria-label="Página anterior" :disabled="loading || page <= 1" @click="page--; load()"><ChevronLeft class="h-4 w-4" /></button><button type="button" class="icon-button" aria-label="Página siguiente" :disabled="loading || page >= kardex.totalPages" @click="page++; load()"><ChevronRight class="h-4 w-4" /></button></div></footer>
      </template>
    </template>
  </section>
</template>
