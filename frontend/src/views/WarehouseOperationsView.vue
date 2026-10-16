<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import JsBarcode from 'jsbarcode';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Package, Plus, Printer, ScanLine, TriangleAlert, Truck, ReceiptText, RefreshCw } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import OperationsNav from '../components/operations/OperationsNav.vue';
import AppButton from '../components/base/AppButton.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { useUnsavedChanges } from '../composables/useUnsavedChanges';
import { getApiErrorMessage } from '../utils/api-error';
import { warehouseContext, placementsForContext, transfersForContext, receiptStateLabel, transferStateLabel } from '../utils/warehouse-context';
import SearchableSelect from '../components/base/SearchableSelect.vue';
import { dispatchPlanError, suggestDispatch, type DispatchSpace, type DispatchSuggestion } from '../utils/warehouse-dispatch';

const { can } = usePermissions();
const route = useRoute();
const context = computed(() => warehouseContext(route.query));
const contextDocument = ref<any>(null);
const contextNotice = ref('');
let loadVersion = 0, stockVersion = 0, expenseVersion = 0, destinationVersion = 0;
const tab = ref('home'), pending = ref<any[]>([]), requests = ref<any[]>([]), transfers = ref<any[]>([]), receipts = ref<any[]>([]);
const catalogs = ref<any>({ warehouses: [], products: [] }), purchaseCatalogs = ref<any>({ expenseTypes: [], generalWarehouse: null });
const error = ref(''), success = ref(''), busy = ref(false), loading = ref(false), loadFailed = ref(false);
const placement = reactive<Record<number, { barcode: string; locationId: number; confirmed: boolean }>>({});
const selectedRequest = ref(0), fromWarehouse = ref(0), toWarehouse = ref(0), stocks = ref<any[]>([]);
const dispatchLines = ref<any[]>([]), dispatchId = ref(crypto.randomUUID());
const destinationSpaces = ref<DispatchSpace[]>([]), destinationLoading = ref(false), stockLoading = ref(false);
const dispatchShortages = ref<DispatchSuggestion['shortages']>([]);
const receiptId = ref(0), expenses = ref<any[]>([]);
const expense = reactive({ expenseTypeId: 0, plannedExpenseId: 0, reference: '', amount: 0, category: 'expense', capitalizable: true });
const confirmDispatch = ref(false);
const headers = () => ({ headers: { 'X-Company-Id': String(activeCompanyId.value) } });
const general = computed(() => purchaseCatalogs.value.generalWarehouse);
const request = computed(() => requests.value.find(r => r.id === selectedRequest.value) ?? (context.value?.kind === 'request' && contextDocument.value?.id === selectedRequest.value ? contextDocument.value : null));
const visiblePending = computed(() => placementsForContext(pending.value, context.value));
// Compact list: one product open at a time, the first by default.
const openPlacement = ref<number | null | undefined>(undefined);
const isPlacementOpen = (id: number) => openPlacement.value === undefined ? visiblePending.value[0]?.id === id : openPlacement.value === id;
const togglePlacement = (id: number) => { openPlacement.value = isPlacementOpen(id) ? null : id; };
// Copies the internal code of a product (the one its label encodes) so it can be used anywhere else.
const copiedCode = ref<number | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copyInternalCode(p: any) {
  const code = String(p.product.internalCode ?? '');
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
    else { const field = document.createElement('textarea'); field.value = code; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field); field.select(); const ok = document.execCommand('copy'); document.body.removeChild(field); if (!ok) throw new Error('copy'); }
    copiedCode.value = p.id; clearTimeout(copiedTimer); copiedTimer = setTimeout(() => { copiedCode.value = null; }, 1800);
  } catch { error.value = 'No se pudo copiar el código. Selecciónalo y cópialo manualmente.'; }
}
const visibleTransfers = computed(() => transfersForContext(transfers.value, context.value));
const visibleRequests = computed(() => context.value ? context.value.kind === 'request' ? requests.value.filter(r => r.id === context.value?.id) : [] : requests.value);
const visibleReceipts = computed(() => context.value ? context.value.kind === 'purchase' ? receipts.value.filter(r => r.id === context.value?.id) : [] : receipts.value);
const selectedReceipt = computed(() => receipts.value.find(r => r.id === receiptId.value));
const canRecordExpense = computed(() => {
  const receipt = selectedReceipt.value;
  if (!receipt || receipt.retaceoArchived || ['CLOSED', 'CANCELLED', 'COSTED'].includes(receipt.status)) return false;
  const status = receipt.retaceoStatus ?? receipt.retaceos?.find((r: any) => r.status !== 'cancelled')?.status;
  if (receipt.hasActiveRetaceo && !status) return false;
  return !status || ['cancelled', 'draft'].includes(status);
});
const canDispatch = computed(() => !!request.value && !['draft', 'rejected', 'cancelled', 'fulfilled'].includes(request.value.status) && request.value.details.some((d: any) => Number(d.quantity) > Number(d.dispatchedQuantity)));
const tabs = computed(() => {
  if (context.value?.kind === 'invalid') return [];
  if (context.value?.kind === 'request') return [{ id: 'transfers', name: 'Entregas a sucursal' }];
  const receiptTabs = can('purchases.view') ? [{ id: 'placement', name: 'Ubicar productos' }, { id: 'expenses', name: 'Gastos de recepción' }] : [];
  if (context.value?.kind === 'purchase') return receiptTabs;
  return [...receiptTabs, { id: 'transfers', name: 'Traslados a sucursales' }];
});
const activeTask = computed(() => tabs.value.find(task => task.id === tab.value));
const taskLink = (id: string) => ({ path: '/inventory/warehouse', query: { ...route.query, tab: id } });
const pendingTransfers = computed(() => visibleTransfers.value.filter(t => ['IN_TRANSIT','PARTIALLY_RECEIVED'].includes(t.status)).length);
const backToDocument = computed(() => context.value?.kind === 'purchase' && can('purchases.view') ? `/purchases/receipts?id=${context.value.id}` : context.value?.kind === 'request' && can('purchase_requests.view') ? `/purchases/requests?id=${context.value.id}` : null);
const destinationWarehouses = computed(() => catalogs.value.warehouses.filter((w: any) => w.branchId === request.value?.branchId && w.id !== general.value?.id));
const destinationLocations = computed(() => destinationSpaces.value.filter(l => l.isActive && !l.deletedAt));
const planned = computed(() => receipts.value.find(r => r.id === receiptId.value)?.purchaseOrder?.expenses ?? []);
const compatiblePlanned = computed(() => planned.value.filter((p: any) => !expense.expenseTypeId || p.expenseTypeId === expense.expenseTypeId));
const dirty = computed(() => !!dispatchLines.value.length || !!expense.reference || Object.values(placement).some(p => !!p.barcode));
const { leaving, resolveLeave } = useUnsavedChanges(() => dirty.value, () => busy.value);
const money = (n: any) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: receipts.value.find(r => r.id === receiptId.value)?.currency ?? 'USD' }).format(Number(n));
async function run(work: (current: () => boolean) => Promise<void>) {
  if (busy.value) return;
  const company = activeCompanyId.value, path = route.fullPath;
  const current = () => company === activeCompanyId.value && path === route.fullPath;
  busy.value = true; error.value = ''; success.value = '';
  try { await work(current); } catch (e) { if (current()) error.value = getApiErrorMessage(e, 'No se pudo registrar la operación'); } finally { busy.value = false; }
}
async function load() {
  if (!activeCompanyId.value) return;
  const company = activeCompanyId.value, version = ++loadVersion, scope = context.value;
  const current = () => company === activeCompanyId.value && version === loadVersion;
  loading.value = true; loadFailed.value = false; contextNotice.value = '';
  try {
    const [p, r, t, c, pc, rc] = await Promise.all([
      can('purchases.view') ? http.get('/supply/placements', headers()) : Promise.resolve({ data: { data: [] } }),
      can('purchase_requests.view') && (tab.value==='transfers'||scope?.kind==='request') ? http.get('/supply/requests', headers()) : Promise.resolve({ data: { data: [] } }),
      http.get('/supply/transfers', headers()), http.get('/inventory/catalogs', headers()), tab.value==='expenses' && (can('purchase_requests.view') || can('purchase_quotations.view') || can('purchase_orders.view')) ? http.get('/purchase-catalogs', headers()) : Promise.resolve({ data: { data: { expenseTypes: [], generalWarehouse: null } } }),
      can('purchases.view') && (tab.value==='expenses'||scope?.kind==='purchase') ? http.get('/purchases?limit=100', headers()) : Promise.resolve({ data: { data: { items: [] } } }),
    ]);
    if (!current()) return;
    let document: any = null;
    if (scope?.kind === 'purchase' && can('purchases.view')) {
      document = rc.data.data.items.find((item: any) => item.id === scope.id);
      if (!document) { try { document = (await http.get(`/purchases/${scope.id}`, { headers: { 'X-Company-Id': String(company) } })).data.data; } catch { /* The context remains restricted when the document is unavailable. */ } }
    } else if (scope?.kind === 'request' && can('purchase_requests.view')) {
      document = r.data.data.find((item: any) => item.id === scope.id);
      if (!document) { try {
        const record = (await http.get(`/purchase-requests/${scope.id}`, { headers: { 'X-Company-Id': String(company) } })).data.data;
        document = { ...record, details: record.details.map((d: any) => {
          const dispatchedQuantity = d.transferItems.reduce((n: number, i: any) => n + Number(i.quantity), 0);
          const distributedQuantity = d.transferItems.reduce((n: number, i: any) => n + Number(i.receivedQuantity), 0);
          return { ...d, dispatchedQuantity, distributedQuantity, pendingQuantity: Math.max(0, Number(d.quantity) - distributedQuantity) };
        }) };
      } catch { /* Unavailable documents must not expose unrelated requests. */ } }
    }
    if (!current()) return;
    pending.value = p.data.data; requests.value = r.data.data; transfers.value = t.data.data; catalogs.value = c.data.data; purchaseCatalogs.value = pc.data.data; receipts.value = rc.data.data.items;
    contextDocument.value = document;
    if (scope?.kind === 'invalid') contextNotice.value = 'El enlace no identifica un documento válido.';
    else if (scope && !document) contextNotice.value = 'Este documento no está disponible en la empresa actual o no tienes permiso para consultarlo.';
    if (scope?.kind === 'purchase' && document) {
      if (!receipts.value.some(r => r.id === document.id)) receipts.value.push(document);
      receiptId.value = document.id;
    }
    purchaseCatalogs.value.generalWarehouse = c.data.data.generalWarehouse;
    fromWarehouse.value = general.value?.id ?? 0;
    visiblePending.value.forEach(p => { if (!placement[p.id]) placement[p.id] = { barcode: '', locationId: p.recommendedLocationId ?? 0, confirmed: false }; });
    if (scope?.kind === 'request' && document) { selectedRequest.value = scope.id; await chooseRequest(); }
    if (receiptId.value) await loadExpenses();
  } catch (e) { if (current()) { loadFailed.value = true; error.value = getApiErrorMessage(e, 'No se pudo cargar bodega'); } } finally { if (current()) loading.value = false; }
}
// Spaces come already judged by the server for each received line: only the ones that can take it are offered.
const usableSlots = (p: any): any[] => (p.locationOptions ?? []).filter((l: any) => l.compatible);
const blockedSlots = (p: any): any[] => (p.locationOptions ?? []).filter((l: any) => !l.compatible);
const slotNote: Record<string, string> = { free: 'libre', same_product: 'ya tiene este producto', other_product: 'tiene otros productos' };
const slotLabel = (l: any, p?: any) => `${l.code} · ${l.aisle} / ${l.rack} / ${l.level} / ${l.position}${l.compatible ? ` · ${slotNote[l.availability]} · quedan ${l.free}` : ` · ${l.reason}`}${p && l.id === p.recommendedLocationId ? ' (recomendado)' : ''}`;
function place(p: any) { void run(async current => { await http.post(`/supply/placements/${p.id}/confirm`, placement[p.id], headers()); if (!current()) return; delete placement[p.id]; await load(); if (current()) success.value = 'Ubicación física confirmada. El mapa y las existencias ya muestran este producto.'; }); }
function printLabel(p: any) {
  error.value = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try { JsBarcode(svg, p.product.internalCode, { format: 'CODE128', width: 2, height: 60, displayValue: true, margin: 12 }); } catch { error.value = 'El codigo interno no se puede representar en CODE128. Revise el catalogo del producto.'; return; }
  const w = window.open('', '_blank', 'width=650,height=420');
  if (!w) { error.value = 'Permita la ventana de impresion en el navegador.'; return; }
  w.document.title = `Viñeta ${p.product.internalCode}`;
  const title = w.document.createElement('h3'); title.textContent = p.product.name;
  const detail = w.document.createElement('p'); detail.textContent = `${p.product.sku} · ${p.purchase.documentNumber} · ${p.quantity} ${p.unit.name}`;
  w.document.body.append(title, w.document.importNode(svg, true), detail);
  w.document.close(); w.focus(); w.print();
}
const requestOptions = computed(() => visibleRequests.value.map((r: any) => ({ id: r.id, label: r.code, description: r.branch.name })));
function pickRequest(id: number) { selectedRequest.value = id; void chooseRequest(); }
async function chooseRequest() {
  const version = ++stockVersion, company = activeCompanyId.value, requestId = selectedRequest.value, warehouseId = fromWarehouse.value;
  dispatchLines.value = []; dispatchShortages.value = []; toWarehouse.value = 0; stocks.value = []; dispatchId.value = crypto.randomUUID(); stockLoading.value = false;
  if (!canDispatch.value || !warehouseId) return;
  const current = () => version === stockVersion && company === activeCompanyId.value && requestId === selectedRequest.value && warehouseId === fromWarehouse.value;
  stockLoading.value = true;
  try {
    const available: any[] = [];
    for (let page = 1; ; page++) {
      const r = await http.get(`/inventory/stocks?warehouseId=${warehouseId}&limit=100&page=${page}`, { headers: { 'X-Company-Id': String(company) } });
      if (!current()) return;
      available.push(...r.data.data.items.filter((s: any) => Number(s.quantity) > 0));
      if (page >= (r.data.data.totalPages ?? 1)) break;
    }
    stocks.value = available;
    if (destinationWarehouses.value.length === 1) toWarehouse.value = destinationWarehouses.value[0].id;
  }
  catch (e) { if (current()) error.value = getApiErrorMessage(e, 'No se pudieron consultar existencias'); }
  finally { if (current()) stockLoading.value = false; }
}
async function loadDestination() {
  const version = ++destinationVersion, company = activeCompanyId.value, warehouseId = toWarehouse.value;
  destinationSpaces.value = []; destinationLoading.value = false; dispatchShortages.value = [];
  if (!warehouseId) return;
  const current = () => version === destinationVersion && company === activeCompanyId.value && warehouseId === toWarehouse.value;
  destinationLoading.value = true;
  try { const r = await http.get('/inventory/map', { headers: { 'X-Company-Id': String(company) }, params: { warehouseId } }); if (current()) destinationSpaces.value = r.data.data.locations; }
  catch (e) { if (current()) error.value = getApiErrorMessage(e, 'No se pudo revisar la capacidad de destino'); }
  finally { if (current()) destinationLoading.value = false; }
}
function addDispatch(d: any) { dispatchShortages.value = []; dispatchLines.value.push({ lineKey: crypto.randomUUID(), requestDetailId: d.id, productId: d.productId, productName: d.product.name, unitName: d.unit?.name ?? '', fromLocationId: 0, toLocationId: 0, quantity: 0, pending: Math.max(0, Number(d.quantity) - Number(d.dispatchedQuantity)) }); }
function prepareDispatch() {
  if (!canDispatch.value || !toWarehouse.value) return;
  void run(async current => {
    const company = activeCompanyId.value, warehouseId = fromWarehouse.value, destinationId = toWarehouse.value, requestId = selectedRequest.value;
    const available: any[] = [];
    for (let page = 1; ; page++) {
      const r = await http.get('/inventory/stocks', { headers: { 'X-Company-Id': String(company) }, params: { warehouseId, limit: 100, page } });
      if (!current() || requestId !== selectedRequest.value || destinationId !== toWarehouse.value) return;
      available.push(...r.data.data.items.filter((s: any) => Number(s.quantity) > 0));
      if (page >= (r.data.data.totalPages ?? 1)) break;
    }
    const map = await http.get('/inventory/map', { headers: { 'X-Company-Id': String(company) }, params: { warehouseId: destinationId } });
    if (!current() || requestId !== selectedRequest.value || destinationId !== toWarehouse.value) return;
    stocks.value = available; destinationSpaces.value = map.data.data.locations;
    const plan = suggestDispatch(request.value.details, available, destinationSpaces.value);
    dispatchLines.value = plan.lines.map(l => ({ ...l, lineKey: crypto.randomUUID() })); dispatchShortages.value = plan.shortages; dispatchId.value = crypto.randomUUID();
  });
}
function reviewDispatch() {
  error.value = dispatchPlanError(dispatchLines.value, request.value?.details ?? [], stocks.value, destinationSpaces.value);
  if (!error.value) confirmDispatch.value = true;
}
function dispatch() { void run(async current => { await http.post('/supply/transfers', { requestId: dispatchId.value, items: dispatchLines.value.map(({ requestDetailId, fromLocationId, toLocationId, quantity }) => ({ requestDetailId, fromLocationId, toLocationId, quantity })) }, headers()); if (!current()) return; confirmDispatch.value = false; dispatchLines.value = []; dispatchId.value = crypto.randomUUID(); selectedRequest.value = 0; await load(); if (current()) success.value = 'Despacho registrado. Los productos están en tránsito hasta la recepción de la sucursal.'; }); }
async function loadExpenses() {
  const version = ++expenseVersion, company = activeCompanyId.value, id = receiptId.value;
  if (!id) { expenses.value = []; return; }
  const current = () => version === expenseVersion && company === activeCompanyId.value && id === receiptId.value;
  try { const r = await http.get(`/supply/receipts/${id}/expenses`, headers()); if (current()) expenses.value = r.data.data; }
  catch (e) { if (current()) error.value = getApiErrorMessage(e, 'No se pudieron consultar los gastos'); }
}
function saveExpense() { void run(async current => { await http.post(`/supply/receipts/${receiptId.value}/expenses`, { ...expense, plannedExpenseId: expense.plannedExpenseId || undefined }, headers()); if (!current()) return; expense.reference = ''; expense.amount = 0; await loadExpenses(); if (current()) success.value = 'Gasto real registrado. Se incluirá una sola vez en el retaceo si es capitalizable.'; }); }

