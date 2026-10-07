<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, FileSearch, Package, ShoppingCart, SlidersHorizontal, X } from 'lucide-vue-next';
import { RouterLink, useRoute } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import PurchasesNav from '../components/purchases/PurchasesNav.vue';
import PurchaseSectionHeader from '../components/purchases/PurchaseSectionHeader.vue';
import PurchaseTabs from '../components/purchases/PurchaseTabs.vue';
import AppButton from '../components/base/AppButton.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import { usePermissions } from '../composables/usePermissions';
import { useUnsavedChanges } from '../composables/useUnsavedChanges';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { getApiErrorMessage } from '../utils/api-error';
import { isCurrentPurchaseWeek } from '../utils/purchase-inbox';
import { filterQuotationProcesses } from '../utils/quotation-process-inbox';
import { estimateQuotationSelection, evaluateComparisonOffer, recommendComparisonOffer, roundPurchaseAmount, type ComparisonOffer } from '../utils/quotation-comparison';

const route = useRoute();
const { can } = usePermissions();
const processes = ref<any[]>([]), current = ref<any>(null), selectedId = ref(0), productId = ref(0);
const history = ref(false), search = ref(''), historyFrom = ref(''), historyTo = ref(''), comparisonCurrency = ref('');
const error = ref(''), success = ref(''), busy = ref(false), loading = ref(false);
const step = ref<'compare' | 'review'>('compare'), expandedOfferId = ref(0);
const comparisonMode=ref<'matrix'|'product'>('product'), serverComparison=ref<any>(null),comparing=ref(false),comparisonReady=ref(false),partialAccepted=ref(false);
let comparisonVersion=0,comparisonTimer:ReturnType<typeof setTimeout>|undefined;
const selections = ref<Record<number, { detailId: number; quantity: number }>>({});
const warehouse = ref<any>(null);
const discardSelection = ref(false);
let pendingSelectionChange: (() => void) | undefined;
let version = 0;
let awardReference: { payload: string; id: string } | null = null;
const config = () => ({ headers: { 'X-Company-Id': String(activeCompanyId.value) } });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
const money = (amount: number, currency = 'USD') => new Intl.NumberFormat('es-SV', { style: 'currency', currency }).format(amount);
const validContext = (token: number, company: number | null) => token === version && company === activeCompanyId.value;
const queryId = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const choices = computed(() => filterQuotationProcesses(processes.value, { period: history.value ? 'all' : 'week', search: search.value, from: historyFrom.value, to: historyTo.value }));
const activeFilterCount = computed(() => Number(!!search.value.trim()) + (history.value ? Number(!!historyFrom.value) + Number(!!historyTo.value) : 0));
const lines = computed<any[]>(() => current.value?.lines ?? []);
const product = computed(() => lines.value.find(line => line.id === productId.value));
const shortDate = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-SV', { day: 'numeric', month: 'short' });
const processLabel = (process: any) => `Compra #${process.id} · ${shortDate(process.dateFrom)}${process.dateFrom.slice(0,10) === process.dateTo.slice(0,10) ? '' : ' – ' + shortDate(process.dateTo)}`;
function remaining(line: any) { return roundPurchaseAmount(Math.max(0, Number(line?.purchaseQuantity ?? 0) - Number(line?.purchasedQuantity ?? 0))); }
function rawOffers(lineId: number): (ComparisonOffer & { rfq: any })[] {
  const line = lines.value.find(item => item.id === lineId);
  return (current.value?.rfqs ?? []).flatMap((rfq: any) => {
    const detail = rfq.quotation?.details.find((item: any) => item.consolidationLineId === lineId);
    if (!detail) return [];
    const otherOrder = current.value.orders?.some((order: any) => order.supplierId === rfq.supplierId && !['cancelled','rejected'].includes(order.status) && (order.status !== 'draft' || order.deletedAt || (order.quotationId && order.quotationId !== rfq.quotation.id)));
    return [{ rfq, detail, quotation: rfq.quotation, supplier: rfq.supplier, requiredUnitId: line?.unitId ?? line?.unit?.id, supplierAlreadyOrdered: !!otherOrder }];
  });
}
const comparisonQuantity = computed(() => {
  const quantity = Number(selections.value[productId.value]?.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, remaining(product.value)) : remaining(product.value);
});
const comparison = computed(() => recommendComparisonOffer(rawOffers(productId.value), comparisonQuantity.value, today(), comparisonCurrency.value || undefined));
const offers = computed(() => recommendComparisonOffer(rawOffers(productId.value), remaining(product.value), today()).evaluations.map(item => {
  const raw = rawOffers(productId.value).find(offer => offer.detail.id === item.offer.detail.id)!;
  const previewQuantity = Math.min(Math.max(comparison.value.comparisonQuantity || comparisonQuantity.value, item.minimumPurchase), item.maxQuantity);
  const preview = estimateQuotationSelection(item.offer.quotation, [{ detailId: item.offer.detail.id, quantity: previewQuantity }]);
  return { ...item, rfq: raw.rfq, detail: item.offer.detail, preview, previewQuantity };
}));
const availableOffers = computed(() => offers.value.filter(offer => offer.eligible));
const unavailableOffers = computed(() => offers.value.filter(offer => !offer.eligible));
const pendingProducts = computed(() => lines.value.filter(line => remaining(line) > 0));
const allOrdered = computed(() => lines.value.length > 0 && !pendingProducts.value.length);
const selectedOffer = computed(() => offers.value.find(offer => offer.detail.id === selections.value[productId.value]?.detailId));
const pickedCount = computed(() => Object.values(selections.value).filter(pick => pick.detailId && pick.quantity > 0).length);
const hasSelection = computed(() => Object.keys(selections.value).length > 0);
const localSelectionIssues = computed(() => Object.entries(selections.value).flatMap(([id, pick]) => {
  const line = lines.value.find(item => item.id === Number(id));
  const raw = rawOffers(Number(id)).find(item => item.detail.id === pick.detailId);
  const name = line?.product.name ?? 'Producto';
  if (!Number.isSafeInteger(pick.quantity) || pick.quantity <= 0) return [`${name}: ingrese una cantidad entera mayor que cero.`];
  if (!raw) return [`${name}: la oferta ya no está disponible.`];
  const evaluated = evaluateComparisonOffer(raw, Math.min(pick.quantity, remaining(line)), today());
  if (!evaluated.eligible) return [`${name}: ${evaluated.reason}.`];
  if (pick.quantity > evaluated.maxQuantity) return [`${name}: puede comprar hasta ${evaluated.maxQuantity} ${line.unit.name} con esta oferta.`];
  return [];
}));
const selectionIssues = computed(() => localSelectionIssues.value.length || !comparisonReady.value ? localSelectionIssues.value : Object.entries(selections.value).flatMap(([id, pick]) => {
  const row = serverComparison.value?.rows.find((item: any) => item.lineId === Number(id));
  if (!row) return [];
  const cell = row.cells.find((item: any) => item.detailId === pick.detailId);
  return cell?.eligible ? [] : [`${row.product.name}: ${cell?.label || 'la oferta ya no está disponible'}.`];
}));
const invalidSelection = computed(() => selectionIssues.value.length > 0);
const completeSuppliers = computed(() => serverComparison.value?.supplierTotals.filter((item: any) => item.complete && item.group) ?? []);
const summary = computed(() => {
  const groups = new Map<number, any>();
  for (const line of lines.value) {
    const pick = selections.value[line.id];
    if (!pick?.detailId || !Number.isFinite(pick.quantity) || pick.quantity <= 0) continue;
    const offer = rawOffers(line.id).find(item => item.detail.id === pick.detailId);
    if (!offer) continue;
    const group = groups.get(offer.supplier.id) ?? { supplierId: offer.supplier.id, supplier: offer.supplier.name, currency: offer.quotation.currency, quote: offer.quotation, products: [], picks: [], updating: offer.quotation.orders?.some(order => order.status === 'draft' && !order.deletedAt) };
    group.picks.push({ detailId: pick.detailId, quantity: pick.quantity });
    group.products.push({ id: line.id, name: line.product.name, quantity: pick.quantity, unit: line.unit.name, max: recommendComparisonOffer(rawOffers(line.id), remaining(line), today()).evaluations.find(item => item.offer.detail.id === pick.detailId)?.maxQuantity ?? 0, pending: remaining(line) });
    groups.set(offer.supplier.id, group);
  }
  return [...groups.values()].map(group => ({ ...group, ...estimateQuotationSelection(group.quote, group.picks) }));
});
const updatingOrders = computed(() => summary.value.some(group => group.updating));
const totals = computed(() => {
  const amounts = new Map<string, number>();
  for (const group of summary.value) amounts.set(group.currency, roundPurchaseAmount((amounts.get(group.currency) ?? 0) + group.total));
  return [...amounts].map(([currency, amount]) => ({ currency, amount }));
});
const canSelect = computed(() => can('purchase_quotations.select'));
const canAward = computed(() => canSelect.value && can('purchase_orders.create')&&can('purchase_orders.update'));
function pickedSupplier(line: any) { return rawOffers(line.id).find(offer => offer.detail.id === selections.value[line.id]?.detailId)?.supplier.name; }
const { leaving, resolveLeave } = useUnsavedChanges(() => hasSelection.value, () => busy.value);

