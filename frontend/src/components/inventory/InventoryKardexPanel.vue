<script setup lang="ts">
import { ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-vue-next';
import AppInput from '../base/AppInput.vue';
import { inventoryGet } from '../../services/inventory.service';
import { activeCompanyId } from '../../services/company-context';
import { getApiErrorMessage } from '../../utils/api-error';
import { dateTime, locationLabel, money, movementLabels, quantity, referenceLabel } from '../../utils/inventory-format';

type Row = {
  id: number; movementType: string; movementDate: string; quantityIn: string; quantityOut: string; unitCost: string; totalCost: string; runningQuantity: string;
  referenceType: string; referenceId: number | null; reason: string;
  lot: { id: number; lotCode: string; purchaseItem: { purchase: { documentNumber: string } } | null } | null;
  location: { code: string; warehouse: { name: string } } | null; user: { username: string } | null;
};
type Kardex = { product: { id: number; name: string; sku: string; purchaseUnit: { name: string } }; opening: string; closing: string; totals: { quantityIn: string; quantityOut: string }; items: Row[]; total: number; totalPages: number };

const props = defineProps<{ products: { id: number; name: string; sku: string }[]; warehouses: { id: number; name: string; branch: { id: number; name: string } }[] }>();
const productId = ref(0), warehouseId = ref(0), lotId = ref(0), type = ref(''), dateFrom = ref(''), dateTo = ref('');
const lotOptions = ref<{ id: number; lotCode: string }[]>([]);
const kardex = ref<Kardex | null>(null), loading = ref(false), error = ref('');
const page = ref(1);
let version = 0;

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
        <label class="text-xs font-medium text-muted-fg">Almacén<select v-model.number="warehouseId" class="field-control" :disabled="!productId" @change="filter"><option :value="0">Todos los almacenes</option><option v-for="w in props.warehouses" :key="w.id" :value="w.id">{{ w.name }} · {{ w.branch.name }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Lote<select v-model.number="lotId" class="field-control" :disabled="!productId" @change="filter"><option :value="0">Todos los lotes</option><option v-for="l in lotOptions" :key="l.id" :value="l.id">{{ l.lotCode }}</option></select></label>
        <label class="text-xs font-medium text-muted-fg">Tipo<select v-model="type" class="field-control" :disabled="!productId" @change="filter"><option value="">Todos los movimientos</option><option v-for="(label, value) in movementLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <AppInput v-model="dateFrom" type="date" label="Desde" :max="dateTo || undefined" :disabled="!productId" @change="filter" />
        <AppInput v-model="dateTo" type="date" label="Hasta" :min="dateFrom || undefined" :disabled="!productId" @change="filter" />
      </div>
    </form>
    <p v-if="error" role="alert" class="m-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger sm:m-5">{{ error }}</p>
    <div v-if="!productId" class="px-6 py-14 text-center"><ScrollText class="mx-auto mb-3 h-7 w-7 text-muted-fg" /><p class="text-sm font-medium">Elija un producto para ver su Kardex</p><p class="mt-1 text-xs text-muted-fg">El Kardex se construye con los movimientos confirmados: entradas, salidas, traslados, ajustes y devoluciones.</p></div>
    <p v-else-if="loading" role="status" class="px-5 py-12 text-center text-sm text-muted-fg">Consultando Kardex…</p>
    <template v-else-if="kardex">
      <dl class="grid grid-cols-2 gap-4 border-b border-border/70 p-4 text-sm sm:grid-cols-4 sm:p-5">
        <div><dt class="text-xs text-muted-fg">Saldo inicial</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(kardex.opening) }} <span class="text-xs font-normal text-muted-fg">{{ kardex.product.purchaseUnit.name }}</span></dd></div>
        <div><dt class="text-xs text-muted-fg">Entradas</dt><dd class="mt-1 font-semibold tabular-nums text-success">+{{ quantity(kardex.totals.quantityIn) }}</dd></div>
        <div><dt class="text-xs text-muted-fg">Salidas</dt><dd class="mt-1 font-semibold tabular-nums text-danger">−{{ quantity(kardex.totals.quantityOut) }}</dd></div>
        <div><dt class="text-xs text-muted-fg">Saldo final</dt><dd class="mt-1 font-semibold tabular-nums">{{ quantity(kardex.closing) }}</dd></div>
      </dl>
      <div v-if="!kardex.items.length" class="px-6 py-12 text-center text-sm text-muted-fg">No hay movimientos con estos filtros.</div>
      <template v-else>
        <div class="hidden max-w-full overflow-x-auto md:block">
          <table class="w-full min-w-[980px] text-left text-sm">
            <thead class="data-thead"><tr><th class="px-5 py-3 font-medium">Fecha</th><th class="px-5 py-3 font-medium">Movimiento y documento</th><th class="px-5 py-3 font-medium">Lote y ubicación</th><th class="px-5 py-3 text-right font-medium">Entrada</th><th class="px-5 py-3 text-right font-medium">Salida</th><th class="px-5 py-3 text-right font-medium">Saldo</th><th class="px-5 py-3 text-right font-medium">Costo unit.</th></tr></thead>
            <tbody class="divide-y divide-border/70">
              <tr v-for="row in kardex.items" :key="row.id" class="align-top hover:bg-surface-secondary/40">
                <td class="whitespace-nowrap px-5 py-3.5 text-xs text-muted-fg">{{ dateTime(row.movementDate) }}</td>
                <td class="px-5 py-3.5"><p class="font-medium">{{ movementLabels[row.movementType] ?? row.movementType }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ referenceLabel(row) }} · {{ row.user?.username ?? 'Apertura del sistema' }}</p></td>
                <td class="px-5 py-3.5"><p class="font-mono text-xs">{{ row.lot?.lotCode ?? 'Sin lote (histórico)' }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ locationLabel(row.location) }}</p></td>
                <td class="px-5 py-3.5 text-right tabular-nums text-success">{{ Number(row.quantityIn) ? '+' + quantity(row.quantityIn) : '' }}</td>
                <td class="px-5 py-3.5 text-right tabular-nums text-danger">{{ Number(row.quantityOut) ? '−' + quantity(row.quantityOut) : '' }}</td>
                <td class="px-5 py-3.5 text-right font-medium tabular-nums">{{ quantity(row.runningQuantity) }}</td>
                <td class="px-5 py-3.5 text-right tabular-nums">{{ money(row.unitCost, 'USD', 4) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="divide-y divide-border/70 md:hidden">
          <article v-for="row in kardex.items" :key="row.id" class="p-4">
            <div class="flex items-start justify-between gap-3"><div><p class="text-xs text-muted-fg">{{ dateTime(row.movementDate) }}</p><p class="mt-1 text-sm font-medium">{{ movementLabels[row.movementType] ?? row.movementType }}</p></div><p class="font-semibold tabular-nums" :class="Number(row.quantityOut) ? 'text-danger' : 'text-success'">{{ Number(row.quantityOut) ? '−' + quantity(row.quantityOut) : '+' + quantity(row.quantityIn) }}</p></div>
            <p class="mt-2 text-xs text-muted-fg">{{ referenceLabel(row) }} · {{ row.lot?.lotCode ?? 'Sin lote' }} · {{ locationLabel(row.location) }}</p>
            <p class="mt-1 text-xs text-muted-fg">Saldo {{ quantity(row.runningQuantity) }} · {{ money(row.unitCost, 'USD', 4) }}</p>
          </article>
        </div>
        <footer class="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-5"><span class="text-xs text-muted-fg">{{ kardex.total }} movimientos · página {{ page }} de {{ kardex.totalPages }}</span><div class="flex items-center gap-1"><button type="button" class="icon-button" aria-label="Página anterior" :disabled="loading || page <= 1" @click="page--; load()"><ChevronLeft class="h-4 w-4" /></button><button type="button" class="icon-button" aria-label="Página siguiente" :disabled="loading || page >= kardex.totalPages" @click="page++; load()"><ChevronRight class="h-4 w-4" /></button></div></footer>
      </template>
    </template>
  </section>
</template>
