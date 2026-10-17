<script setup lang="ts">
import { ref, watch } from 'vue';
import { Calculator, ChevronLeft, ChevronRight, Search } from 'lucide-vue-next';
import AppBadge from '../base/AppBadge.vue';
import AppButton from '../base/AppButton.vue';
import SearchField from '../base/SearchField.vue';
import { inventoryGet } from '../../services/inventory.service';
import { activeCompanyId } from '../../services/company-context';
import { getApiErrorMessage } from '../../utils/api-error';
import { money, quantity } from '../../utils/inventory-format';

type Cost = { id: number; quantityOnHand: string; inventoryValue: string; averageUnitCost: string; updatedAt: string; product: { id: number; name: string; sku: string; purchaseUnit: { name: string } } };
type Reconciliation = { checkedProducts: number; consistent: boolean; issues: { productId: number; problem: string }[] };

const items = ref<Cost[]>([]), totals = ref({ quantityOnHand: '0', inventoryValue: '0' }), reconciliation = ref<Reconciliation | null>(null);
const search = ref(''), page = ref(1), pages = ref(1), total = ref(0), loading = ref(false), error = ref('');
let version = 0;

async function load() {
  const request = ++version;
  if (!activeCompanyId.value) return;
  loading.value = true; error.value = '';
  try {
    const [costs, check] = await Promise.all([inventoryGet<{ items: Cost[]; total: number; totalPages: number; totals: { quantityOnHand: string; inventoryValue: string } }>('costs', { page: page.value, limit: 20, search: search.value.trim() }), inventoryGet<Reconciliation>('reconciliation')]);
    if (request !== version || costs.company !== activeCompanyId.value) return;
    items.value = costs.data.items; total.value = costs.data.total; pages.value = Math.max(1, costs.data.totalPages); totals.value = costs.data.totals; reconciliation.value = check.data;
    if (page.value > pages.value) { page.value = pages.value; await load(); }
  } catch (caught) { if (request === version) error.value = getApiErrorMessage(caught, 'No se pudo cargar la valoración'); }
  finally { if (request === version) loading.value = false; }
}
function applySearch() { page.value = 1; void load(); }
watch(activeCompanyId, () => { items.value = []; search.value = ''; page.value = 1; reconciliation.value = null; void load(); }, { immediate: true });
</script>

<template>
  <section class="surface-panel overflow-hidden">
    <form class="border-b border-border/70 p-4 sm:p-5" @submit.prevent="applySearch">
      <div class="grid items-end gap-3 sm:grid-cols-[minmax(230px,1fr)_auto]">
        <label class="text-xs font-medium text-muted-fg">Producto o SKU<SearchField v-model="search" maxlength="100" placeholder="Buscar en la valoración" class="mt-1.5" /></label>
        <AppButton type="submit" variant="outline" :disabled="loading"><Search class="h-4 w-4" />Buscar</AppButton>
      </div>
    </form>
    <dl class="grid grid-cols-1 gap-4 border-b border-border/70 p-4 text-sm sm:grid-cols-3 sm:p-5">
      <div><dt class="text-xs text-muted-fg">Valor del inventario</dt><dd class="mt-1 text-lg font-semibold tabular-nums">{{ money(totals.inventoryValue) }}</dd></div>
      <div><dt class="text-xs text-muted-fg">Unidades valorizadas</dt><dd class="mt-1 text-lg font-semibold tabular-nums">{{ quantity(totals.quantityOnHand) }}</dd></div>
      <div><dt class="text-xs text-muted-fg">Conciliación con ubicaciones y lotes</dt><dd class="mt-1"><AppBadge v-if="reconciliation" :variant="reconciliation.consistent ? 'success' : 'danger'">{{ reconciliation.consistent ? `Conciliado · ${reconciliation.checkedProducts} productos` : `${reconciliation.issues.length} diferencias` }}</AppBadge></dd></div>
    </dl>
    <p v-if="error" role="alert" class="m-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger sm:m-5">{{ error }}</p>
    <p v-if="reconciliation && !reconciliation.consistent" role="alert" class="mx-4 mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger sm:mx-5">Hay productos cuyo saldo por ubicación, lote o valoración no coincide. Revise los movimientos antes de operar.</p>
    <p v-if="loading" role="status" class="px-5 py-12 text-center text-sm text-muted-fg">Consultando valoración…</p>
    <div v-else-if="!items.length" class="px-6 py-14 text-center"><Calculator class="mx-auto mb-3 h-7 w-7 text-muted-fg" /><p class="text-sm font-medium">Sin existencias valoradas</p><p class="mt-1 text-xs text-muted-fg">El costo promedio aparece al confirmar la primera entrada de cada producto.</p></div>
    <template v-else>
      <div class="hidden max-w-full overflow-x-auto md:block">
        <table class="w-full min-w-[720px] text-left text-sm">
          <thead class="data-thead"><tr><th class="px-5 py-3 font-medium">Producto</th><th class="px-5 py-3 text-right font-medium">Existencias</th><th class="px-5 py-3 text-right font-medium">Costo promedio</th><th class="px-5 py-3 text-right font-medium">Valor</th></tr></thead>
          <tbody class="divide-y divide-border/70"><tr v-for="row in items" :key="row.id" class="hover:bg-surface-secondary/40"><td class="px-5 py-3.5"><p class="font-medium">{{ row.product.name }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ row.product.sku }}</p></td><td class="px-5 py-3.5 text-right tabular-nums">{{ quantity(row.quantityOnHand) }} <span class="text-xs text-muted-fg">{{ row.product.purchaseUnit.name }}</span></td><td class="px-5 py-3.5 text-right tabular-nums">{{ money(row.averageUnitCost, 'USD', 4) }}</td><td class="px-5 py-3.5 text-right font-medium tabular-nums">{{ money(row.inventoryValue) }}</td></tr></tbody>
        </table>
      </div>
      <div class="divide-y divide-border/70 md:hidden"><article v-for="row in items" :key="row.id" class="p-4"><p class="font-medium">{{ row.product.name }}</p><p class="text-xs text-muted-fg">{{ row.product.sku }}</p><dl class="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt class="text-muted-fg">Existencias</dt><dd class="mt-0.5 font-medium tabular-nums">{{ quantity(row.quantityOnHand) }}</dd></div><div><dt class="text-muted-fg">Promedio</dt><dd class="mt-0.5 font-medium tabular-nums">{{ money(row.averageUnitCost, 'USD', 4) }}</dd></div><div><dt class="text-muted-fg">Valor</dt><dd class="mt-0.5 font-medium tabular-nums">{{ money(row.inventoryValue) }}</dd></div></dl></article></div>
      <footer class="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-5"><span class="text-xs text-muted-fg">{{ total }} productos · página {{ page }} de {{ pages }}</span><div class="flex items-center gap-1"><button type="button" class="icon-button" aria-label="Página anterior" :disabled="loading || page <= 1" @click="page--; load()"><ChevronLeft class="h-4 w-4" /></button><button type="button" class="icon-button" aria-label="Página siguiente" :disabled="loading || page >= pages" @click="page++; load()"><ChevronRight class="h-4 w-4" /></button></div></footer>
    </template>
    <p class="border-t border-border/70 px-4 py-3 text-xs text-muted-fg sm:px-5">Costo promedio ponderado global por empresa y producto. Los traslados entre almacenes no cambian la cantidad ni el valor.</p>
  </section>
</template>