watch(toWarehouse, () => { dispatchLines.value.forEach(l => l.toLocationId = 0); void loadDestination(); });
watch(receiptId, () => { expense.plannedExpenseId = 0; expenses.value = []; void loadExpenses(); });
watch(() => expense.expenseTypeId, () => { if (expense.plannedExpenseId && !compatiblePlanned.value.some((p: any) => p.id === expense.plannedExpenseId)) expense.plannedExpenseId = 0; });
watch(() => expense.plannedExpenseId, id => { const selected = planned.value.find((p: any) => p.id === id); if (selected) expense.expenseTypeId = selected.expenseTypeId; });
watch([activeCompanyId, () => route.query.purchaseId, () => route.query.requestId, () => route.query.tab], () => {
  loadVersion++; stockVersion++; expenseVersion++; destinationVersion++;
  pending.value = []; requests.value = []; transfers.value = []; receipts.value = []; expenses.value = []; stocks.value = [];
  catalogs.value = { warehouses: [], products: [] }; purchaseCatalogs.value = { expenseTypes: [], generalWarehouse: null };
  dispatchLines.value = []; selectedRequest.value = 0; receiptId.value = 0; fromWarehouse.value = 0; toWarehouse.value = 0;
  destinationSpaces.value = []; dispatchShortages.value = []; destinationLoading.value = false; stockLoading.value = false;
  contextDocument.value = null; contextNotice.value = ''; error.value = ''; success.value = ''; loading.value = false; loadFailed.value = false; confirmDispatch.value = false;
  Object.assign(expense, { expenseTypeId: 0, plannedExpenseId: 0, reference: '', amount: 0, category: 'expense', capitalizable: true });
  Object.keys(placement).forEach(k => delete placement[Number(k)]);
  tab.value = context.value?.kind === 'request' ? 'transfers' : tabs.value.some(t => t.id===route.query.tab) ? String(route.query.tab) : context.value ? tabs.value[0]?.id ?? '' : 'home';
  void load();
}, { immediate: true });
onBeforeUnmount(() => { loadVersion++; stockVersion++; expenseVersion++; destinationVersion++; });
</script>