function applyCurrent(record: any, id: number) {
  if (!record || !Array.isArray(record.lines)) throw new Error('No se pudo actualizar la compra. Recargue la vista para consultar sus órdenes.');
  current.value = record;
  selectedId.value = id;
  productId.value = current.value.lines.find((line: any) => remaining(line) > 0)?.id ?? current.value.lines[0]?.id ?? 0;
  selections.value = {};
  step.value = 'compare'; expandedOfferId.value = 0;
  partialAccepted.value=false;
  if (!isCurrentPurchaseWeek(current.value.createdAt || current.value.dateTo)) history.value = true;
}
async function fetchCurrent(id: number, token: number, company: number | null) {
  const response = await http.get('/supply/consolidations/' + id, config());
  if (validContext(token, company)) applyCurrent(response.data.data, id);
}
function changeProcess(event: Event) {
  const control = event.target as HTMLSelectElement;
  const id = Number(control.value);
  control.value = String(selectedId.value);
  if (id && id !== selectedId.value) changeSelectionContext(() => { void open(id); });
}
function changeSelectionContext(work: () => void) {
  if (busy.value || loading.value) return;
  if (hasSelection.value) { pendingSelectionChange = work; discardSelection.value = true; return; }
  work();
}
function resolveSelectionDiscard(allow: boolean) {
  const work = pendingSelectionChange;
  pendingSelectionChange = undefined; discardSelection.value = false;
  if (allow) { selections.value = {}; work?.(); }
}
function changePeriod(value: string) {
  if (value !== 'week' && value !== 'all' || (value === 'all') === history.value) return;
  changeSelectionContext(() => {
    history.value = value === 'all'; search.value = ''; historyFrom.value = ''; historyTo.value = '';
    if (choices.value.some(process => process.id === selectedId.value)) return;
    if (choices.value[0]) void open(choices.value[0].id);
    else { ++version; current.value = null; selectedId.value = 0; productId.value = 0; }
  });
}
function clearFilters() { search.value = ''; historyFrom.value = ''; historyTo.value = ''; }
function focusProduct(id: number) {
  if (busy.value || loading.value) return;
  productId.value = id; step.value = 'compare';
}
async function refreshComparison(){
  const id=selectedId.value,company=activeCompanyId.value,token=++comparisonVersion;
  if(!current.value||!id||localSelectionIssues.value.length){comparing.value=false;comparisonReady.value=false;return;}
  comparing.value=true;comparisonReady.value=false;
  try{const response=await http.post('/supply/consolidations/'+id+'/compare',{details:Object.values(selections.value).map(p=>({quotationDetailId:p.detailId,quantity:Number(p.quantity)}))},{headers:{'X-Company-Id':String(company)}});if(token===comparisonVersion&&id===selectedId.value&&company===activeCompanyId.value){serverComparison.value=response.data.data;comparisonReady.value=true;}}
  catch(e){if(token===comparisonVersion)error.value=getApiErrorMessage(e,'No se pudieron verificar los costos de la comparación');}
  finally{if(token===comparisonVersion)comparing.value=false;}
}
function chooseMatrix(lineId:number,detailId:number){focusProduct(lineId);choose(detailId);}
function applyRecommended(){if(busy.value||comparing.value||!comparisonReady.value||!canSelect.value)return;const recommended=serverComparison.value?.recommendation;if(!recommended)return;selections.value={};for(const pick of recommended.details){const offer=current.value.rfqs.flatMap((r:any)=>r.quotation?.details??[]).find((d:any)=>d.id===pick.quotationDetailId);if(offer)selections.value[offer.consolidationLineId]={detailId:pick.quotationDetailId,quantity:pick.quantity};}}
function selectFullSupplier(id:number){if(busy.value||comparing.value||!comparisonReady.value||!canSelect.value)return;const option=serverComparison.value?.supplierTotals.find((g:any)=>g.supplierId===id);if(!option?.complete)return;selections.value={};for(const p of option.details){const d=current.value.rfqs.flatMap((r:any)=>r.quotation?.details??[]).find((d:any)=>d.id===p.quotationDetailId);if(d)selections.value[d.consolidationLineId]={detailId:p.quotationDetailId,quantity:p.quantity};}}
function recommendedDetail(id:number){return comparisonReady.value&&serverComparison.value?.recommendation?.details.some((d:any)=>d.quotationDetailId===id);}
async function refreshOffers() {
  if (busy.value || loading.value || !selectedId.value) return;
  const id = selectedId.value, company = activeCompanyId.value, token = ++version;
  loading.value = true; error.value = ''; comparisonReady.value = false;
  ++comparisonVersion; clearTimeout(comparisonTimer);
  try {
    const response = await http.get('/supply/consolidations/' + id, config());
    if (!validContext(token, company)) return;
    if (!Array.isArray(response.data.data?.lines)) throw new Error('Respuesta incompleta');
    current.value = response.data.data;
    clearTimeout(comparisonTimer);
    await refreshComparison();
  } catch (e) { if (validContext(token, company)) error.value = getApiErrorMessage(e, 'No se pudieron actualizar las ofertas'); }
  finally { if (validContext(token, company)) loading.value = false; }
}
function nextProduct() {
  const next = pendingProducts.value.find(line => !selections.value[line.id] && line.id !== productId.value);
  if (next) focusProduct(next.id);
  else reviewSelection();
}
function reviewSelection() {
  if (busy.value || loading.value || !summary.value.length || invalidSelection.value || !canSelect.value) return;
  step.value = 'review'; error.value = '';
}
function removeSelection(id: number) {
  if (!busy.value && canSelect.value) delete selections.value[id];
}
function clearSelection() {
  if (!busy.value && !loading.value && canSelect.value) selections.value = {};
}
async function open(id: number) {
  if (!id || busy.value || loading.value || id === selectedId.value) return;
  if (hasSelection.value) return;
  const token = ++version, company = activeCompanyId.value;
  loading.value = true; error.value = ''; success.value = '';
  try { await fetchCurrent(id, token, company); }
  catch (e) { if (validContext(token, company)) error.value = getApiErrorMessage(e, 'No se pudieron cargar las ofertas'); }
  finally { if (validContext(token, company)) loading.value = false; }
}
async function load() {
  const token = ++version, company = activeCompanyId.value;
  loading.value = true; error.value = '';
  try {
    const [p, w] = await Promise.all([http.get('/supply/consolidations', config()), http.get('/purchase-catalogs', config())]);
    if (!validContext(token, company)) return;
    processes.value = p.data.data; warehouse.value = w.data.data.generalWarehouse;
    let id = 0;
    if (route.query.requestId !== undefined) {
      const requestId = queryId(route.query.requestId);
      if (!requestId) { error.value = 'La solicitud indicada no es válida.'; return; }
      const response = await http.get('/purchase-requests/' + requestId, config());
      if (!validContext(token, company)) return;
      const processIds = [...new Set<number>(response.data.data.details.flatMap((detail: any) => (detail.consolidationSources ?? []).map((source: any) => Number(source.line?.consolidationId))).filter((value: number) => Number.isSafeInteger(value) && value > 0))];
      if (processIds.length === 1) id = processIds[0]!;
      else { error.value = processIds.length ? 'La solicitud participa en varias compras. Elija cuál comparar.' : 'Esta solicitud todavía no tiene ofertas. Prepare la consulta desde Cotizaciones.'; return; }
    } else if (route.query.id !== undefined) {
      id = queryId(route.query.id);
      if (!id) { error.value = 'La compra indicada no es válida.'; return; }
    } else id = choices.value[0]?.id ?? 0;
    if (id) await fetchCurrent(id, token, company);
  } catch (e) { if (validContext(token, company)) error.value = getApiErrorMessage(e, 'No se pudo cargar la comparación'); }
  finally { if (validContext(token, company)) loading.value = false; }
}
function choose(detailId: number) {
  if (busy.value || loading.value || !can('purchase_quotations.select')) return;
  const offer = offers.value.find(item => item.detail.id === detailId);
  if (!offer?.eligible) return;
  const old = selections.value[productId.value];
  const previousQuantity = Number(old?.quantity);
  const quantity = Number.isFinite(previousQuantity) && previousQuantity > 0 ? previousQuantity : offer.previewQuantity || offer.maxQuantity;
  selections.value[productId.value] = { detailId, quantity: Math.min(quantity, offer.maxQuantity) };
  error.value = ''; success.value = '';
}
function maxQuantity() { return offers.value.find(item => item.detail.id === selections.value[productId.value]?.detailId)?.maxQuantity ?? 0; }
async function award() {
  if (busy.value || loading.value || !summary.value.length || invalidSelection.value || !warehouse.value?.id || !canAward.value) return;
  const company = activeCompanyId.value, token = version, id = selectedId.value;
  if(comparing.value||!comparisonReady.value||!serverComparison.value)return;
  if(serverComparison.value.selection.some((g:any)=>g.partial||g.totalUsd==null)&&!partialAccepted.value){error.value='Revise y acepte la comparación parcial antes de enviar a Gerencia';return;}
  const payload = { branchId: warehouse.value.branchId, warehouseId: warehouse.value.id,acceptPartialComparison:partialAccepted.value,expectedComparisonHash:serverComparison.value.comparisonHash,details: Object.values(selections.value).map(pick => ({ quotationDetailId: pick.detailId, quantity: Number(pick.quantity) })).sort((a, b) => a.quotationDetailId - b.quotationDetailId) };
  const signature = JSON.stringify({ company, processId: id, ...payload });
  if (!awardReference || awardReference.payload !== signature) awardReference = { payload: signature, id: crypto.randomUUID() };
  busy.value = true; error.value = '';
  try {
    const response = await http.post('/supply/consolidations/' + id + '/award-and-submit', { ...payload, requestId: awardReference.id }, config());
    if (!validContext(token, company)) return;
    applyCurrent(response.data.data, id);
    awardReference = null;
    success.value = 'Órdenes enviadas a Gerencia, pendientes de aprobación. Todavía no se envían al proveedor.';
  } catch (e) {
    if (validContext(token, company)) {
      error.value = getApiErrorMessage(e, 'No se pudieron guardar las órdenes');
      if ((e as any)?.response?.status === 409) {
        comparisonReady.value = false;
        error.value += ' Actualice las ofertas para revisar los cambios y volver a enviar.';
      }
    }
  }
  finally { if (validContext(token, company)) busy.value = false; }
}
watch(productId, () => { comparisonCurrency.value = ''; expandedOfferId.value = 0; }, { flush: 'sync' });
watch(()=>JSON.stringify([selectedId.value,current.value?.updatedAt,Object.values(selections.value)]),()=>{partialAccepted.value=false;comparisonReady.value=false;if(serverComparison.value?.processId!==selectedId.value)serverComparison.value=null;++comparisonVersion;comparing.value=!!current.value;clearTimeout(comparisonTimer);comparisonTimer=setTimeout(()=>{void refreshComparison();},120);},{flush:'sync'});
watch([activeCompanyId, () => route.query.requestId, () => route.query.id], () => {
  ++version; selections.value = {}; current.value = null; processes.value = []; selectedId.value = 0; warehouse.value = null;
  awardReference = null;
  ++comparisonVersion;clearTimeout(comparisonTimer);serverComparison.value=null;comparing.value=false;comparisonReady.value=false;
  productId.value = 0; step.value = 'compare'; expandedOfferId.value = 0; busy.value = false; error.value = ''; success.value = '';
  history.value = false; clearFilters(); discardSelection.value = false; pendingSelectionChange = undefined;
  if (activeCompanyId.value) void load(); else loading.value = false;
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { ++version;++comparisonVersion;clearTimeout(comparisonTimer);pendingSelectionChange = undefined; });
</script>

<template>
  <AdminLayout title="Comparar cotizaciones">
    <div class="comparison-page mx-auto max-w-[1440px] space-y-6">
      <PurchasesNav />
      <PurchaseSectionHeader title="Elegir ofertas" description="Compare por producto. Revise su selección antes de crear las órdenes.">
        <template #actions><div class="flex items-center gap-4"><AppButton v-if="current" variant="outline" size="sm" :disabled="busy||loading" @click="refreshOffers">Actualizar ofertas</AppButton><RouterLink :to="selectedId ? '/purchases/quotations/manage?id=' + selectedId : '/purchases/quotations'" class="inline-flex items-center gap-2 text-sm font-medium text-muted-fg hover:text-fg"><ArrowLeft class="h-4 w-4" />Cotizaciones</RouterLink></div></template>
      </PurchaseSectionHeader>

      <section aria-label="Compra y filtros" class="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-surface p-4 sm:px-5">
        <label class="min-w-0 flex-[1_1_280px] text-xs font-medium text-muted-fg">Compra
          <select :value="selectedId" :disabled="busy || loading" class="field-control mt-1.5 text-fg" @change="changeProcess">
            <option :value="0" disabled>Seleccione una compra</option>
            <option v-if="current && !choices.some(process => process.id === selectedId)" :value="selectedId">{{ processLabel(current) }}</option>
            <option v-for="process in choices" :key="process.id" :value="process.id">{{ processLabel(process) }}</option>
          </select>
        </label>
        <PurchaseTabs :model-value="history ? 'all' : 'week'" :items="[{ value: 'week', label: 'Esta semana' }, { value: 'all', label: 'Anteriores' }]" label="Antigüedad de las compras" :disabled="busy || loading" @update:model-value="changePeriod" />
        <details class="relative self-center sm:self-end">
          <summary class="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-medium text-muted-fg hover:bg-surface-secondary"><SlidersHorizontal class="h-4 w-4" />Filtros<span v-if="activeFilterCount" class="rounded-full bg-accent-soft px-1.5 text-xs text-fg">{{ activeFilterCount }}</span></summary>
          <div class="absolute right-0 top-full z-30 mt-2 w-[min(320px,calc(100vw-3rem))] space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-subtle">
            <label class="block text-sm">Buscar compra<input v-model="search" type="search" class="field-control" placeholder="Número, código o fecha" :disabled="busy || loading || hasSelection" /></label>
            <label v-if="history" class="block text-sm">Desde<input v-model="historyFrom" type="date" class="field-control" :max="historyTo || undefined" :disabled="busy || loading || hasSelection" /></label>
            <label v-if="history" class="block text-sm">Hasta<input v-model="historyTo" type="date" class="field-control" :min="historyFrom || undefined" :disabled="busy || loading || hasSelection" /></label>
            <button v-if="activeFilterCount" type="button" class="text-sm font-medium text-accent disabled:opacity-50" :disabled="busy || loading || hasSelection" @click="clearFilters">Limpiar filtros</button>
          </div>
        </details>
      </section>
      <p v-if="error" role="alert" class="rounded-xl bg-danger/10 p-4 text-sm text-danger">{{ error }}</p>
      <p v-if="success" role="status" class="rounded-xl bg-success/10 p-4 text-sm text-success">{{ success }}</p>

      <p v-if="loading" role="status" class="py-12 text-center text-sm text-muted-fg">Cargando ofertas…</p>
      <template v-else-if="current">
        <div v-if="!allOrdered && pendingProducts.length" class="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Pasos para elegir ofertas" class="flex items-center gap-3 text-sm">
            <button type="button" :disabled="busy" :aria-current="step === 'compare' ? 'step' : undefined" class="inline-flex items-center gap-2 font-medium disabled:opacity-50" :class="step === 'compare' ? 'text-fg' : 'text-muted-fg'" @click="step = 'compare'"><span class="step-dot" :class="step === 'compare' ? 'bg-fg text-surface' : 'bg-surface-secondary text-muted-fg'">1</span>Elegir proveedores</button>
            <ChevronRight class="h-4 w-4 text-muted-fg" />
            <button type="button" :disabled="busy || !summary.length || invalidSelection || !canSelect" :aria-current="step === 'review' ? 'step' : undefined" class="inline-flex items-center gap-2 font-medium disabled:opacity-40" :class="step === 'review' ? 'text-fg' : 'text-muted-fg'" @click="reviewSelection"><span class="step-dot" :class="step === 'review' ? 'bg-fg text-surface' : 'bg-surface-secondary text-muted-fg'">2</span>Revisar compra</button>
          </nav>
          <p class="text-xs text-muted-fg">{{ pickedCount }} de {{ pendingProducts.length }} productos elegidos</p>
        </div>

        <section v-if="step==='compare'&&!allOrdered" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3"><PurchaseTabs :model-value="comparisonMode" :items="[{value:'product',label:'Por producto'},{value:'matrix',label:'Matriz de proveedores'}]" label="Vista de la comparación" @update:model-value="comparisonMode=$event as 'matrix'|'product'" /><AppButton v-if="canSelect&&serverComparison?.recommendation" variant="outline" :disabled="busy||comparing||!comparisonReady" @click="applyRecommended">Aplicar recomendación</AppButton></div>
          <div v-if="serverComparison?.recommendation" class="rounded-xl border border-border bg-surface px-5 py-4"><p class="text-sm font-medium">Recomendación: {{ money(serverComparison.recommendation.totalUsd,'USD') }} <span v-if="serverComparison.recommendation.partial" class="ml-2 text-xs text-warning">Comparación parcial</span></p><p class="mt-1 text-xs leading-5 text-muted-fg">{{ serverComparison.recommendation.reason }}</p><p v-if="serverComparison.recommendation.partial" class="mt-1 text-xs text-warning">Hay costos, condiciones o productos pendientes de confirmar. La decisión final es de Compras.</p></div>
          <p v-else-if="serverComparison?.comparisonPartial" class="text-sm text-warning">{{ serverComparison.reason }}</p>
          <p v-if="comparing" role="status" class="text-xs text-muted-fg">Verificando costos y disponibilidad…</p>
          <ul v-if="invalidSelection" role="alert" class="space-y-1 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"><li v-for="issue in selectionIssues" :key="issue">{{ issue }}</li></ul>
          <details v-if="comparisonMode==='product' && completeSuppliers.length" class="rounded-xl border border-border bg-surface px-5 py-4">
            <summary class="cursor-pointer text-sm font-medium">Comprar todo a un proveedor <span class="ml-1 text-xs font-normal text-muted-fg">{{ completeSuppliers.length }} opciones</span></summary>
            <div class="mt-4 divide-y divide-border"><div v-for="option in completeSuppliers" :key="option.supplierId" class="flex flex-wrap items-center justify-between gap-3 py-3"><div><p class="text-sm font-medium">{{ option.supplier }}</p><p class="mt-1 text-xs text-muted-fg">{{ money(option.group.total,option.group.currency) }} · productos y cargos de la oferta<span v-if="option.group.partial"> · condiciones pendientes</span></p></div><AppButton v-if="canSelect" size="sm" variant="outline" :disabled="busy||comparing||!comparisonReady" @click="selectFullSupplier(option.supplierId)">Seleccionar oferta completa</AppButton></div></div>
          </details>
          <div v-if="comparisonMode==='matrix'&&serverComparison" class="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table class="w-full min-w-[760px] text-left text-sm"><caption class="sr-only">Productos en filas y proveedores en columnas; precios normalizados a la unidad de compra.</caption><thead><tr class="border-b border-border bg-surface-secondary/50"><th scope="col" class="w-60 p-5 align-top font-medium">Producto y cantidad</th><th v-for="supplier in serverComparison.suppliers" :key="supplier.id" scope="col" class="min-w-64 p-5 align-top"><p class="max-w-xs break-words font-semibold">{{ supplier.name }}</p><p class="mt-2 text-xs font-normal text-muted-fg">{{ serverComparison.supplierTotals.find((g:any)=>g.supplierId===supplier.id)?.group ? money(serverComparison.supplierTotals.find((g:any)=>g.supplierId===supplier.id).group.total,serverComparison.supplierTotals.find((g:any)=>g.supplierId===supplier.id).group.currency) : 'Disponibilidad por confirmar' }}</p><AppButton v-if="canSelect" size="sm" variant="outline" class="mt-3" :disabled="busy||comparing||!comparisonReady||!serverComparison.supplierTotals.find((g:any)=>g.supplierId===supplier.id)?.complete" @click="selectFullSupplier(supplier.id)">Seleccionar oferta completa</AppButton></th></tr></thead>
              <tbody><tr v-for="row in serverComparison.rows" :key="row.lineId" class="border-b border-border last:border-0"><th scope="row" class="p-5 align-top font-normal"><p class="font-semibold">{{ row.product.name }}</p><p class="mt-2 text-xs text-muted-fg">Solicitado {{ row.requestedQuantity }} · Propuesto {{ row.purchaseQuantity }}</p><p v-if="!row.pendingQuantity" class="mt-2 text-xs text-success">Ya comprado</p><label v-else class="mt-3 block text-xs text-muted-fg">Cantidad a comprar<input v-if="selections[row.lineId]" v-model.number="selections[row.lineId]!.quantity" type="number" min="1" :max="row.pendingQuantity" step="1" :disabled="busy||!canSelect" class="field-control mt-1 w-28 text-fg" /><span v-else class="mt-1 block font-medium text-fg">{{ row.wanted }} {{ row.unit.name }}</span></label></th>
                <td v-for="cell in row.cells" :key="cell.supplierId" class="p-5 align-top" :class="selections[row.lineId]?.detailId===cell.detailId?'bg-accent-soft':''">
                  <p v-if="cell.state==='not_quoted'" class="text-sm text-muted-fg">No cotizado</p>
                  <template v-else><label class="flex items-start gap-2" :class="cell.eligible?'cursor-pointer':''"><input type="radio" :name="'supplier-'+row.lineId" :checked="selections[row.lineId]?.detailId===cell.detailId" :disabled="busy||!canSelect||!cell.eligible" class="mt-1 h-4 w-4 accent-accent" @change="chooseMatrix(row.lineId,cell.detailId)" /><span><strong class="text-base tabular-nums">{{ money(cell.unitPrice,cell.currency) }}</strong><span class="ml-1 text-xs text-muted-fg">/ {{ row.unit.name }}</span></span></label><span v-if="row.lowestUnitPriceDetailId===cell.detailId" class="mt-2 inline-block text-[11px] font-medium text-success">Menor precio comparable</span><span v-if="recommendedDetail(cell.detailId)" class="mt-2 ml-2 inline-block text-[11px] font-medium text-accent">Recomendada por costo total</span>
                    <dl class="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs"><dt class="text-muted-fg">Cotizado</dt><dd>{{ cell.quotedQuantity }} {{ row.unit.name }}</dd><dt class="text-muted-fg">Disponible</dt><dd>{{ cell.availableQuantity }} {{ row.unit.name }}</dd><dt class="text-muted-fg">Descuento</dt><dd>{{ money(cell.discount,cell.currency) }}</dd><dt class="text-muted-fg">Impuesto</dt><dd>{{ cell.taxRate }}%</dd><dt class="text-muted-fg">Entrega</dt><dd>{{ cell.deliveryDays==null?'Por confirmar':cell.deliveryDays+' días' }}</dd><template v-if="cell.eligible"><dt class="text-muted-fg">Subtotal neto</dt><dd>{{ money(cell.subtotal,cell.currency) }}</dd><dt class="font-medium">Total por {{ cell.quantity }}</dt><dd class="font-semibold">{{ money(cell.total,cell.currency) }}</dd></template></dl>
                    <p v-if="cell.presentation" class="mt-2 text-xs text-muted-fg">{{ cell.presentation }}: {{ cell.unitsPerPack }} unidades · {{ money(cell.presentationPrice,cell.currency) }} por presentación</p><p v-if="cell.minimumQuantity" class="mt-2 text-xs text-muted-fg">Compra mínima: {{ cell.minimumQuantity }} {{ row.unit.name }}</p><p v-if="!cell.eligible" class="mt-3 text-xs text-warning">{{ cell.label }}</p><RouterLink v-if="!cell.eligible&&can('purchase_quotations.update')" :to="'/purchases/quotations/manage?id='+selectedId+'&rfqId='+current.rfqs.find((r:any)=>r.supplierId===cell.supplierId)?.id" class="mt-2 inline-block text-xs font-medium text-accent">Corregir oferta o disponibilidad</RouterLink><p v-if="cell.partial" class="mt-2 text-[11px] text-warning">Cargos o condiciones de la oferta pendientes de revisar</p>
                  </template>
                </td>
              </tr></tbody>
            </table>
          </div>
        </section>
        <div v-if="step === 'compare'&&(comparisonMode==='product'||allOrdered)" class="comparison-workspace grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside class="min-w-0 rounded-2xl border border-border bg-surface p-3 lg:sticky lg:top-5">
            <h2 class="px-3 py-2 text-xs font-semibold tracking-wide text-muted-fg">PRODUCTOS <span class="ml-1 font-normal">{{ lines.length }}</span></h2>
            <nav aria-label="Productos de la compra" class="product-list mt-1 flex gap-2 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
              <button v-for="line in lines" :key="line.id" type="button" :disabled="busy" :aria-current="productId === line.id ? 'true' : undefined" class="product-choice flex min-w-52 items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors disabled:opacity-50 lg:w-full lg:min-w-0" :class="productId === line.id ? 'bg-accent-soft text-fg' : 'text-muted-fg hover:bg-surface-secondary'" @click="focusProduct(line.id)">
                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border" :class="selections[line.id] ? 'border-accent bg-accent text-accent-foreground' : remaining(line) <= 0 ? 'border-success/30 bg-success/10 text-success' : 'border-border text-muted-fg'"><Check v-if="selections[line.id] || remaining(line) <= 0" class="h-3 w-3" /><Package v-else class="h-3 w-3" /></span>
                <span class="min-w-0"><span class="block break-words text-sm font-medium leading-5">{{ line.product.name }}</span><span class="mt-1 block text-xs leading-5" :class="productId === line.id ? 'text-muted-fg' : ''">{{ selections[line.id] ? selections[line.id]!.quantity + ' ' + line.unit.name + ' · Elegido' : remaining(line) <= 0 ? 'Ya comprado' : remaining(line) + ' ' + line.unit.name + ' pendientes' }}</span><span v-if="pickedSupplier(line)" class="mt-0.5 block truncate text-[11px] text-muted-fg">{{ pickedSupplier(line) }}</span></span>
              </button>
            </nav>
          </aside>

          <section v-if="product" class="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
            <header class="border-b border-border px-5 py-6 sm:px-7">
              <p class="mb-2 text-xs font-medium text-muted-fg">{{ product.product.sku }}</p>
              <h2 class="break-words text-xl font-semibold tracking-tight text-fg sm:text-2xl">{{ product.product.name }}</h2>
              <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><p class="text-muted-fg">{{ remaining(product) > 0 ? 'Por comprar' : 'Comprado' }} <strong class="ml-1 font-semibold text-fg">{{ remaining(product) > 0 ? remaining(product) : Number(product.purchasedQuantity) }} {{ product.unit.name }}</strong></p><span v-if="remaining(product) > 0" class="text-xs text-muted-fg">{{ availableOffers.length }} {{ availableOffers.length === 1 ? 'oferta disponible' : 'ofertas disponibles' }}</span></div>
            </header>

            <div v-if="remaining(product) <= 0" class="px-5 py-10 sm:px-7">
              <CheckCircle2 class="mb-4 h-8 w-8 text-success" />
              <h3 class="text-lg font-semibold">Este producto ya está en una orden</h3>
              <p class="mt-2 max-w-lg text-sm leading-6 text-muted-fg">Puede continuar con las órdenes de esta compra para revisar su recepción y entrega.</p>
              <button v-if="selections[productId] && canSelect" type="button" :disabled="busy" class="mt-4 text-sm font-medium text-accent disabled:opacity-50" @click="removeSelection(productId)">Quitar de mi selección</button>
              <div v-if="can('purchase_orders.view')" class="mt-6 flex flex-wrap gap-3"><RouterLink v-for="order in current.orders.filter((item: any) => !['cancelled','rejected'].includes(item.status))" :key="order.id" :to="'/purchases/orders?id=' + order.id" class="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-secondary"><ShoppingCart class="h-4 w-4" />{{ order.code }}<ArrowRight class="h-4 w-4 text-muted-fg" /></RouterLink></div>
            </div>

            <template v-else>
              <div v-if="comparison.currencies.length > 1" class="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-7">
                <label for="comparison-currency" class="text-sm text-muted-fg">Moneda de comparación</label><select id="comparison-currency" v-model="comparisonCurrency" :disabled="busy" class="field-control max-w-40"><option value="">Elegir moneda</option><option v-for="currency in comparison.currencies" :key="currency" :value="currency">{{ currency }}</option></select><p class="text-xs text-muted-fg">Los totales de monedas distintas se mantienen separados.</p>
              </div>
              <div v-if="availableOffers.length" class="px-5 py-5 sm:px-7">
                <div class="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 class="text-sm font-semibold">Ofertas de proveedores</h3><p class="text-xs text-muted-fg">Impuestos y cargos registrados incluidos</p></div>
                <div class="offer-table overflow-x-auto">
                  <table :aria-label="'Ofertas para ' + product.product.name" class="w-full text-left text-sm">
                    <thead class="text-xs text-muted-fg"><tr><th scope="col" class="pb-3 font-medium">Proveedor</th><th scope="col" class="pb-3 text-right font-medium">Precio unitario</th><th scope="col" class="pb-3 text-right font-medium">Total estimado</th><th scope="col" class="pb-3 text-right font-medium">Disponible</th><th scope="col" class="pb-3 text-right font-medium">Entrega</th><th scope="col" class="pb-3 text-right font-medium"><span class="sr-only">Condiciones de la oferta</span></th></tr></thead>
                    <tbody v-for="offer in availableOffers" :key="offer.detail.id" :class="selections[productId]?.detailId === offer.detail.id ? 'chosen-offer' : ''">
                      <tr class="offer-row border-t border-border">
                        <td class="offer-supplier py-5 pr-4 align-top">
                          <label class="flex items-start gap-3" :class="canSelect && !busy ? 'cursor-pointer' : ''"><input type="radio" :name="'supplier-' + productId" :value="offer.detail.id" :checked="selections[productId]?.detailId === offer.detail.id" :disabled="busy || !canSelect" class="mt-0.5 h-4 w-4 shrink-0 accent-accent" @change="choose(offer.detail.id)" /><span class="min-w-0"><span class="block break-words font-semibold leading-5">{{ offer.rfq.supplier.name }}</span><span v-if="selections[productId]?.detailId === offer.detail.id" class="mt-1 inline-block text-xs font-medium text-accent">Elegido</span><span v-else-if="recommendedDetail(offer.detail.id)" class="mt-1 inline-block rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Recomendada por costo total</span><span v-if="offer.previewQuantity < comparisonQuantity" class="mt-1 block text-xs text-warning">Disponibilidad parcial</span></span></label>
                        </td>
                        <td data-label="Precio unitario" class="py-5 pl-3 text-right align-top tabular-nums">{{ money(Number(offer.detail.unitPrice), offer.rfq.quotation.currency) }}</td>
                        <td data-label="Total estimado" class="offer-total py-5 pl-4 text-right align-top"><strong class="whitespace-nowrap text-base font-semibold tabular-nums">{{ money(offer.preview.total, offer.rfq.quotation.currency) }}</strong><span class="mt-1 block text-[11px] text-muted-fg">por {{ offer.previewQuantity }} {{ product.unit.name }}</span></td>
                        <td data-label="Disponible" class="py-5 pl-4 text-right align-top tabular-nums">{{ offer.pendingAvailable }}<span class="mt-1 block text-[11px] text-muted-fg">{{ product.unit.name }}</span></td>
                        <td data-label="Entrega" class="py-5 pl-4 text-right align-top"><span class="whitespace-nowrap">{{ offer.deliveryDays === null ? 'Sin indicar' : offer.deliveryDays + ' días' }}</span></td>
                        <td class="offer-disclosure py-4 pl-2 text-right align-top"><button type="button" :aria-label="'Ver condiciones de ' + offer.rfq.supplier.name" :aria-expanded="expandedOfferId === offer.detail.id" :aria-controls="'offer-detail-' + offer.detail.id" class="rounded-lg p-2 text-muted-fg hover:bg-surface-secondary hover:text-fg" @click="expandedOfferId = expandedOfferId === offer.detail.id ? 0 : offer.detail.id"><ChevronDown class="h-4 w-4 transition-transform" :class="expandedOfferId === offer.detail.id ? 'rotate-180' : ''" /></button></td>
                      </tr>
                      <tr v-if="expandedOfferId === offer.detail.id"><td :id="'offer-detail-' + offer.detail.id" colspan="6" class="offer-detail pb-5">
                        <div class="rounded-xl bg-surface-secondary p-4">
                          <dl class="grid gap-4 text-xs sm:grid-cols-3"><div><dt class="text-muted-fg">Condiciones de pago</dt><dd class="mt-1 font-medium">{{ offer.rfq.quotation.paymentTerms || 'Por confirmar' }}</dd></div><div><dt class="text-muted-fg">Vigencia</dt><dd class="mt-1 font-medium">{{ shortDate(offer.rfq.quotation.validUntil) }}</dd></div><div><dt class="text-muted-fg">Cotización</dt><dd class="mt-1"><RouterLink :to="'/purchases/quotations?id=' + offer.rfq.quotation.id" class="font-medium text-accent">{{ offer.rfq.quotation.code }}<span class="sr-only"> · Ver oferta completa</span></RouterLink></dd></div></dl>
                          <p class="mt-4 text-xs leading-6 text-muted-fg">Para {{ offer.previewQuantity }} {{ product.unit.name }}: subtotal neto {{ money(offer.preview.subtotal, offer.rfq.quotation.currency) }} · impuestos {{ money(offer.preview.tax, offer.rfq.quotation.currency) }} · gastos previstos {{ money(offer.preview.expenses, offer.rfq.quotation.currency) }}. Descuento aplicado: {{ money(offer.preview.discount, offer.rfq.quotation.currency) }}.</p>
                          <p v-if="recommendedDetail(offer.detail.id)" class="mt-2 text-xs leading-5 text-muted-fg">{{ serverComparison?.recommendation?.reason }}</p>
                          <p v-if="!offer.preview.expensesAutomatic" class="mt-2 text-xs text-warning">Esta orden tiene gastos ajustados; el presupuesto se conserva.</p><p v-if="Number(offer.detail.minimumQuantity)>0" class="mt-2 text-xs text-muted-fg">Compra mínima: {{ Number(offer.detail.minimumQuantity) }} {{ product.unit.name }}.</p><p v-if="offer.detail.notes" class="mt-2 text-xs text-muted-fg">{{ offer.detail.notes }}</p>
                        </div>
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div v-else class="px-5 py-12 sm:px-7"><FileSearch class="mb-4 h-8 w-8 text-muted-fg" /><h3 class="text-base font-semibold">{{ offers.length ? 'No hay ofertas disponibles para elegir' : 'Aún no hay ofertas para este producto' }}</h3><RouterLink :to="'/purchases/quotations/manage?id=' + selectedId" class="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent">{{ offers.length ? 'Revisar cotizaciones' : 'Registrar una oferta' }}<ArrowRight class="h-4 w-4" /></RouterLink></div>

              <div v-if="selections[productId] && selectedOffer" class="selection-editor mx-5 mb-5 rounded-xl border border-accent/30 bg-accent-soft p-4 sm:mx-7">
                <div class="flex flex-wrap items-end justify-between gap-4">
                  <label class="block max-w-52 text-sm font-medium">Cantidad a comprar<span class="mt-1 flex items-center gap-2"><input v-model.number="selections[productId]!.quantity" :disabled="busy || !canSelect" type="number" min="1" :max="maxQuantity()" step="1" class="field-control bg-surface" /><span class="shrink-0 text-xs text-muted-fg">{{ product.unit.name }}</span></span></label>
                  <div class="flex items-center gap-3"><button type="button" :disabled="busy || !canSelect" class="text-xs font-medium text-muted-fg hover:text-fg disabled:opacity-50" @click="removeSelection(productId)">Quitar</button><AppButton v-if="canSelect" :disabled="busy || invalidSelection" size="sm" @click="nextProduct">{{ pendingProducts.some(line => !selections[line.id] && line.id !== productId) ? 'Siguiente producto' : 'Revisar selección' }}<ArrowRight class="h-4 w-4" /></AppButton></div>
                </div>
                <p v-if="selections[productId]!.quantity < remaining(product)" class="mt-3 text-xs leading-5 text-muted-fg">Quedarán {{ roundPurchaseAmount(remaining(product) - selections[productId]!.quantity) }} {{ product.unit.name }} por comprar.</p>
              </div>
              <details v-if="unavailableOffers.length" :open="!availableOffers.length" class="border-t border-border px-5 py-4 sm:px-7">
                <summary class="cursor-pointer text-sm font-medium">Ofertas por revisar ({{ unavailableOffers.length }})</summary>
                <ul class="mt-4 divide-y divide-border"><li v-for="offer in unavailableOffers" :key="offer.detail.id" class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p class="font-medium">{{ offer.rfq.supplier.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ offer.reason }}<span v-if="Number(offer.detail.unitPrice)>0 && !['not_quoted','unavailable'].includes(offer.detail.availabilityStatus || '')"> · Precio registrado {{ money(Number(offer.detail.unitPrice),offer.rfq.quotation.currency) }}</span></p></div><RouterLink v-if="can('purchase_quotations.update')" :to="'/purchases/quotations/manage?id='+selectedId+'&rfqId='+offer.rfq.id" class="text-xs font-medium text-accent">Revisar oferta<ArrowRight class="ml-1 inline h-3 w-3" /></RouterLink></li></ul>
              </details>
            </template>
            <details class="border-t border-border px-5 py-4 sm:px-7"><summary class="cursor-pointer text-xs font-medium text-muted-fg">Cantidades y solicitudes de origen</summary><div class="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs"><span class="text-muted-fg">Solicitado <strong class="ml-1 text-fg">{{ Number(product.requestedQuantity) }}</strong></span><span class="text-muted-fg">Decidido por Compras <strong class="ml-1 text-fg">{{ Number(product.purchaseQuantity) }}</strong></span><span class="text-muted-fg">Ya comprado <strong class="ml-1 text-fg">{{ Number(product.purchasedQuantity) }}</strong></span></div><ul class="mt-3 space-y-2 text-xs text-muted-fg"><li v-for="source in product.sources" :key="source.id">{{ source.requestDetail.request.code }} · {{ source.requestDetail.request.branch.name }} · {{ Number(source.quantity) }} {{ product.unit.name }}</li></ul><p v-if="!product.sources?.length" class="mt-3 text-xs text-muted-fg">Producto agregado por Compras.</p></details>
          </section>
          <div v-else class="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-fg">Esta compra todavía no tiene productos.</div>
        </div>

        <section v-if="step==='review'" id="comparison-review" class="mx-auto max-w-4xl space-y-5">
          <header class="flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-xl font-semibold tracking-tight">Revisar selección</h2><p class="mt-1 text-sm text-muted-fg">{{ pickedCount }} productos · {{ summary.length }} {{ summary.length === 1 ? 'proveedor' : 'proveedores' }}</p></div><AppButton variant="outline" :disabled="busy" @click="step = 'compare'"><ArrowLeft class="h-4 w-4" />Cambiar proveedores</AppButton></header>
          <article v-for="group in summary" :key="group.supplierId" class="overflow-hidden rounded-2xl border border-border bg-surface">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-secondary/60 px-5 py-5 sm:px-7"><h3 class="max-w-xl break-words text-base font-semibold">{{ group.supplier }}</h3><span class="text-xs text-muted-fg">{{ group.updating ? 'Ampliar orden en borrador' : 'Nueva orden de compra' }}</span></header>
            <div class="divide-y divide-border px-5 sm:px-7"><div v-for="item in group.products" :key="item.id" class="flex flex-wrap items-center gap-4 py-5"><div class="min-w-0 flex-[1_1_260px]"><p class="break-words text-sm font-medium">{{ item.name }}</p><button type="button" :disabled="busy" class="mt-1 text-xs font-medium text-accent disabled:opacity-50" @click="focusProduct(item.id)">Cambiar proveedor</button></div><label class="text-xs text-muted-fg">Cantidad<span class="mt-1 flex items-center gap-2"><input v-model.number="selections[item.id]!.quantity" :aria-label="'Cantidad de ' + item.name" :disabled="busy || !canSelect" type="number" min="1" :max="item.max" step="1" class="field-control w-24 text-fg" /><span>{{ item.unit }}</span></span></label><button v-if="canSelect" type="button" :aria-label="'Quitar ' + item.name" :disabled="busy" class="rounded-lg p-2 text-muted-fg hover:bg-surface-secondary hover:text-fg" @click="removeSelection(item.id)"><X class="h-4 w-4" /></button><p v-if="item.quantity < item.pending" class="basis-full text-xs text-muted-fg">Pendiente después de esta compra: {{ roundPurchaseAmount(item.pending - item.quantity) }} {{ item.unit }}.</p></div></div>
            <div class="border-t border-border px-5 py-5 sm:px-7"><dl class="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm"><dt class="text-muted-fg">Productos, neto</dt><dd class="text-right tabular-nums">{{ money(group.subtotal, group.currency) }}</dd><dt class="text-muted-fg">Impuestos</dt><dd class="text-right tabular-nums">{{ money(group.tax, group.currency) }}</dd><dt class="text-muted-fg">Gastos previstos</dt><dd class="text-right tabular-nums">{{ money(group.expenses, group.currency) }}</dd><dt class="mt-2 font-semibold">{{ group.updating ? 'Importe adicional' : 'Total de la orden' }}</dt><dd class="mt-2 text-right text-xl font-semibold tracking-tight tabular-nums">{{ money(group.total, group.currency) }}</dd></dl><p v-if="group.updating" class="mt-4 text-right text-xs text-muted-fg">Orden actual: {{ money(group.previousTotal, group.currency) }} · Total después de ampliar: {{ money(group.orderTotal, group.currency) }}</p><p v-if="!group.expensesAutomatic" class="mt-3 text-right text-xs text-warning">Se conserva el presupuesto de gastos ajustado en la orden.</p></div>
          </article>
          <p v-if="pendingProducts.length > pickedCount" class="text-sm text-muted-fg">Los productos que no eligió seguirán pendientes de compra.</p>
          <ul v-if="invalidSelection" role="alert" class="space-y-1 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"><li v-for="issue in selectionIssues" :key="issue">{{ issue }}</li></ul>
          <p v-if="!warehouse?.id" role="alert" class="text-sm text-danger">Configure el almacén general antes de crear las órdenes.</p>
          <div v-if="!summary.length" class="rounded-2xl border border-dashed border-border p-10 text-center"><p class="text-sm text-muted-fg">No quedan productos en su selección.</p><AppButton class="mt-4" variant="outline" @click="step = 'compare'">Elegir ofertas</AppButton></div>
          <div v-if="serverComparison?.selection.some((g:any)=>g.partial||g.totalUsd==null)" class="rounded-xl border border-warning/30 bg-warning/5 p-4"><p class="text-sm font-medium">Comparación parcial</p><ul class="mt-2 space-y-1 text-xs text-muted-fg"><li v-for="group in serverComparison.selection" :key="group.quotationId">{{ group.supplier }}: {{ group.reasons.join(' · ') || 'Condiciones completas' }}</li></ul><label class="mt-3 flex items-start gap-2 text-sm"><input v-model="partialAccepted" type="checkbox" :disabled="busy||comparing" class="mt-1" />Confirmo que Gerencia recibirá esta compra con las condiciones pendientes indicadas.</label></div>
          <footer v-if="summary.length" class="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border bg-surface px-5 py-6 sm:px-7"><div><p class="text-xs text-muted-fg">{{ updatingOrders ? 'Total adicional de la selección' : 'Total de la compra' }}</p><p v-for="total in totals" :key="total.currency" class="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{{ money(total.amount, total.currency) }} <span v-if="totals.length > 1" class="text-sm text-muted-fg">{{ total.currency }}</span></p><p class="mt-2 text-xs text-muted-fg">Destino: {{ warehouse?.name || 'Sin almacén general' }}</p></div></footer>
          <div v-if="summary.length" class="flex flex-wrap items-center justify-end gap-3"><p v-if="comparing" class="text-xs text-muted-fg">Verificando costos…</p><AppButton v-if="canAward" :disabled="busy || loading || comparing || !comparisonReady || !serverComparison || !warehouse?.id || invalidSelection || (serverComparison.selection.some((g:any)=>g.partial||g.totalUsd==null)&&!partialAccepted)" @click="award"><ShoppingCart class="h-4 w-4" />{{ busy ? 'Enviando…' : 'Generar órdenes y enviar a Gerencia' }}</AppButton></div>
        </section>

        <div v-if="step === 'compare' && hasSelection && canSelect" class="selection-bar sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-subtle sm:px-6"><div><p class="text-sm font-semibold">{{ pickedCount }} {{ pickedCount === 1 ? 'producto elegido' : 'productos elegidos' }}</p><p class="mt-1 text-xs text-muted-fg"><span v-for="(total,index) in totals" :key="total.currency">{{ index ? ' · ' : '' }}{{ money(total.amount,total.currency) }}{{ totals.length > 1 ? ' ' + total.currency : '' }}</span> · {{ summary.length }} {{ summary.length === 1 ? 'proveedor' : 'proveedores' }}</p></div><div class="flex items-center gap-4"><button type="button" :disabled="busy||loading" class="text-xs font-medium text-muted-fg disabled:opacity-50" @click="clearSelection">Limpiar selección</button><AppButton :disabled="busy || loading || !summary.length || invalidSelection" @click="reviewSelection">Revisar selección<ArrowRight class="h-4 w-4" /></AppButton></div></div>
        <details v-if="current.orders?.length && !allOrdered" class="rounded-xl border border-border bg-surface px-5 py-4"><summary class="cursor-pointer text-sm font-medium text-muted-fg">Órdenes ya creadas ({{ current.orders.length }})</summary><div class="mt-4 flex flex-wrap gap-4"><RouterLink v-for="order in current.orders" :key="order.id" :to="'/purchases/orders?id=' + order.id" class="text-sm font-medium text-accent">{{ order.code }}</RouterLink></div></details>
      </template>
      <div v-else-if="!error" class="rounded-2xl border border-dashed border-border py-14 text-center"><FileSearch class="mx-auto mb-4 h-8 w-8 text-muted-fg" /><h2 class="text-base font-semibold">{{ activeFilterCount ? 'No hay compras con estos filtros' : history ? 'Elija una compra para comparar' : 'No hay compras de esta semana' }}</h2><RouterLink to="/purchases/quotations" class="mt-4 inline-block text-sm font-medium text-accent">Ir a cotizaciones</RouterLink></div>
    </div>
    <PurchaseActionDialog v-if="discardSelection" title="Descartar selección" description="Tiene productos seleccionados sin guardar. Confirme si desea descartarlos y continuar." :busy="false" @close="resolveSelectionDiscard(false)" @confirm="resolveSelectionDiscard(true)" />
    <PurchaseActionDialog v-if="leaving" title="Descartar selección" description="Tiene productos seleccionados sin guardar en sus órdenes." :busy="false" @close="resolveLeave(false)" @confirm="resolveLeave(true)" />
  </AdminLayout>
</template>

<style scoped>
.step-dot { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; }
.offer-table table { table-layout: fixed; }
.offer-table { container-type: inline-size; }
.offer-table th:first-child { width: 32%; }
.offer-table th:nth-child(2) { width: 17%; }
.offer-table th:nth-child(3) { width: 21%; }
.offer-table th:nth-child(4) { width: 14%; }
.offer-table th:nth-child(5) { width: 12%; }
.offer-table th:last-child { width: 4%; }
.chosen-offer .offer-row { background: hsl(var(--accent-soft) / 0.65); }
.chosen-offer .offer-supplier { box-shadow: inset 3px 0 hsl(var(--accent)); padding-left: 12px; border-radius: 8px 0 0 8px; }
.offer-table th, .offer-table td { overflow-wrap: anywhere; }
.product-list { scrollbar-width: thin; }
@container (max-width: 720px) {
  .offer-table table, .offer-table tbody, .offer-table tr, .offer-table td { display: block; width: 100%; }
  .offer-table thead { display: none; }
  .offer-table .offer-row { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; padding: 20px 12px; }
  .offer-table .offer-supplier { grid-column: 1 / -1; padding: 0 32px 4px 0; box-shadow: none; }
  .offer-table td[data-label] { padding: 0; text-align: left; }
  .offer-table td[data-label]::before { content: attr(data-label); display: block; margin-bottom: 4px; color: hsl(var(--muted-fg)); font-size: 11px; }
  .offer-table .offer-total { grid-column: 2; grid-row: 2; }
  .offer-table .offer-disclosure { position: absolute; right: 8px; top: 12px; width: auto; padding: 0; }
  .chosen-offer .offer-row { border-radius: 12px; }
  .offer-table .offer-detail { padding-top: 8px; }
}
</style>