<template>
  <AdminLayout title="Bodega">
    <OperationsNav />
    <div class="mx-auto space-y-5" :class="tab === 'home' ? 'max-w-5xl' : 'max-w-[1440px]'">
      <p v-if="error" role="alert" class="rounded-[12px] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{{ error }}</p><p v-if="success" role="status" class="flex items-center gap-2 text-sm font-medium text-success"><Check class="h-4 w-4 shrink-0" aria-hidden="true" />{{ success }}</p>
      <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div class="min-w-0">
          <RouterLink v-if="!context && tab!=='home'" to="/inventory/warehouse" class="mb-2 inline-flex items-center gap-2 text-sm text-muted-fg hover:text-fg"><ArrowLeft class="h-4 w-4" aria-hidden="true" />Bodega</RouterLink>
          <h1 class="text-2xl font-semibold tracking-tight">{{ context ? activeTask?.name ?? 'Bodega' : tab==='home' ? 'Bodega' : activeTask?.name }}</h1>
          <p v-if="!context && tab==='home'" class="mt-1 text-sm text-muted-fg">Ubica lo recibido y prepara las entregas a tus sucursales.</p>
          <template v-if="context">
            <p class="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-muted-fg"><span class="text-xs font-medium uppercase tracking-wide">{{ context.kind === 'purchase' ? 'Recepción' : context.kind === 'request' ? 'Solicitud de sucursal' : 'Documento' }}</span><strong class="text-base text-fg">{{ contextDocument?.documentNumber ?? contextDocument?.code ?? (loading ? 'Cargando…' : 'Documento no disponible') }}</strong><span v-if="contextDocument">· {{ context.kind === 'purchase' ? contextDocument.supplier?.name : contextDocument.branch?.name }}</span></p>
            <p v-if="contextNotice" role="status" class="mt-2 text-sm text-muted-fg">{{ contextNotice }}</p>
          </template>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <RouterLink v-if="context && backToDocument" :to="backToDocument" class="font-medium text-accent hover:underline">Volver al documento</RouterLink>
          <RouterLink v-if="context" to="/inventory/warehouse" class="text-muted-fg hover:text-fg">Ver toda la bodega</RouterLink>
          <RouterLink to="/inventory" class="text-muted-fg hover:text-fg">Existencias y mapa</RouterLink>
          <AppButton variant="outline" class="!w-9 !px-0" :disabled="busy || loading" aria-label="Actualizar bodega" title="Actualizar" @click="load"><RefreshCw class="h-4 w-4" aria-hidden="true" /></AppButton>
        </div>
      </header>
      <nav v-if="context && tabs.length>1" aria-label="Tareas de la recepción" class="flex flex-wrap gap-x-6 border-b border-border"><RouterLink v-for="task in tabs" :key="task.id" :to="taskLink(task.id)" :aria-current="tab===task.id?'page':undefined" class="-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors" :class="tab===task.id?'border-accent text-accent':'border-transparent text-muted-fg hover:text-fg'">{{ task.name }}</RouterLink></nav>
      <p v-if="loading" role="status" class="py-8 text-center text-sm text-muted-fg">Cargando bodega…</p>
      <template v-else-if="!contextNotice && !loadFailed">
      <section v-if="tab==='home'" aria-label="Tareas de bodega" class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2">
          <RouterLink v-if="can('purchases.view')" :to="taskLink('placement')" class="group flex min-h-60 flex-col rounded-[12px] border border-border bg-surface p-6 transition-colors hover:border-muted-fg/40 sm:p-8"><span class="grid h-12 w-12 place-items-center rounded-[12px] bg-surface-secondary"><ScanLine class="h-6 w-6" :stroke-width="1.5" /></span><h2 class="mt-6 text-xl font-semibold tracking-tight">Ubicar productos</h2><p class="mt-2 max-w-sm text-sm leading-6 text-muted-fg">Imprime la viñeta y confirma el espacio donde quedó cada producto recibido.</p><span class="mt-6 flex items-center justify-between text-sm font-medium"><span>{{ visiblePending.length ? `${visiblePending.length} pendientes de ubicar` : 'Sin productos pendientes' }}</span><ArrowRight class="h-4 w-4 text-muted-fg transition-transform group-hover:translate-x-1" /></span></RouterLink>
          <RouterLink :to="taskLink('transfers')" class="group flex min-h-60 flex-col rounded-[12px] border border-border bg-surface p-6 transition-colors hover:border-muted-fg/40 sm:p-8"><span class="grid h-12 w-12 place-items-center rounded-[12px] bg-surface-secondary"><Truck class="h-6 w-6" :stroke-width="1.5" /></span><h2 class="mt-6 text-xl font-semibold tracking-tight">Trasladar a sucursales</h2><p class="mt-2 max-w-sm text-sm leading-6 text-muted-fg">Prepara el despacho y confirma lo que recibió cada sucursal.</p><span class="mt-6 flex items-center justify-between text-sm font-medium"><span>{{ pendingTransfers ? `${pendingTransfers} traslados en camino` : 'Ver traslados' }}</span><ArrowRight class="h-4 w-4 text-muted-fg transition-transform group-hover:translate-x-1" /></span></RouterLink>
        </div>
        <RouterLink v-if="can('purchases.view')" :to="taskLink('expenses')" class="flex items-center gap-3 rounded-[12px] border border-border/70 px-5 py-4 text-sm text-muted-fg transition-colors hover:bg-surface"><ReceiptText class="h-5 w-5" :stroke-width="1.5" /><span class="flex-1">Gastos de recepción</span><ArrowRight class="h-4 w-4" /></RouterLink>
      </section>
      <section v-if="tab === 'placement'" class="space-y-4">
        <p v-if="visiblePending.length" class="text-sm text-muted-fg">Coloque la viñeta y confirme dónde dejó cada producto. El mapa se actualiza al confirmar.</p>
        <section v-if="!visiblePending.length" class="flex max-w-3xl items-start gap-4 rounded-[12px] border border-border bg-surface p-5 sm:p-6" :aria-live="'polite'">
          <span v-if="context?.kind === 'purchase' && contextDocument?.status !== 'CANCELLED'" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-success text-success" aria-hidden="true"><Check class="h-5 w-5" /></span>
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-fg">{{ context?.kind === 'purchase' ? contextDocument?.status === 'CANCELLED' ? 'Recepción cancelada' : 'Colocación completada' : 'No hay productos pendientes de ubicación' }}</h2>
            <template v-if="context?.kind === 'purchase' && contextDocument?.status !== 'CANCELLED'"><p class="mt-1.5 text-sm text-fg">Los productos de esta recepción ya tienen ubicación confirmada.</p><p class="mt-1 text-sm text-muted-fg">El mapa y las existencias ya muestran este producto.</p></template>
            <RouterLink v-if="backToDocument" :to="backToDocument" class="mt-4 inline-flex h-10 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 dark:bg-[#c92a2d] dark:text-white dark:hover:bg-[#df3639]">Continuar con la recepción</RouterLink>
          </div>
        </section>
        <div v-else class="overflow-hidden rounded-[12px] border border-border bg-surface">
          <div class="hidden grid-cols-[2.5rem_minmax(0,1fr)_12rem_10rem] gap-x-3 border-b border-border px-3 py-2.5 text-sm text-muted-fg sm:grid" aria-hidden="true"><span /><span>Producto</span><span>Cantidad</span><span>Estado</span></div>
          <article v-for="p in visiblePending" :key="p.id" class="border-b border-border last:border-b-0">
            <div class="grid w-full cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 px-3 py-3 text-left transition-colors hover:bg-surface-secondary sm:grid-cols-[2.5rem_minmax(0,1fr)_12rem_10rem]" @click="togglePlacement(p.id)">
              <button type="button" :aria-expanded="isPlacementOpen(p.id)" :aria-controls="'placement-' + p.id" :aria-label="(isPlacementOpen(p.id) ? 'Ocultar' : 'Mostrar') + ' la colocación de ' + p.product.name" class="mx-auto grid h-8 w-8 place-items-center rounded-lg text-muted-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" @click.stop="togglePlacement(p.id)"><ChevronDown class="h-5 w-5 transition-transform" :class="isPlacementOpen(p.id) ? 'rotate-180' : ''" aria-hidden="true" /></button>
              <div class="min-w-0"><h2 class="font-semibold">{{ p.product.name }}<span class="sm:hidden"> · {{ p.quantity }} {{ p.unit.name }}</span></h2><p class="flex items-center gap-1.5 text-sm text-muted-fg"><span>Código interno {{ p.product.internalCode }}</span><button type="button" class="grid h-7 w-7 place-items-center rounded-md text-muted-fg transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" :aria-label="'Copiar el código interno ' + p.product.internalCode" title="Copiar código" @click.stop="copyInternalCode(p)"><Check v-if="copiedCode === p.id" class="h-4 w-4 text-success" aria-hidden="true" /><Copy v-else class="h-4 w-4" aria-hidden="true" /></button><span class="sr-only" role="status" aria-live="polite">{{ copiedCode === p.id ? 'Código copiado' : '' }}</span></p></div>
              <span class="hidden text-sm sm:block">{{ p.quantity }} {{ p.unit.name }}</span>
              <span class="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-fg max-sm:col-start-2 sm:mt-0"><span class="h-2 w-2 rounded-full bg-muted-fg/60" aria-hidden="true" />Por confirmar</span>
            </div>
            <div v-show="isPlacementOpen(p.id)" :id="'placement-' + p.id" class="border-t border-border bg-surface-secondary/50 px-5 py-4 sm:pl-[3.75rem]">
              <div v-if="(p.locationOptions ?? []).length && !usableSlots(p).length" role="alert" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-warning/40 bg-warning/10 p-4 text-sm text-fg"><p class="flex min-w-0 flex-1 basis-80 items-start gap-3"><TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" /><span>Ningún espacio de este almacén puede recibir este producto ahora: {{ blockedSlots(p).length === 1 ? 'el único espacio está ocupado con otra unidad o sin capacidad' : 'los ' + blockedSlots(p).length + ' espacios están ocupados con otra unidad o sin capacidad' }}. Registre un espacio nuevo o libere uno.</span></p><RouterLink to="/organization/locations" class="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-surface px-4 font-medium transition-colors hover:bg-surface-secondary">Administrar espacios</RouterLink></div>
              <div v-if="!(p.locationOptions ?? []).length" role="alert" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-warning/40 bg-warning/10 p-4 text-sm text-fg"><p class="flex min-w-0 flex-1 basis-80 items-start gap-3"><TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" /><span>Este almacén aún no tiene espacios definidos.</span></p><RouterLink to="/organization/locations" class="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-surface px-4 font-medium transition-colors hover:bg-surface-secondary">Registrar los espacios físicos</RouterLink></div>
              <div class="flex flex-wrap items-start justify-between gap-3"><p class="text-sm text-muted-fg">{{ p.purchase.documentNumber }} · {{ p.purchase.warehouse?.name }}</p><AppButton variant="outline" @click="printLabel(p)"><Printer class="h-4 w-4" aria-hidden="true" />Imprimir viñeta de código de barras</AppButton></div>
              <form v-if="can('inventory.adjust')" class="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2" @submit.prevent="place(p)"><label class="text-sm font-medium">Leer código de barras colocado<input v-model="placement[p.id]!.barcode" required autocomplete="off" class="field-control !h-9 font-normal" /></label><label class="text-sm font-medium">Ubicación física<select v-model.number="placement[p.id]!.locationId" required class="field-control !h-9 font-normal"><option :value="0" disabled>Seleccione espacio</option><optgroup v-if="usableSlots(p).length" label="Espacios disponibles"><option v-for="l in usableSlots(p)" :key="l.id" :value="l.id">{{ slotLabel(l, p) }}</option></optgroup><optgroup v-if="blockedSlots(p).length" label="No disponibles para este producto"><option v-for="l in blockedSlots(p)" :key="l.id" :value="l.id" disabled>{{ slotLabel(l) }}</option></optgroup></select></label><label class="flex items-center gap-2 text-sm sm:col-span-1"><input v-model="placement[p.id]!.confirmed" type="checkbox" required class="h-4 w-4 accent-accent" /> Confirmo que coloqué la viñeta y dejé los productos en este espacio.</label><div class="flex justify-end"><AppButton type="submit" :disabled="busy || !placement[p.id]!.locationId">Confirmar colocación</AppButton></div></form>
              <p v-if="p.recommendedLocationId" class="mt-3 text-xs text-muted-fg">El espacio recomendado no se considera ocupado por estos productos hasta que confirme su colocación.</p>
            </div>
          </article>
        </div>
      </section>
      <template v-if="tab === 'transfers'">
        <section v-if="can('purchase_requests.view')" class="rounded-[12px] border border-border bg-surface p-5 sm:p-6"><h2 class="text-xl font-semibold tracking-tight text-fg">{{ context?.kind === 'request' ? 'Entrega de la solicitud' : 'Despachar desde el centro general' }}</h2><div v-if="!context || canDispatch" class="mb-4 mt-5 grid gap-4 sm:grid-cols-2"><SearchableSelect v-if="!context" :model-value="selectedRequest" :options="requestOptions" label="Solicitud original" placeholder="Seleccione solicitud" search-label="Buscar por código o sucursal" :disabled="busy" @select="pickRequest" /><label v-if="canDispatch" class="text-sm font-medium text-fg">Almacén de la sucursal destino<select v-model.number="toWarehouse" :disabled="busy" class="field-control"><option :value="0" disabled>Seleccione destino</option><option v-for="w in destinationWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select></label></div>
          <div v-if="canDispatch && can('inventory.adjust')" class="my-4 flex flex-wrap items-center gap-3"><AppButton variant="outline" :disabled="busy || loading || stockLoading || destinationLoading || !toWarehouse || !!dispatchLines.length" @click="prepareDispatch"><Package class="h-4 w-4" aria-hidden="true" />Preparar con existencias disponibles</AppButton><span class="text-sm text-muted-fg">{{ stockLoading || destinationLoading ? 'Revisando existencias y espacios…' : dispatchLines.length ? 'Revisa y ajusta el despacho antes de confirmar.' : !toWarehouse ? 'Selecciona el almacén destino.' : 'Sugiere cantidades y espacios; tú confirmas el despacho.' }}</span></div>
          <p v-if="request && !canDispatch" class="my-4 text-sm text-muted-fg">{{ request.status === 'fulfilled' ? 'La sucursal recibió todos los productos solicitados.' : ['draft', 'rejected', 'cancelled'].includes(request.status) ? 'Esta solicitud todavía no está disponible para distribución.' : 'Todo lo solicitado ya fue despachado. Revisa abajo la recepción de la sucursal.' }}</p>
          <div v-if="request" class="overflow-x-auto rounded-[12px]"><table class="w-full min-w-[650px] text-left text-sm"><caption class="sr-only">Productos de la solicitud con lo despachado, entregado y pendiente</caption><thead class="bg-surface-secondary text-muted-fg"><tr><th scope="col" class="px-4 py-3 font-medium">Producto</th><th scope="col" class="px-3 py-3 font-medium">Solicitado</th><th scope="col" class="px-3 py-3 font-medium">Despachado</th><th scope="col" class="px-3 py-3 font-medium">Entregado</th><th scope="col" class="px-3 py-3 font-medium">Pendiente de entregar</th><th scope="col" class="px-4 py-3"><span class="sr-only">Acciones</span></th></tr></thead><tbody class="divide-y divide-border border-b border-border"><tr v-for="d in request.details" :key="d.id"><th scope="row" class="px-4 py-3 text-left font-normal text-fg">{{ d.product.name }}</th><td class="px-3 py-3">{{ d.quantity }} {{ d.unit?.name }}</td><td class="px-3 py-3 tabular-nums">{{ d.dispatchedQuantity }}</td><td class="px-3 py-3 tabular-nums">{{ d.distributedQuantity }}</td><td class="px-3 py-3 tabular-nums">{{ d.pendingQuantity }}</td><td class="px-4 py-2.5 text-right"><AppButton v-if="canDispatch && can('inventory.adjust')" variant="outline" :disabled="busy || Number(d.dispatchedQuantity) >= Number(d.quantity)" @click="addDispatch(d)"><Plus class="h-4 w-4" aria-hidden="true" />Agregar al traslado</AppButton></td></tr></tbody></table></div>
          <form v-if="dispatchLines.length" @submit.prevent="reviewDispatch"><p class="mt-4 text-xs text-muted-fg">El destino es una propuesta. La sucursal confirma dónde colocó los productos al recibirlos.</p><div v-for="(l,i) in dispatchLines" :key="l.lineKey" class="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3"><strong class="sm:col-span-3">{{ l.productName }} · Por despachar: {{ l.pending }} {{ l.unitName }}</strong><label>Espacio origen<select v-model.number="l.fromLocationId" :disabled="busy" required class="field-control"><option :value="0" disabled>Seleccione existencia</option><option v-for="s in stocks.filter((s: any) => s.product.id === l.productId)" :key="s.id" :value="s.location.id">{{ s.location.code }} · Disponible {{ s.quantity }}</option></select></label><label>Espacio previsto en destino<select v-model.number="l.toLocationId" :disabled="busy || destinationLoading" required class="field-control"><option :value="0" disabled>Seleccione</option><option v-for="loc in destinationLocations" :key="loc.id" :value="loc.id">{{ loc.code }}</option></select></label><label>Cantidad a despachar<input v-model.number="l.quantity" :disabled="busy" type="number" min="1" :max="l.pending" step="1" required class="field-control" /></label><button type="button" :disabled="busy" class="text-left text-danger" @click="dispatchLines.splice(i,1); dispatchShortages = []">Quitar</button></div><AppButton v-if="can('inventory.adjust')" type="submit" class="mt-5" :disabled="busy || stockLoading || destinationLoading || !toWarehouse">Revisar despacho</AppButton><AppButton variant="outline" class="ml-3 mt-5" :disabled="busy" @click="dispatchLines = []; dispatchShortages = []">Limpiar propuesta</AppButton></form>
          <details v-if="dispatchShortages.length" class="mt-4 rounded-lg bg-surface-secondary p-4 text-sm"><summary class="cursor-pointer font-medium">{{ dispatchShortages.length === 1 ? 'Un producto requiere atención' : `${dispatchShortages.length} productos requieren atención` }}</summary><p v-for="s in dispatchShortages" :key="s.requestDetailId" class="mt-2 text-muted-fg">{{ s.productName }}: quedaron fuera de la propuesta {{ s.quantity }} {{ s.unitName }}. {{ s.reason === 'stock' ? 'Faltan existencias confirmadas en el centro general.' : s.reason === 'space' ? 'Falta espacio compatible en la sucursal destino.' : 'Faltan existencias y espacio compatible.' }}</p></details>
        </section>
        <section class="mt-5 rounded-[12px] border border-border bg-surface p-5 sm:p-6"><h2 class="text-xl font-semibold tracking-tight text-fg">Despachos y recepciones de sucursales</h2>
          <div v-if="visibleTransfers.length" class="mt-5 overflow-x-auto rounded-[12px]">
            <table class="w-full min-w-[820px] text-left text-sm">
              <caption class="sr-only">Traslados a sucursales con lo despachado, entregado y en tránsito</caption>
              <thead class="bg-surface-secondary text-muted-fg"><tr><th scope="col" class="whitespace-nowrap px-4 py-3 font-medium">Traslado</th><th scope="col" class="px-3 py-3 font-medium">Producto y solicitud</th><th v-if="!context" scope="col" class="px-3 py-3 font-medium">Centro</th><th scope="col" class="whitespace-nowrap px-3 py-3 text-center font-medium">Despachado</th><th scope="col" class="whitespace-nowrap px-3 py-3 text-center font-medium">Entregado</th><th scope="col" class="whitespace-nowrap px-3 py-3 text-center font-medium">En tránsito</th><th scope="col" class="px-4 py-3 font-medium">Estado</th></tr></thead>
              <tbody class="divide-y divide-border border-b border-border">
                <template v-for="t in visibleTransfers" :key="t.id">
                  <tr v-for="(i, index) in t.items" :key="i.id">
                    <th scope="row" class="whitespace-nowrap px-4 py-3.5 text-left align-top font-semibold text-fg">{{ index === 0 ? t.documentNumber : '' }}</th>
                    <td class="px-3 py-3.5 align-top"><p class="text-fg">{{ i.product.name }}</p><p v-if="i.requestDetail?.request.code" class="mt-0.5 text-muted-fg">{{ i.requestDetail.request.code }}</p></td>
                    <td v-if="!context" class="px-3 py-3.5 align-top text-fg">{{ i.requestDetail?.request.branch.name }}</td>
                    <td class="px-3 py-3.5 text-center align-top tabular-nums">{{ Number(i.quantity) }}</td>
                    <td class="px-3 py-3.5 text-center align-top tabular-nums">{{ Number(i.receivedQuantity) }}</td>
                    <td class="px-3 py-3.5 text-center align-top tabular-nums">{{ Math.max(0, Number(i.quantity) - Number(i.receivedQuantity)) }}</td>
                    <td class="px-4 py-3.5 align-top"><template v-if="index === 0"><span class="inline-flex items-center gap-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="t.status === 'COMPLETED' ? 'bg-success' : t.status === 'CANCELLED' ? 'bg-danger' : t.status === 'PARTIALLY_RECEIVED' ? 'bg-warning' : 'bg-accent'" aria-hidden="true" />{{ transferStateLabel(t.status) }}</span><RouterLink v-if="['IN_TRANSIT','PARTIALLY_RECEIVED'].includes(t.status) && t.items.some((x: any) => Number(x.quantity) > Number(x.receivedQuantity)) && t.items[0]?.requestDetail?.request?.id && can('purchase_requests.view')" :to="{ path: '/purchases/requests/' + t.items[0].requestDetail.request.id }" class="mt-1 block text-sm font-medium text-accent hover:underline">La sucursal lo recibe en su solicitud</RouterLink></template></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <p v-else class="mt-4 text-sm text-muted-fg">{{ context?.kind === 'request' ? 'Esta solicitud todavía no tiene traslados registrados.' : 'No hay traslados registrados.' }}</p></section>
      </template>
      <section v-if="tab === 'expenses'" class="rounded-[12px] border border-border bg-surface p-5">
        <h2 class="text-xl font-semibold">Gastos reales de la recepción</h2>
        <p class="mt-2 text-sm text-muted-fg">Registra lo pagado realmente. Los gastos que incluyas en el costo se distribuyen una sola vez en el retaceo.</p>
        <label v-if="!context" class="mt-4 block text-sm font-medium">Recepción<select v-model.number="receiptId" class="field-control !h-9 max-w-lg font-normal" :disabled="busy"><option :value="0" disabled>Seleccione</option><option v-for="r in visibleReceipts" :key="r.id" :value="r.id">{{ r.documentNumber }} · {{ r.supplier.name }} · {{ receiptStateLabel(r.status) }}</option></select></label>
        <p v-if="receiptId && !canRecordExpense" class="my-4 rounded-[12px] border border-border p-4 text-sm text-muted-fg">{{ selectedReceipt?.status === 'CANCELLED' ? 'La recepción está cancelada.' : selectedReceipt?.retaceoArchived ? 'Recupera el retaceo para continuar con este documento.' : 'Los costos de esta recepción ya están fijados. Puedes consultar los gastos registrados.' }}</p>
        <p v-if="selectedReceipt?.retaceoArchived" class="my-4 text-sm text-muted-fg"><RouterLink v-if="can('trash.view')" to="/administration/trash" class="font-medium text-accent">Abrir papelera</RouterLink></p>
        <form v-if="canRecordExpense && can('purchase_expenses.create')" class="mt-5 grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3" @submit.prevent="saveExpense"><label class="text-sm font-medium">Tipo de gasto<select v-model.number="expense.expenseTypeId" required class="field-control !h-9 font-normal"><option :value="0" disabled>Seleccione</option><option v-for="e in purchaseCatalogs.expenseTypes" :key="e.id" :value="e.id">{{ e.name }}</option></select></label><label class="text-sm font-medium">Gasto previsto relacionado<select v-model.number="expense.plannedExpenseId" class="field-control !h-9 font-normal"><option :value="0">Sin gasto previsto</option><option v-for="p in compatiblePlanned" :key="p.id" :value="p.id">{{ p.expenseType.name }} · {{ money(p.amount) }}</option></select></label><label class="text-sm font-medium">Referencia del comprobante<input v-model="expense.reference" required maxlength="100" class="field-control !h-9 font-normal" /></label><label class="text-sm font-medium">Monto real<input v-model.number="expense.amount" type="number" min="0.01" step="0.01" required class="field-control !h-9 font-normal tabular-nums" /></label><label class="text-sm font-medium">Rubro del retaceo<select v-model="expense.category" class="field-control !h-9 font-normal"><option value="expense">Gasto</option><option value="freight">Flete</option><option value="dai">DAI</option></select></label><label class="flex items-center gap-2 self-end pb-2 text-sm"><input v-model="expense.capitalizable" type="checkbox" class="h-4 w-4 accent-accent" /> Incluir en costo de los productos recibidos</label><div class="flex justify-end sm:col-span-2 lg:col-span-3"><AppButton type="submit" :disabled="busy || !expense.expenseTypeId">Registrar gasto real</AppButton></div></form>
        <div v-if="receiptId" class="mt-6 border-t border-border pt-5">
          <h3 v-if="expenses.length" class="mb-3 text-base font-semibold text-fg">Gastos registrados</h3>
          <div v-if="expenses.length" class="overflow-x-auto rounded-[12px] border border-border"><table class="w-full min-w-[640px] text-left text-sm"><thead class="border-b border-border bg-surface-secondary text-sm text-muted-fg"><tr><th class="px-4 py-2.5 font-medium">Referencia</th><th class="px-4 py-2.5 font-medium">Tipo</th><th class="px-4 py-2.5 font-medium">Previsto</th><th class="px-4 py-2.5 text-right font-medium">Real</th><th class="px-4 py-2.5 font-medium">Retaceo</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="e in expenses" :key="e.id"><td class="px-4 py-3">{{ e.reference }}</td><td class="px-4 py-3">{{ e.expenseType.name }}</td><td class="px-4 py-3 text-muted-fg">{{ e.plannedExpense ? money(e.plannedExpense.amount) : 'Sin estimación' }}</td><td class="px-4 py-3 text-right font-medium tabular-nums">{{ money(e.amount) }}</td><td class="px-4 py-3"><span class="inline-flex items-center gap-2"><span class="h-2 w-2 shrink-0 rounded-full" :class="!e.capitalizable ? 'bg-muted-fg/60' : e.allocations.length ? 'bg-success' : 'bg-warning'" aria-hidden="true" />{{ !e.capitalizable ? 'Excluido del costo' : e.allocations.length ? 'Incluido una vez' : 'Pendiente de retaceo' }}</span></td></tr></tbody></table></div>
          <div class="flex flex-wrap items-center justify-between gap-3" :class="expenses.length ? 'mt-4' : ''"><p v-if="!expenses.length" class="text-sm text-muted-fg">Esta recepción no tiene gastos reales registrados.</p><span v-else />
            <RouterLink v-if="can('retaceos.view') && selectedReceipt?.status !== 'CANCELLED' && !selectedReceipt?.retaceoArchived" :to="`/purchases/retaceos?purchaseId=${receiptId}`" class="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary">{{ canRecordExpense ? 'Continuar al retaceo' : 'Ver retaceo' }}</RouterLink></div>
        </div>
      </section>

      </template>
    </div>
    <PurchaseActionDialog v-if="confirmDispatch" title="Confirmar despacho" description="Los productos saldrán del centro general y quedarán en tránsito, vinculados a la solicitud original." :busy="busy" :error="error" @close="confirmDispatch = false" @confirm="dispatch" />
    <PurchaseActionDialog v-if="leaving" title="Descartar cambios" description="Hay datos sin guardar en bodega." :busy="false" @close="resolveLeave(false)" @confirm="resolveLeave(true)" />
  </AdminLayout>
</template>
