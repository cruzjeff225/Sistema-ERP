<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Building2, CalendarDays, ChevronDown, Download, Info, Pencil, ChevronLeft, ChevronRight, Search, Tag, Trash2, ArrowRight, Check } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import PurchaseTabs from '../components/purchases/PurchaseTabs.vue';
import TrashButton from '../components/admin/TrashButton.vue';
import AppButton from '../components/base/AppButton.vue';
import TrackingLink from '../components/purchases/TrackingLink.vue';
import QuotationComparison from './QuotationComparisonView.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { isCurrentPurchaseWeek } from '../utils/purchase-inbox';
import { filterQuotationProcesses, quotationProcessDay } from '../utils/quotation-process-inbox';
import { getApiErrorMessage } from '../utils/api-error';
import { documentStatusLabel, documentStatusVariant, statusDotClass } from '../utils/purchase-tracking';
import { purchasePurposeLabel } from '../utils/purchase-workflow';
import { useUnsavedChanges } from '../composables/useUnsavedChanges';
import { quotationExpenseCapabilities, quotationExpenseUpdate, type QuotationOfferExpense } from '../utils/quotation-offer-expenses';

const { can } = usePermissions();
const route = useRoute();
const router = useRouter();
let loadVersion = 0, openVersion = 0, companyEpoch = 0, mounted = true;
type MutationScope = { companyId: number; epoch: number };
const validScope = (scope: MutationScope) => mounted && scope.epoch === companyEpoch && scope.companyId === activeCompanyId.value;
let awardReference: { payload: string; id: string } | null = null;
const requests = ref<any[]>([]), documents = ref<any[]>([]), current = ref<any>(null);
const catalogs = ref<any>({ products: [], suppliers: [], branches: [], expenseTypes: [] });
const error = ref(''), success = ref(''), busy = ref(false), loading = ref(false), opening = ref(false);
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
const from = ref(''), to = ref(date()), selectedRequests = ref<number[]>([]);
const selectedId = ref(0), supplierId = ref(0), rfqLineIds = ref<number[]>([]);
// Purchasing decides the quantities on its own while no provider has been consulted.
const canAdjustProposal = computed(() => !!current.value && !current.value.rfqs.length && !current.value.orders.length && can('purchase_quotations.update'));
const lineEdit = reactive({ productId: 0, purchaseQuantity: 0, reason: '' });
const offer = ref<any>(null), offerForm = reactive({ quotationDate: date(), validUntil: date(), currency: 'USD', paymentTerms: '', deliveryDays: 0, costsConfirmed:false,conditionsConfirmed:false,exchangeRateToUsd:undefined as number|undefined,exchangeRateDate:'',providerConfirmation:'',details: [] as any[], expenses: [] as QuotationOfferExpense[] });
const offerQuantityChanged = computed(() => !!offer.value && offerForm.details.some(detail => {
  const consulted = offer.value.lines.find((row: any) => row.line.productId === detail.productId && row.line.unitId === detail.unitId);
  return consulted && Number(consulted.quantity) !== Number(detail.quantity);
}));
const originalOfferExpenses = computed<QuotationOfferExpense[]>(() => offer.value?.quotation?.expenses ?? []);
const expensePermissions = computed(() => ({ create: can('purchase_expenses.create'), update: can('purchase_expenses.update') }));
const offerExpenseCapabilities = computed(() => quotationExpenseCapabilities(originalOfferExpenses.value.length, expensePermissions.value));
const offerExpenseTotal = computed(() => offerForm.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
const offerExpenseTypes = computed<any[]>(() => [...new Map([...catalogs.value.expenseTypes, ...(offer.value?.quotation?.expenses ?? []).map((expense: any) => expense.expenseType).filter(Boolean)].map((type: any) => [type.id, type])).values()]);
const offerMoney = (amount: number) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: /^[A-Z]{3}$/.test(offerForm.currency) ? offerForm.currency : 'USD' }).format(amount);
const awards = reactive<Record<number, { quoteDetailId: number; quantity: number }>>({});
const branchId = ref(0), warehouseId = ref(0), confirm = ref(false);
const documentTab = ref<'week' | 'all'>('week');
const contextUnavailable = ref(false);
const documentSearch = ref(''), historyFrom = ref(''), historyTo = ref('');
const documentIsRecent = (d: any) => isCurrentPurchaseWeek(`${quotationProcessDay(d)}T12:00:00-06:00`);
const visibleDocuments = computed(() => filterQuotationProcesses(documents.value, { period: documentTab.value, search: documentSearch.value, from: historyFrom.value, to: historyTo.value }));
const activeFilterCount = computed(() => Number(!!documentSearch.value.trim()) + (documentTab.value === 'all' ? Number(!!historyFrom.value) + Number(!!historyTo.value) : 0));
const workspace = ref<'products' | 'suppliers' | 'compare' | 'orders'>('products');
const workspaceTabs = computed(() => [
  { value: 'products', label: 'Productos', count: current.value?.lines.length ?? 0 },
  { value: 'suppliers', label: 'Proveedores', count: current.value?.rfqs.length ?? 0 },
  ...(receivedQuotes.value.length || workspace.value === 'compare' ? [{ value: 'compare', label: 'Comparar', count: receivedQuotes.value.length }] : []),
  ...(current.value?.orders.length ? [{ value: 'orders', label: 'Órdenes', count: current.value.orders.length }] : []),
]);
const showNew = ref(false), editingProduct = ref(false), addingSupplier = ref(false);
let initialProduct = '', initialOffer = '';
const changed = computed(() => (!!offer.value && JSON.stringify(offerForm) !== initialOffer) || (editingProduct.value && JSON.stringify(lineEdit) !== initialProduct) || selectedRequests.value.length > 0 || Object.values(awards).some(a => a.quoteDetailId > 0));
const { leaving, resolveLeave } = useUnsavedChanges(() => changed.value, () => busy.value);
const discardChanges = ref(false);
let pendingChange: (() => void) | undefined;
const requestAgeTab = ref<'recent' | 'older'>('recent');
const allEligible = computed(() => requests.value.filter(r => r.details.every((d: any) => d.eligible) && (!from.value || localDate(r.requestDate) >= from.value) && (!to.value || localDate(r.requestDate) <= to.value)));
const eligible = computed(() => allEligible.value.filter(r => requestAgeTab.value === 'older' || isCurrentPurchaseWeek(r.requestDate)));
// Request picker: search and filters narrow the list, pages keep it short; the selection survives them.
const PAGE_SIZE = 5;
const requestSearch = ref(''), requestBranch = ref(0), requestPurpose = ref(''), requestPage = ref(1);
const branchOptions = computed(() => [...new Map(eligible.value.map(r => [r.branch.id, r.branch.name])).entries()].map(([id, name]) => ({ id, name })));
const purposeOptions = computed(() => [...new Set(eligible.value.map(r => r.purpose).filter(Boolean))].map(value => ({ value, label: purchasePurposeLabel(value) })));
const pickerRequests = computed(() => {
  const term = requestSearch.value.trim().toLowerCase();
  return eligible.value.filter(r => (!requestBranch.value || r.branch.id === requestBranch.value) && (!requestPurpose.value || r.purpose === requestPurpose.value)
    && (!term || [r.code, r.branch.name, r.justification].some(text => String(text ?? '').toLowerCase().includes(term))));
});
const pickerPages = computed(() => Math.max(1, Math.ceil(pickerRequests.value.length / PAGE_SIZE)));
const pickerPage = computed(() => pickerRequests.value.slice((requestPage.value - 1) * PAGE_SIZE, requestPage.value * PAGE_SIZE));
const pageAllSelected = computed(() => pickerPage.value.length > 0 && pickerPage.value.every(r => selectedRequests.value.includes(r.id)));
function togglePage() {
  const ids = pickerPage.value.map(r => r.id);
  selectedRequests.value = pageAllSelected.value ? selectedRequests.value.filter(id => !ids.includes(id)) : [...new Set([...selectedRequests.value, ...ids])];
}
watch([requestSearch, requestBranch, requestPurpose, requestAgeTab, from, to], () => { requestPage.value = 1; });
watch(pickerPages, pages => { if (requestPage.value > pages) requestPage.value = pages; });
const chosenRequests = computed(() => requests.value.filter(r => selectedRequests.value.includes(r.id)));
const chosenSummary = computed(() => ({
  requests: chosenRequests.value.length,
  products: chosenRequests.value.reduce((sum, r) => sum + r.details.length, 0),
  branches: new Set(chosenRequests.value.map(r => r.branch.id)).size,
  purposes: new Set(chosenRequests.value.map(r => r.purpose).filter(Boolean)).size,
}));
const pickerDate = (value: string) => new Date(value).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });
// The four steps of the process; the picker is the first one and the open management moves through the rest.
const processSteps = [
  { title: 'Seleccionar solicitudes', hint: 'Elija una o varias solicitudes para cotizar' },
  { title: 'Revisar productos', hint: 'Verifique los productos e insumos' },
  { title: 'Seleccionar proveedores', hint: 'Envíe la solicitud de cotización' },
  { title: 'Seguimiento', hint: 'Revise las respuestas y genere la orden de compra' },
];
// Step 2 (review the products) is part of opening the management, so the indicator follows what comes next.
const processStepIndex = computed(() => offer.value ? 3 : showNew.value || !current.value ? 1 : ({ suppliers: 3, offer: 3, compare: 4, orders: 4 } as Record<string, number>)[nextStep.value.action] ?? 3);
const quotes = computed(() => current.value?.rfqs.filter((r: any) => r.quotation) ?? []);
const receivedQuotes = computed(() => quotes.value.filter((r: any) => ['received', 'under_review', 'selected'].includes(r.quotation.status)));
const availableSuppliers = computed(() => catalogs.value.suppliers.filter((supplier: any) => !current.value?.rfqs.some((rfq: any) => rfq.supplierId === supplier.id)));
const activeOrders = computed(() => current.value?.orders.filter((order: any) => !['cancelled', 'rejected'].includes(order.status)) ?? []);
const pendingResponses = computed<any[]>(() => current.value?.rfqs.filter((rfq: any) => !rfq.quotation || rfq.quotation.status === 'draft') ?? []);
const pendingResponse = computed(() => pendingResponses.value[0]);
// With several providers waiting, the screen cannot guess whose offer is being registered: the user picks it from the list.
const severalPending = computed(() => pendingResponses.value.length > 1);
const remainingProducts = computed(() => current.value?.lines.filter((line: any) => Number(line.purchaseQuantity) > Number(line.purchasedQuantity ?? 0)).length ?? 0);
const nextStep = computed(() => {
  if (activeOrders.value.length && !remainingProducts.value) return { title: 'Continuar con las órdenes', description: 'Los productos ya fueron asignados. Abra las órdenes para continuar con la aprobación y recepción.', action: 'orders' };
  if (receivedQuotes.value.length) return { title: 'Elegir la compra', description: `${receivedQuotes.value.length} ${receivedQuotes.value.length === 1 ? 'oferta recibida' : 'ofertas recibidas'}. Compare el costo y elija un proveedor o combine productos.`, action: 'compare' };
  if (pendingResponse.value) return severalPending.value
    ? { title: 'Registrar las respuestas de los proveedores', description: `${pendingResponses.value.length} proveedores esperan su oferta. Elija de cuál va a registrar la respuesta.`, action: 'offer' }
    : { title: 'Registrar la respuesta del proveedor', description: `Descargue el PDF para solicitar precios y registre la oferta de ${pendingResponse.value.supplier?.name ?? 'el proveedor'} cuando la reciba.`, action: 'offer' };
  return { title: 'Consultar proveedores', description: 'Revise los productos, ajuste las cantidades si lo necesita y seleccione un proveedor y los productos que desea cotizar.', action: 'suppliers' };
});
const canRegisterResponse = (rfq: any) => !!rfq && (!rfq.quotation ? can('purchase_quotations.create') : ['draft', 'received', 'selected', 'under_review'].includes(rfq.quotation.status) && !rfq.quotation.orders.some((order: any) => !['cancelled', 'rejected'].includes(order.status)) && can('purchase_quotations.update'));
const orderStatusLabel = (status: string) => ({ draft: 'Borrador', pending_approval: 'Pendiente de Gerencia', returned: 'Devuelta con observaciones', approved: 'Aprobada', sent: 'Enviada al proveedor', partially_received: 'Recepción parcial', received: 'Recibida', rejected: 'Rechazada', cancelled: 'Cancelada' } as Record<string, string>)[status] ?? status;
const localDate = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date(value));
const shortDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
const switching = ref(false);
watch(selectedId, () => { switching.value = false; });
// The requests this management gathers, so the line above says what it is about without opening anything.
// How each consulted supplier is doing: waiting, offer to complete, offer registered or closed.
const rfqState = (r: any) => !r.quotation ? { label: 'Esperando oferta', dot: 'bg-muted-fg/60' } : r.quotation.status === 'draft' ? { label: 'Oferta por completar', dot: 'bg-warning' } : ['received', 'selected', 'under_review'].includes(r.quotation.status) ? { label: 'Oferta registrada', dot: 'bg-success' } : { label: 'Oferta cerrada', dot: 'bg-muted-fg/60' };
const originCodes = computed<string[]>(() => [...new Set<string>((current.value?.lines ?? []).flatMap((line: any) => (line.sources ?? []).map((source: any) => source.requestDetail?.request?.code)).filter(Boolean))]);
const processLabel = (d: any) => `Gestión #${d.id} · ${shortDate(d.dateFrom)}${d.dateFrom.slice(0, 10) === d.dateTo.slice(0, 10) ? '' : ' – ' + shortDate(d.dateTo)}`;
const headers = (company = activeCompanyId.value) => ({ headers: { 'X-Company-Id': String(company) } });
function clearFilters() { documentSearch.value = ''; historyFrom.value = ''; historyTo.value = ''; }
async function afterAward() { if (!selectedId.value) return; await open(selectedId.value); await load(); workspace.value = 'orders'; }
function resetEditing() { awardReference = null; offer.value = null; editingProduct.value = false; addingSupplier.value = false; selectedRequests.value = []; lineEdit.reason = ''; Object.keys(awards).forEach(k => delete awards[Number(k)]); }
function change(work: () => void) {
  if (busy.value || opening.value || loading.value) return;
  if (changed.value) { pendingChange = work; discardChanges.value = true; return; }
  resetEditing(); work();
}
function resolveDiscard(allow: boolean) {
  if (leaving.value) { if (allow) resetEditing(); resolveLeave(allow); return; }
  const work = pendingChange; pendingChange = undefined; discardChanges.value = false;
  if (allow) { resetEditing(); work?.(); }
}
function selectDocument(id: number) { if (!id || id === selectedId.value && !showNew.value) return; change(() => { void open(id); }); }
function selectDocumentFromEvent(event: Event) { const select = event.target as HTMLSelectElement, id = Number(select.value); select.value = String(selectedId.value); selectDocument(id); }
function selectWorkspace(value: string) { if (!workspaceTabs.value.some(tab => tab.value === value) || value === workspace.value) return; change(() => { workspace.value = value as typeof workspace.value; }); }
function selectDocumentPeriod(value: string) { if (value === 'week' || value === 'all') selectTab(value); }
function selectRequestPeriod(value: string) { if (value === 'recent' || value === 'older') requestAgeTab.value = value; }
function selectTab(period: 'week' | 'all') { if (documentTab.value !== period) change(() => { documentTab.value = period; }); }
function toggleNew() { change(() => { showNew.value = !showNew.value; error.value = ''; }); }
function addProduct() { editingProduct.value = true; Object.assign(lineEdit, { productId: 0, purchaseQuantity: 0, reason: '' }); initialProduct = JSON.stringify(lineEdit); }
async function load() {
  const version = ++loadVersion, company = activeCompanyId.value;
  if (!company) { loading.value = false; return; }
  loading.value = true; error.value = '';
  try {
    const [r, d, c] = await Promise.all([can('purchase_requests.view') ? http.get('/supply/requests', headers(company)) : Promise.resolve({ data: { data: [] } }), http.get('/supply/consolidations', headers(company)), http.get('/purchase-catalogs', headers(company))]);
    if (!mounted || version !== loadVersion || company !== activeCompanyId.value) return;
    requests.value = r.data.data;
    const requested = requests.value.find(item => item.id === Number(route.query.requestId));
    if (requested && localDate(requested.requestDate) < from.value) from.value = localDate(requested.requestDate);
    if (requested && to.value && localDate(requested.requestDate) > to.value) to.value = localDate(requested.requestDate);
    documents.value = d.data.data; catalogs.value = c.data.data;
    branchId.value = catalogs.value.generalWarehouse?.branchId ?? 0;
    warehouseId.value = catalogs.value.generalWarehouse?.id ?? 0;
    if (changed.value) return;
    contextUnavailable.value = false;
    const linkedProcessIds = requested?.details.flatMap((line: any) => line.consolidationSources.map((source: any) => source.line?.consolidationId)) ?? [];
    const linkedDocument = documents.value.find(d => d.id === Number(route.query.id)) ?? documents.value.find(d => linkedProcessIds.includes(d.id));
    if (route.query.id !== undefined && !documents.value.some(d => d.id === Number(route.query.id))) {
      selectedId.value = 0; current.value = null; showNew.value = false; contextUnavailable.value = true;
      error.value = 'La gestión de cotizaciones solicitada no está disponible.'; return;
    }
    if (route.query.requestId !== undefined && !requested) {
      selectedId.value = 0; current.value = null; showNew.value = false; contextUnavailable.value = true;
      error.value = can('purchase_requests.view') ? 'La solicitud de origen no está disponible para cotizar.' : 'No tienes permiso para consultar la solicitud de origen.'; return;
    }
    if (linkedDocument && linkedDocument.id !== selectedId.value) { clearFilters(); documentTab.value = documentIsRecent(linkedDocument) ? 'week' : 'all'; selectedId.value = linkedDocument.id; }
    else if (requested && allEligible.value.some(r => r.id === requested.id)) { requestAgeTab.value = isCurrentPurchaseWeek(requested.requestDate) ? 'recent' : 'older'; selectedRequests.value = [requested.id]; showNew.value = true; return; }
    else if (route.query.requestId !== undefined && !linkedDocument) {
      selectedId.value = 0; current.value = null; showNew.value = false; contextUnavailable.value = true;
      error.value = 'La solicitud ya tiene una compra en curso. Revisa sus documentos relacionados.'; return;
    }
    if (selectedId.value && !documents.value.some(d => d.id === selectedId.value)) { selectedId.value = 0; current.value = null; }
    if (selectedId.value && !visibleDocuments.value.some(d => d.id === selectedId.value)) { selectedId.value = 0; current.value = null; }
    if (!selectedId.value && !showNew.value) selectedId.value = visibleDocuments.value[0]?.id ?? 0;
    if (selectedId.value && !showNew.value) await open(selectedId.value);
  } catch (e) { if (mounted && version === loadVersion && company === activeCompanyId.value) error.value = getApiErrorMessage(e, 'No se pudo cargar el proceso'); } finally { if (version === loadVersion) loading.value = false; }
}
async function open(id: number) {
  const company = activeCompanyId.value, version = ++openVersion;
  opening.value = true;
  try { const r = await http.get(`/supply/consolidations/${id}`, headers(company)); if (!mounted || version !== openVersion || company !== activeCompanyId.value) return;
    contextUnavailable.value = false; error.value = ''; success.value = '';
    selectedId.value = id; current.value = r.data.data; showNew.value = false; editingProduct.value = false; addingSupplier.value = false; workspace.value = activeOrders.value.length && !remainingProducts.value ? 'orders' : current.value.rfqs.length ? 'suppliers' : 'products'; rfqLineIds.value = current.value.lines.filter((l: any) => Number(l.purchaseQuantity) > 0).map((l: any) => l.id);
    Object.keys(awards).forEach(k => delete awards[Number(k)]); current.value.lines.forEach((l: any) => awards[l.id] = { quoteDetailId: 0, quantity: Math.max(0, Number(l.purchaseQuantity) - Number(l.purchasedQuantity)) });
    lineEdit.productId = 0; lineEdit.reason = ''; offer.value = null; supplierId.value = 0;
    const linked = current.value.rfqs.find((rfq: any) => rfq.id === Number(route.query.rfqId));
    await router.replace({ query: { ...route.query, id: String(id), requestId: undefined, rfqId: undefined } });
    if (!mounted || version !== openVersion || company !== activeCompanyId.value) return;
    if (canRegisterResponse(linked)) startOffer(linked);
    else if (route.query.tab === 'compare' && receivedQuotes.value.length) workspace.value = 'compare';
  } catch (e) { if (mounted && version === openVersion && company === activeCompanyId.value) error.value = getApiErrorMessage(e, 'No se pudo abrir la gestión de cotizaciones'); } finally { if (version === openVersion) opening.value = false; }
}
async function run(work: (scope: MutationScope) => Promise<void>) { if (busy.value || !activeCompanyId.value) return; const scope = { companyId: activeCompanyId.value, epoch: companyEpoch }; busy.value = true; error.value = ''; success.value = ''; try { await work(scope); } catch (e) { if (validScope(scope)) error.value = getApiErrorMessage(e, 'No se pudo guardar'); } finally { if (validScope(scope)) busy.value = false; } }
function create() { void run(async scope => { const r = await http.post('/supply/consolidations', { dateFrom: from.value || requests.value.filter(r => selectedRequests.value.includes(r.id)).map(r => localDate(r.requestDate)).sort()[0], dateTo: to.value || date(), requestIds: selectedRequests.value }, headers(scope.companyId)); if (!validScope(scope)) return; selectedRequests.value = []; selectedId.value = r.data.data.id; showNew.value = false; clearFilters(); documentTab.value = 'week'; await open(selectedId.value); if (!validScope(scope)) return; await load(); if (validScope(scope)) success.value = 'Gestión creada. Revise los productos y consulte a los proveedores.'; }); }
function edit(line: any) { change(() => { editingProduct.value = true; Object.assign(lineEdit, { productId: line.productId, purchaseQuantity: Number(line.purchaseQuantity), reason: line.reason ?? '' }); initialProduct = JSON.stringify(lineEdit); }); }
function saveLine() { void run(async scope => { await http.patch(`/supply/consolidations/${selectedId.value}/lines`, {...lineEdit,expectedRevision:current.value?.quantityRevision}, headers(scope.companyId)); if (!validScope(scope)) return; await open(selectedId.value); if (validScope(scope)) success.value = 'Decisión registrada. La cantidad solicitada se conserva.'; }); }
function requestQuote() { void run(async scope => { await http.post(`/supply/consolidations/${selectedId.value}/rfqs`, { supplierId: supplierId.value, lineIds: rfqLineIds.value }, headers(scope.companyId)); if (!validScope(scope)) return; await open(selectedId.value); if (validScope(scope)) success.value = 'Solicitud de cotización preparada. Descargue su PDF para el proveedor.'; }); }
function startOffer(rfq: any) {
  offer.value = rfq;
  const quote = rfq.quotation;
  Object.assign(offerForm, { quotationDate: quote?.quotationDate.slice(0,10) ?? date(), validUntil: quote?.validUntil.slice(0,10) ?? date(), currency: quote?.currency ?? 'USD', paymentTerms: quote?.paymentTerms ?? '', deliveryDays: quote?.deliveryDays ?? 0,
    costsConfirmed:quote?.costsConfirmed??false,conditionsConfirmed:quote?.conditionsConfirmed??false,exchangeRateToUsd:quote?.exchangeRateToUsd?Number(quote.exchangeRateToUsd):undefined,exchangeRateDate:quote?.exchangeRateDate?.slice(0,10)??'',providerConfirmation:quote?.providerConfirmation??'',
    expenses: (quote?.expenses ?? []).map((expense: any) => ({ expenseTypeId: expense.expenseTypeId, description: expense.description ?? '', amount: Number(expense.amount),chargeMode:expense.chargeMode??'proportional' })),
    details: rfq.lines.map((row: any) => { const d = quote?.details.find((d: any) => d.productId === row.line.productId); return { productId: row.line.productId, productName: row.line.product.name, unitId: row.line.unitId, quantity: Number(d?.quantity??row.quantity), unitPrice: Number(d?.unitPrice ?? 0),availableQuantity:Number(d?.availableQuantity??row.quantity),availabilityStatus:d?.availabilityStatus??(d&&Number(d.availableQuantity)===0?'unconfirmed':'available'),presentation:d?.presentation??'',unitsPerPack:Number(d?.unitsPerPack??1),presentationPrice:d?.presentationPrice!=null?Number(d.presentationPrice):undefined,minimumQuantity:Number(d?.minimumQuantity??0), discount: Number(d?.discount ?? 0), taxRate: Number(d?.taxRate ?? 0), deliveryDays: d?.deliveryDays ?? quote?.deliveryDays ?? 0, notes: d?.notes ?? '', sources: [] }; }) });
  initialOffer = JSON.stringify(offerForm);
}
function consultedQuantity(line: any) { return offer.value?.lines.find((row: any) => row.line.productId === line.productId && row.line.unitId === line.unitId)?.quantity ?? line.quantity; }
function addOfferExpense() {
  if (!offerExpenseCapabilities.value.add || busy.value || !catalogs.value.expenseTypes.length) return;
  offerForm.expenses.push({ expenseTypeId: 0, description: '', amount: 0,chargeMode:'fixed' });
}
function removeOfferExpense(index: number) {
  if (offerExpenseCapabilities.value.edit && !busy.value) offerForm.expenses.splice(index, 1);
}
function saveOffer() { void run(async scope => {
  if(offerForm.details.some(l=>l.availabilityStatus==='unconfirmed'||l.availabilityStatus==='available'&&!(Number(l.availableQuantity)>0))){error.value='Confirme la disponibilidad: indique una cantidad positiva o elija No tiene este producto / No cotizado.';return;}
  if (offerQuantityChanged.value && !offerForm.providerConfirmation.trim()) { error.value = 'Registre la referencia de la oferta que respalda la cantidad distinta a la consultada.'; return; }
  const { expenses: _expenses, ...fields } = offerForm;
  const payload = { ...fields,exchangeRateDate:fields.exchangeRateDate||undefined, ...quotationExpenseUpdate(offerForm.expenses, originalOfferExpenses.value, expensePermissions.value), supplierId: offer.value.supplierId, rfqId: offer.value.id, requestIds: [], details: offerForm.details.map(({ productName: _name, ...d }) => ({...d,availableQuantity:d.availabilityStatus==='available'?d.availableQuantity:0})) };
  const r = offer.value.quotation ? await http.patch(`/purchase-quotations/${offer.value.quotation.id}`, payload, headers(scope.companyId)) : await http.post('/purchase-quotations', payload, headers(scope.companyId));
  if (!validScope(scope)) return;
  // If confirming receipt fails, retry the saved offer rather than creating another one.
  offer.value.quotation = r.data.data;
  if (r.data.data.status === 'draft') await http.post(`/purchase-quotations/${r.data.data.id}/receive`, {}, headers(scope.companyId));
  if (!validScope(scope)) return;
  offer.value = null; await open(selectedId.value); if (validScope(scope)) success.value = 'Oferta recibida registrada. Ya puede comparar por producto.';
}); }
function changeAvailability(line:any){if(line.availabilityStatus==='available'){if(!(line.availableQuantity>0))line.availableQuantity=line.quantity;}else line.availableQuantity=0;}
async function download(rfq: any) { await run(async scope => { const response = await http.get(`/supply/rfqs/${rfq.id}/pdf`, { ...headers(scope.companyId), responseType: 'blob' }); if (!validScope(scope)) return; const url = URL.createObjectURL(response.data); const a = document.createElement('a'); a.href = url; a.download = `${rfq.code}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }); }
function award() { void run(async scope => {
  const id = selectedId.value;
  const details = Object.values(awards).filter(a => a.quoteDetailId && a.quantity > 0).map(a => ({ quotationDetailId: a.quoteDetailId, quantity: a.quantity })).sort((a,b) => a.quotationDetailId - b.quotationDetailId);
  const payload = { branchId: branchId.value, warehouseId: warehouseId.value, details };
  const signature = JSON.stringify({ companyId: scope.companyId, id, ...payload });
  if (!awardReference || awardReference.payload !== signature) awardReference = { payload: signature, id: crypto.randomUUID() };
  await http.post(`/supply/consolidations/${id}/award`, { ...payload, requestId: awardReference.id }, headers(scope.companyId));
  if (!validScope(scope)) return;
  awardReference = null; confirm.value = false; await open(id);
  if (validScope(scope)) success.value = 'Órdenes generadas por proveedor. Abra cada orden para registrar gastos previstos, aprobar y recibir.';
}); }
watch(branchId, () => warehouseId.value = catalogs.value.generalWarehouse?.id ?? 0);
watch([from,to], () => selectedRequests.value = selectedRequests.value.filter(id => allEligible.value.some(r => r.id === id)));
watch(visibleDocuments, rows => {
  if (contextUnavailable.value || changed.value || showNew.value || loading.value || opening.value || busy.value || rows.some(d => d.id === selectedId.value)) return;
  if (rows[0]) void open(rows[0].id);
  else { ++openVersion; selectedId.value = 0; current.value = null; void router.replace({ query: { ...route.query, id: undefined, requestId: undefined } }); }
});
watch(() => [route.query.id, route.query.requestId, route.query.rfqId], () => { if (route.query.id !== undefined && Number(route.query.id) !== current.value?.id || route.query.requestId !== undefined) void load(); else if (route.query.rfqId !== undefined && !opening.value) change(() => { void open(selectedId.value); }); });
watch(activeCompanyId, () => { ++companyEpoch; ++loadVersion; ++openVersion; opening.value = false; busy.value = false; resolveLeave(false); confirm.value = false; resetEditing(); selectedId.value = 0; current.value = null; documents.value = []; requests.value = []; catalogs.value = { products: [], suppliers: [], branches: [], expenseTypes: [] }; branchId.value = 0; warehouseId.value = 0; supplierId.value = 0; rfqLineIds.value = []; from.value = ''; to.value = date(); showNew.value = false; contextUnavailable.value = false; documentTab.value = 'week'; requestAgeTab.value = 'recent'; clearFilters(); discardChanges.value = false; pendingChange = undefined; void load(); }, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { mounted = false; ++companyEpoch; ++loadVersion; ++openVersion; pendingChange = undefined; });
</script>

<template>
  <AdminLayout title="Gestionar cotizaciones">
    <div class="mx-auto max-w-[1440px] space-y-4">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0"><h1 class="text-2xl font-semibold tracking-tight text-fg">{{ offer ? 'Registrar oferta' : 'Cotizaciones' }}</h1><p class="mt-1 text-sm text-muted-fg">{{ offer ? 'Complete la respuesta del proveedor para poder compararla.' : 'Reúna solicitudes, consulte a los proveedores y compare sus ofertas en un mismo lugar.' }}</p></div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="!offer">
            <AppButton variant="outline" :disabled="loading || opening || busy || changed" @click="load">Actualizar</AppButton>
            <AppButton v-if="can('purchase_quotations.create') && can('purchase_requests.view')" :variant="!current && !showNew ? 'primary' : 'outline'" :disabled="busy || loading || opening" @click="toggleNew">{{ showNew ? 'Volver a la gestión' : 'Nueva gestión' }}</AppButton>
          </template>
          <template v-else>
            <AppButton type="button" variant="outline" :disabled="busy" @click="change(() => { offer = null; })">Cancelar</AppButton>
            <AppButton type="submit" form="offer-form" :disabled="busy">Guardar oferta recibida</AppButton>
          </template>
        </div>
      </header>

      <ol class="grid gap-x-6 border-b border-border sm:grid-cols-2 lg:grid-cols-[1.3fr_1.1fr_1.1fr_1.5fr]" aria-label="Pasos de la gestión de cotización">
        <li v-for="(step, index) in processSteps" :key="step.title" class="-mb-px border-b-2 py-2" :class="processStepIndex === index + 1 ? 'border-accent' : 'border-transparent'" :aria-current="processStepIndex === index + 1 ? 'step' : undefined">
          <span class="flex items-center gap-3">
            <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums" :class="processStepIndex > index + 1 ? 'bg-success text-white' : processStepIndex === index + 1 ? 'text-accent' : 'text-muted-fg'"><Check v-if="processStepIndex > index + 1" class="h-4 w-4" aria-hidden="true" /><template v-else>{{ index + 1 }}</template></span>
            <span class="text-sm" :class="processStepIndex === index + 1 ? 'font-semibold text-accent' : processStepIndex > index + 1 ? 'font-medium text-fg' : 'text-muted-fg'">{{ step.title }}</span>
          </span>
          <span class="block pl-9 text-xs leading-5 text-muted-fg">{{ step.hint }}</span>
        </li>
      </ol>

      <p v-if="error" role="alert" class="rounded-[12px] bg-danger/10 p-4 text-sm text-danger">{{ error }}</p>
      <p v-if="success" role="status" class="flex items-center gap-2 text-sm font-medium text-success"><Check class="h-4 w-4 shrink-0" aria-hidden="true" />{{ success }}</p>

      <section v-if="current && !showNew && !offer && !opening" aria-label="Gestión abierta" class="rounded-[12px] border border-border bg-surface">
        <div class="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
          <div class="min-w-0"><p class="text-xs text-muted-fg">Gestión abierta</p><p class="text-base font-semibold text-fg">{{ processLabel(current) }}</p><p class="flex flex-wrap items-center gap-x-4 text-sm text-muted-fg"><span v-if="originCodes.length">{{ originCodes.join(', ') }}</span><TrackingLink class="-ml-2" type="consolidation" :id="current.id" /></p></div>
          <AppButton variant="ghost" size="sm" :disabled="busy || loading" @click="switching = !switching">{{ switching ? 'Cerrar' : 'Cambiar de gestión' }}</AppButton>
        </div>
        <div v-if="visibleDocuments.some(d => d.id === current.id)" class="border-t border-border px-5 py-3">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="max-w-3xl"><p class="sr-only">Siguiente paso</p><h2 class="text-base font-semibold">{{ nextStep.title }}</h2><p class="mt-0.5 text-sm text-muted-fg">{{ nextStep.description }}</p></div>
            <div class="flex flex-col items-stretch gap-2 sm:items-end"><div class="flex flex-wrap gap-2">
              <AppButton v-if="nextStep.action === 'suppliers' && can('purchase_quotations.create')" :disabled="busy || changed" @click="change(() => { workspace = 'suppliers'; })">Preparar solicitud al proveedor</AppButton>
              <AppButton v-if="nextStep.action === 'offer' && !severalPending && canRegisterResponse(pendingResponse)" :disabled="busy || changed" @click="change(() => { workspace = 'suppliers'; startOffer(pendingResponse); })">{{ pendingResponse.quotation ? 'Completar oferta' : 'Registrar oferta' }}</AppButton>
              <AppButton v-if="nextStep.action === 'offer' && severalPending && workspace !== 'suppliers'" :disabled="busy || changed" @click="change(() => { workspace = 'suppliers'; })">Elegir proveedor</AppButton>
              <AppButton v-if="nextStep.action === 'compare' && can('purchase_quotations.view')" :disabled="busy || changed" @click="change(() => { workspace = 'compare'; })">Comparar y elegir ofertas</AppButton>
              <AppButton v-if="nextStep.action === 'orders' && can('purchase_orders.view') && workspace !== 'orders'" :disabled="busy || changed" @click="change(() => { workspace = 'orders'; })">Ver órdenes</AppButton>
            </div>
              <details v-if="can('trash.delete') || can('purchase_quotations.view')" class="relative">
                <summary class="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary [&::-webkit-details-marker]:hidden">Más acciones<ChevronDown class="h-4 w-4 text-muted-fg" aria-hidden="true" /></summary>
                <div class="absolute right-0 top-full z-30 mt-2 flex min-w-52 flex-col gap-2 rounded-[12px] border border-border bg-surface p-3 shadow-subtle"><RouterLink v-if="can('purchase_quotations.view')" to="/purchases/quotations" class="rounded-lg border border-border px-3 py-2 text-center text-sm hover:bg-surface-secondary">Ver ofertas anteriores</RouterLink><TrashButton v-if="can('trash.delete')" entity="purchase_processes" :record-id="current.id" :label="current.code" :disabled="busy || changed" @deleted="load" /></div>
              </details>
            </div>
          </div>
        </div>
      </section>

      <section v-if="!offer && !showNew && (!current || switching)" class="rounded-[12px] border border-border bg-surface p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <PurchaseTabs :model-value="documentTab" :items="[{ value: 'week', label: 'Esta semana' }, { value: 'all', label: 'Anteriores' }]" label="Antigüedad de las gestiones" :disabled="busy || loading || opening" @update:model-value="selectDocumentPeriod" />
          <details class="relative">
            <summary class="cursor-pointer text-sm font-medium text-muted-fg">Filtrar<span v-if="activeFilterCount" class="ml-2 rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-fg">{{ activeFilterCount }}</span></summary>
            <div class="absolute right-0 top-full z-30 mt-3 w-[min(320px,calc(100vw-3rem))] space-y-3 rounded-[12px] border border-border bg-surface p-4 shadow-subtle">
              <label class="block text-sm">Número o código<input v-model="documentSearch" type="search" class="field-control" placeholder="Buscar gestión" :disabled="changed || busy || loading || opening" /></label>
              <label v-if="documentTab === 'all'" class="block text-sm">Creada desde<input v-model="historyFrom" type="date" class="field-control" :max="historyTo || undefined" :disabled="changed || busy || loading || opening" /></label>
              <label v-if="documentTab === 'all'" class="block text-sm">Creada hasta<input v-model="historyTo" type="date" class="field-control" :min="historyFrom || undefined" :disabled="changed || busy || loading || opening" /></label>
              <button v-if="activeFilterCount" type="button" class="text-sm font-medium text-accent disabled:opacity-50" :disabled="changed || busy || loading || opening" @click="clearFilters">Limpiar filtros</button>
            </div>
          </details>
        </div>
        <label v-if="visibleDocuments.length" class="mt-5 block text-sm font-medium">Compra en gestión
          <select :value="selectedId" class="field-control mt-2" :disabled="busy || loading || opening" @change="selectDocumentFromEvent">
            <option :value="0" disabled>Seleccione una gestión</option>
            <option v-for="d in visibleDocuments" :key="d.id" :value="d.id">{{ processLabel(d) }}</option>
          </select>
        </label>
        <p v-else-if="!loading" class="mt-5 py-3 text-sm text-muted-fg">{{ activeFilterCount ? 'No hay gestiones con estos filtros.' : documentTab === 'week' ? 'No hay cotizaciones de esta semana.' : 'Aún no hay gestiones de cotización.' }}</p>
        <p v-if="loading || opening" role="status" class="mt-4 text-sm text-muted-fg">Cargando cotizaciones…</p>
      </section>

      <div v-if="can('purchase_quotations.create') && can('purchase_requests.view') && !offer && !opening && (showNew || !contextUnavailable && !documents.length && !loading)" class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="picker-title" class="min-w-0 rounded-[12px] border border-border bg-surface p-5 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div><h2 id="picker-title" class="text-lg font-semibold">Solicitudes para cotizar</h2><p class="mt-1 text-sm text-muted-fg">Seleccione las solicitudes que formarán parte de esta gestión de cotización.</p></div>
            <details class="relative max-w-full">
              <summary class="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-fg [&::-webkit-details-marker]:hidden"><CalendarDays class="h-4 w-4" aria-hidden="true" />Filtrar por fechas</summary>
              <div class="absolute right-0 z-20 mt-3 flex flex-wrap gap-3 rounded-[12px] border border-border bg-surface p-4 shadow-subtle"><label class="text-sm">Desde<input v-model="from" type="date" class="field-control" /></label><label class="text-sm">Hasta<input v-model="to" type="date" class="field-control" /></label></div>
            </details>
          </div>
          <div class="mt-5"><PurchaseTabs variant="pill" :model-value="requestAgeTab" :items="[{ value: 'recent', label: 'Esta semana' }, { value: 'older', label: 'Anteriores' }]" label="Antigüedad de las solicitudes" :disabled="busy" @update:model-value="selectRequestPeriod" /></div>
          <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_1fr_1fr]">
            <label class="relative block"><span class="sr-only">Buscar solicitud</span><Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" /><input v-model="requestSearch" type="search" class="field-control !mt-0 !h-9 !pl-9" placeholder="Buscar por código, sucursal o motivo…" /></label>
            <label class="relative block"><span class="sr-only">Sucursal</span><Building2 class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" /><select v-model.number="requestBranch" class="field-control !mt-0 !h-9 !pl-9"><option :value="0">Todas las sucursales</option><option v-for="branch in branchOptions" :key="branch.id" :value="branch.id">{{ branch.name }}</option></select></label>
            <label class="relative block"><span class="sr-only">Finalidad</span><Tag class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" /><select v-model="requestPurpose" class="field-control !mt-0 !h-9 !pl-9"><option value="">Todas las finalidades</option><option v-for="purpose in purposeOptions" :key="purpose.value" :value="purpose.value">{{ purpose.label }}</option></select></label>
          </div>
          <div class="mt-4 overflow-x-auto rounded-[12px] border border-border">
            <table class="w-full min-w-[620px] text-left text-sm">
              <thead class="bg-surface-secondary text-xs text-muted-fg"><tr>
                <th class="w-10 px-4 py-3"><input type="checkbox" class="h-4 w-4 accent-accent" aria-label="Seleccionar las solicitudes de esta página" :checked="pageAllSelected" :disabled="busy || !pickerPage.length" @change="togglePage" /></th>
                <th class="px-3 py-3 font-medium">Código</th><th class="px-3 py-3 font-medium">Sucursal</th><th class="px-3 py-3 font-medium">Fecha</th><th class="px-3 py-3 font-medium">Finalidad de la compra</th><th class="px-3 py-3 font-medium">Productos</th><th class="px-3 py-3 font-medium">Estado</th>
              </tr></thead>
              <tbody class="divide-y divide-border">
                <tr v-for="r in pickerPage" :key="r.id" class="cursor-pointer transition-colors hover:bg-surface-secondary" :class="selectedRequests.includes(r.id) ? 'bg-accent-soft' : ''" @click="!busy && (selectedRequests.includes(r.id) ? selectedRequests.splice(selectedRequests.indexOf(r.id), 1) : selectedRequests.push(r.id))">
                  <td class="px-4 py-3" @click.stop><input v-model="selectedRequests" type="checkbox" :value="r.id" :disabled="busy" class="h-4 w-4 accent-accent" :aria-label="'Seleccionar ' + r.code" /></td>
                  <td class="whitespace-nowrap px-3 py-3 font-semibold text-fg">{{ r.code }}</td>
                  <td class="px-3 py-3 text-muted-fg">{{ r.branch.name }}</td>
                  <td class="whitespace-nowrap px-3 py-3 text-muted-fg">{{ pickerDate(r.requestDate) }}</td>
                  <td class="px-3 py-3 text-muted-fg">{{ purchasePurposeLabel(r.purpose) }}</td>
                  <td class="px-3 py-3 text-muted-fg">{{ r.details.length }}</td>
                  <td class="px-3 py-3"><span class="inline-flex items-center gap-1.5 text-muted-fg"><span class="h-2 w-2 rounded-full" :class="statusDotClass(documentStatusVariant(r.status))" aria-hidden="true" />{{ documentStatusLabel(r.status) }}</span></td>
                </tr>
                <tr v-if="!pickerPage.length"><td colspan="7" class="p-6 text-center text-sm text-muted-fg">{{ eligible.length ? 'Ninguna solicitud coincide con la búsqueda.' : 'No hay solicitudes pendientes para estas fechas.' }}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-fg">
            <span class="font-medium text-fg">{{ selectedRequests.length }} {{ selectedRequests.length === 1 ? 'solicitud seleccionada' : 'solicitudes seleccionadas' }}</span>
            <div class="flex items-center gap-3"><span>Mostrando {{ pickerPage.length }} de {{ pickerRequests.length }} solicitudes</span>
              <nav v-if="pickerPages > 1" class="flex items-center gap-1" aria-label="Páginas de solicitudes">
                <button type="button" class="icon-button" aria-label="Página anterior" :disabled="requestPage === 1" @click="requestPage--"><ChevronLeft class="h-4 w-4" aria-hidden="true" /></button>
                <button v-for="n in pickerPages" :key="n" type="button" class="grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm" :class="n === requestPage ? 'border-accent/30 bg-accent-soft font-semibold text-accent' : 'border-border hover:bg-surface-secondary'" :aria-current="n === requestPage ? 'page' : undefined" @click="requestPage = n">{{ n }}</button>
                <button type="button" class="icon-button" aria-label="Página siguiente" :disabled="requestPage === pickerPages" @click="requestPage++"><ChevronRight class="h-4 w-4" aria-hidden="true" /></button>
              </nav>
            </div>
          </div>
        </section>

        <aside aria-labelledby="summary-title" class="rounded-[12px] border border-border bg-surface p-5 xl:sticky xl:top-0">
          <h2 id="summary-title" class="text-lg font-semibold">Resumen de la cotización</h2>
          <dl class="mt-3 divide-y divide-border text-sm">
            <div class="flex items-center justify-between gap-3 py-3"><dt class="text-muted-fg">Solicitudes seleccionadas</dt><dd class="font-semibold tabular-nums">{{ chosenSummary.requests }}</dd></div>
            <div class="flex items-center justify-between gap-3 py-3"><dt class="text-muted-fg">Productos totales</dt><dd class="font-semibold tabular-nums">{{ chosenSummary.products }}</dd></div>
            <div class="flex items-center justify-between gap-3 py-3"><dt class="text-muted-fg">Sucursales</dt><dd class="font-semibold tabular-nums">{{ chosenSummary.branches }}</dd></div>
            <div class="flex items-center justify-between gap-3 py-3"><dt class="text-muted-fg">Finalidades</dt><dd class="font-semibold tabular-nums">{{ chosenSummary.purposes }}</dd></div>
          </dl>
          <h3 class="mt-5 text-sm font-semibold">Solicitudes incluidas ({{ chosenSummary.requests }})</h3>
          <ul v-if="chosenRequests.length" class="mt-2 max-h-64 divide-y divide-border overflow-auto">
            <li v-for="r in chosenRequests" :key="r.id" class="py-3 text-sm">
              <div class="flex items-center justify-between gap-2"><strong>{{ r.code }}</strong><button type="button" class="icon-button text-danger" :aria-label="'Quitar ' + r.code" :disabled="busy" @click="selectedRequests = selectedRequests.filter(id => id !== r.id)"><Trash2 class="h-4 w-4" aria-hidden="true" /></button></div>
              <p class="mt-1 text-xs text-muted-fg">{{ r.branch.name }}</p>
              <p class="mt-1 flex justify-between text-xs text-muted-fg"><span>{{ pickerDate(r.requestDate) }}</span><span>{{ r.details.length }} {{ r.details.length === 1 ? 'producto' : 'productos' }}</span></p>
            </li>
          </ul>
          <p v-else class="mt-3 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-fg">Aún no ha seleccionado solicitudes.</p>
          <AppButton v-if="can('purchase_quotations.create')" class="mt-5 w-full" :disabled="!selectedRequests.length || busy" @click="create">Continuar con los productos<ArrowRight class="h-4 w-4" aria-hidden="true" /></AppButton>
        </aside>
      </div>

      <template v-if="current && !showNew && !opening && visibleDocuments.some(d => d.id === current.id)">
        <div v-if="!offer" class="border-b border-border"><PurchaseTabs variant="underline" :model-value="workspace" :items="workspaceTabs.map(tab => ({ value: tab.value, label: `${tab.label} (${tab.count})` }))" label="Secciones de la gestión" :disabled="busy || loading" @update:model-value="selectWorkspace" /></div>

        <section v-if="!offer && workspace === 'products'" class="overflow-hidden rounded-[12px] border border-border bg-surface">
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div><h2 class="text-base font-semibold">Productos a cotizar</h2><p class="mt-1 text-sm text-muted-fg">Ajuste las cantidades que va a comprar antes de consultar a los proveedores.</p></div>
            <AppButton v-if="canAdjustProposal" variant="outline" :disabled="busy" @click="change(addProduct)">Agregar producto</AppButton>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[600px] text-left text-sm">
              <thead class="border-y border-border bg-surface-secondary text-xs text-muted-fg"><tr><th class="px-5 py-3 font-medium sm:px-6">Producto</th><th class="px-4 py-3 text-right font-medium">Solicitado</th><th class="px-4 py-3 text-right font-medium">A cotizar</th><th class="px-5 py-3 text-right font-medium sm:px-6">Acción</th></tr></thead>
              <tbody>
                <tr v-for="l in current.lines" :key="l.id" class="border-b border-border last:border-b-0">
                  <td class="px-5 py-3 sm:px-6">
                    <strong class="font-medium">{{ l.product.name }}</strong><span class="mt-1 block text-xs text-muted-fg">{{ l.unit.name }}<template v-if="l.reason"> · {{ l.reason }}</template></span>
                    <details v-if="l.sources.length" class="mt-2">
                      <summary class="cursor-pointer text-xs font-medium text-accent">Detalle por sucursal</summary>
                      <div class="mt-3 space-y-3 rounded-[12px] bg-surface-secondary p-3">
                        <div v-for="s in l.sources" :key="s.id"><p class="text-xs font-medium">{{ s.requestDetail.request.branch.name }} · {{ s.requestDetail.request.code }}</p><p class="mt-1 text-xs leading-relaxed text-muted-fg">{{ s.quantity }} solicitado · {{ s.dispatchedQuantity }} despachado · {{ s.distributedQuantity }} recibido · {{ s.pendingQuantity }} pendiente</p></div>
                      </div>
                    </details>
                    <span v-else class="mt-2 block text-xs text-muted-fg">Agregado por Compras</span>
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums text-muted-fg">{{ l.requestedQuantity }}</td>
                  <td class="px-4 py-3 text-right font-semibold tabular-nums">{{ l.purchaseQuantity }}</td>
                  <td class="px-5 py-3 text-right sm:px-6"><AppButton v-if="canAdjustProposal" size="sm" variant="outline" :disabled="busy" @click="edit(l)">Modificar</AppButton></td>
                </tr>
              </tbody>
            </table>
          </div>
          <form v-if="editingProduct && canAdjustProposal" class="m-5 grid gap-4 rounded-[12px] border border-border bg-surface-secondary p-4 sm:m-6 sm:grid-cols-2" @submit.prevent="saveLine">
            <label class="text-sm">Producto existente o adicional<select v-model.number="lineEdit.productId" :disabled="!!current.rfqs.length" class="field-control" required><option :value="0" disabled>Seleccione</option><option v-for="p in catalogs.products" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
            <label class="text-sm">Cantidad propuesta para comprar<input v-model.number="lineEdit.purchaseQuantity" type="number" min="0" step="1" required class="field-control" /></label>
            <label class="text-sm sm:col-span-2">Motivo del cambio<input v-model="lineEdit.reason" required maxlength="1000" class="field-control" /></label>
            <div class="flex flex-wrap justify-end gap-3 sm:col-span-2"><AppButton type="button" variant="outline" :disabled="busy" @click="change(() => { editingProduct = false; })">Cancelar</AppButton><AppButton type="submit" :disabled="busy || !lineEdit.productId">Guardar decisión</AppButton></div>
          </form>
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-3">
            <p class="text-xs text-muted-fg">{{ current.rfqs.length ? 'Las cantidades consultadas se conservan. Compras elige las ofertas y Gerencia aprueba la orden.' : 'Prepare las solicitudes a proveedores.' }}</p>
          </div>
        </section>

        <section v-if="!offer && workspace === 'suppliers'" class="rounded-[12px] border border-border bg-surface p-5">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div><h2 class="text-base font-semibold">Consulta a proveedores</h2><p class="mt-1 text-sm text-muted-fg">Prepare el PDF y registre la oferta de cada proveedor.</p></div>
            <AppButton v-if="current.rfqs.length && availableSuppliers.length && can('purchase_quotations.create') && !addingSupplier" variant="outline" :disabled="busy" @click="addingSupplier = true">Consultar otro proveedor</AppButton>
          </div>
          <form v-if="(!current.rfqs.length || addingSupplier) && can('purchase_quotations.create')" class="mt-5 space-y-5 border-t border-border pt-5" @submit.prevent="requestQuote">
            <label class="block max-w-lg text-sm font-medium">Proveedor<select v-model.number="supplierId" class="field-control !h-9" required><option :value="0" disabled>Seleccione</option><option v-for="s in availableSuppliers" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
            <p v-if="!availableSuppliers.length" class="text-sm text-muted-fg">No hay proveedores disponibles para una nueva consulta.</p>
            <fieldset><legend class="text-sm font-medium">Productos a consultar</legend><p class="mt-1 text-xs text-muted-fg">Puede consultar el mismo producto a varios proveedores.</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <label v-for="l in current.lines.filter((l: any) => Number(l.purchaseQuantity) > 0)" :key="l.id" class="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface p-3"><input v-model="rfqLineIds" type="checkbox" :value="l.id" :disabled="busy" class="h-4 w-4 shrink-0 accent-accent" /><span class="min-w-0 flex-1 text-sm">{{ l.product.name }}</span><span class="text-sm font-medium tabular-nums">{{ l.purchaseQuantity }}</span></label>
              </div>
            </fieldset>
            <div class="flex flex-wrap justify-end gap-3"><AppButton v-if="addingSupplier" type="button" variant="outline" :disabled="busy" @click="addingSupplier = false">Cancelar</AppButton><AppButton type="submit" :disabled="busy || !supplierId || !rfqLineIds.length">Preparar solicitud</AppButton></div>
          </form>
          <div v-if="current.rfqs.length" class="mt-4">
            <div class="hidden border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-fg md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_340px] md:gap-4" aria-hidden="true"><span>Proveedor</span><span>Solicitud</span><span>Estado</span><span class="text-right">Acciones</span></div>
            <ul class="divide-y divide-border" aria-label="Proveedores consultados">
              <li v-for="r in current.rfqs" :key="r.id" class="grid gap-x-4 gap-y-2 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_340px] md:items-center">
                <h3 class="min-w-0 font-medium text-fg">{{ r.supplier.name }}</h3>
                <p class="text-sm text-muted-fg">{{ r.code }}<RouterLink v-if="r.quotation" :to="`/purchases/quotations?id=${r.quotation.id}`" class="mt-0.5 block text-xs font-medium text-accent hover:underline">Ver {{ r.quotation.code }}</RouterLink></p>
                <p class="inline-flex items-center gap-1.5 text-sm text-muted-fg"><span class="h-2 w-2 shrink-0 rounded-full" :class="rfqState(r).dot" aria-hidden="true" />{{ rfqState(r).label }}</p>
                <div class="flex flex-wrap items-center gap-2 md:justify-end"><AppButton variant="outline" :disabled="busy" @click="download(r)"><Download class="h-4 w-4" aria-hidden="true" />Descargar PDF</AppButton><AppButton v-if="canRegisterResponse(r)" variant="outline" :disabled="busy" @click="startOffer(r)"><Pencil class="h-4 w-4" aria-hidden="true" />{{ !r.quotation ? 'Registrar oferta' : r.quotation.status === 'draft' ? 'Completar oferta' : 'Editar oferta' }}</AppButton></div>
              </li>
            </ul>
          </div>
        </section>

        <form v-if="offer" id="offer-form" class="space-y-4" @submit.prevent="saveOffer">
          <section class="rounded-[12px] border border-border bg-surface p-5">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="text-lg font-semibold">{{ offer.supplier.name }}</h2><p class="mt-0.5 text-sm text-muted-fg">Solicitud {{ offer.code }}</p></div><AppButton type="button" variant="outline" :disabled="busy" @click="change(() => { offer = null; })">Cerrar oferta</AppButton></div>
            <div class="mt-4 grid gap-4 sm:grid-cols-3">
              <label class="text-sm">Fecha de oferta<input v-model="offerForm.quotationDate" type="date" required class="field-control !h-9" /></label><label class="text-sm">Vigente hasta<input v-model="offerForm.validUntil" type="date" required class="field-control !h-9" /></label><label class="text-sm">Moneda<input v-model="offerForm.currency" pattern="[A-Z]{3}" required class="field-control !h-9" /></label>
            </div>
            <div v-if="offerForm.currency!=='USD'" class="mt-4 grid gap-4 sm:grid-cols-2"><label class="text-sm">USD por {{ offerForm.currency }} (opcional)<input v-model.number="offerForm.exchangeRateToUsd" type="number" min="0.00000001" step="0.00000001" class="field-control !h-9" /></label><label class="text-sm">Fecha del tipo de cambio<input v-model="offerForm.exchangeRateDate" type="date" :max="date()" :required="!!offerForm.exchangeRateToUsd" class="field-control !h-9" /></label></div>
          </section>

          <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section aria-labelledby="offer-products-title" class="min-w-0 overflow-hidden rounded-[12px] border border-border bg-surface">
              <h3 id="offer-products-title" class="px-5 pb-3 pt-5 text-base font-semibold">Productos de la oferta</h3>
              <div class="hidden border-y border-border bg-surface-secondary px-5 py-2.5 text-sm text-muted-fg lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_120px_130px] lg:gap-3" aria-hidden="true"><span>Producto</span><span>Respuesta del proveedor</span><span>Precio por unidad</span><span>Cantidad disponible</span></div>
              <div class="divide-y divide-border border-t border-border lg:border-t-0">
                <div v-for="l in offerForm.details" :key="l.productId">
                  <div class="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_120px_130px] lg:items-center">
                    <div class="min-w-0"><h4 class="font-medium">{{ l.productName }}</h4><p class="mt-0.5 text-xs text-muted-fg">Cantidad consultada: {{ consultedQuantity(l) }}</p></div>
                    <label class="block text-sm"><span class="mb-1 block text-xs text-muted-fg lg:sr-only">Respuesta del proveedor</span><select v-model="l.availabilityStatus" class="field-control !mt-0 !h-9" required @change="changeAvailability(l)"><option v-if="l.availabilityStatus==='unconfirmed'" value="unconfirmed" disabled>Disponibilidad por confirmar</option><option value="available">Tiene este producto</option><option value="unavailable">No tiene este producto</option><option value="not_quoted">No cotizado</option></select></label>
                    <template v-if="l.availabilityStatus==='available'"><label class="block text-sm"><span class="mb-1 block text-xs text-muted-fg lg:sr-only">Precio por unidad</span><input v-model.number="l.unitPrice" type="number" min="0.0001" step="0.0001" required class="field-control !mt-0 !h-9" :disabled="!!l.presentation" /></label><label class="block text-sm"><span class="mb-1 block text-xs text-muted-fg lg:sr-only">Cantidad disponible</span><input v-model.number="l.availableQuantity" type="number" min="1" :max="l.quantity" step="1" required class="field-control !mt-0 !h-9" /></label></template>
                    <p v-else class="text-xs text-muted-fg lg:col-span-2">{{ l.availabilityStatus==='unconfirmed'?'La oferta anterior guardó cero. Confirme qué cantidad tiene el proveedor.':'Este producto no se incluirá en sus órdenes.' }}</p>
                  </div>
                  <details v-if="l.availabilityStatus==='available'" class="border-t border-border"><summary class="cursor-pointer px-5 py-3 text-sm text-muted-fg">Cantidad cotizada, presentación y mínimo</summary><div class="grid gap-3 px-5 pb-4 sm:grid-cols-2"><label class="text-sm">Cantidad cotizada<input v-model.number="l.quantity" type="number" min="1" step="1" required class="field-control !h-9" /></label><label class="text-sm">Compra mínima (0 = ninguna)<input v-model.number="l.minimumQuantity" type="number" min="0" :max="l.quantity" step="1" class="field-control !h-9" /></label><label class="text-sm sm:col-span-2">Presentación del precio<input v-model="l.presentation" class="field-control !h-9" placeholder="Vacío: unidad de compra. Ej. Caja de 12" /></label><template v-if="l.presentation"><label class="text-sm">Unidades de compra por presentación<input v-model.number="l.unitsPerPack" type="number" min="1" step="1" required class="field-control !h-9" /></label><label class="text-sm">Precio por presentación<input v-model.number="l.presentationPrice" type="number" min="0.0001" step="0.0001" required class="field-control !h-9" /></label><p class="text-xs text-muted-fg sm:col-span-2">Precio normalizado por unidad: {{ offerMoney(Number(l.presentationPrice||0)/Number(l.unitsPerPack||1)) }}</p></template></div></details>
                  <details class="border-t border-border"><summary class="cursor-pointer px-5 py-3 text-sm text-muted-fg">Descuento, impuesto y condiciones</summary><div class="grid gap-3 px-5 pb-4 sm:grid-cols-3"><label class="text-sm">Descuento total<input v-model.number="l.discount" type="number" min="0" step="0.01" class="field-control !h-9" /></label><label class="text-sm">Impuesto %<input v-model.number="l.taxRate" type="number" min="0" max="100" step="0.01" class="field-control !h-9" /></label><label class="text-sm">Entrega (días)<input v-model.number="l.deliveryDays" type="number" min="0" class="field-control !h-9" /></label><label class="text-sm sm:col-span-3">Disponibilidad y condiciones<input v-model="l.notes" maxlength="1000" class="field-control !h-9" /></label></div></details>
                </div>
              </div>
            </section>

            <div class="min-w-0 divide-y divide-border overflow-hidden rounded-[12px] border border-border bg-surface">
              <details><summary class="cursor-pointer px-5 py-3.5 text-sm font-medium text-fg">Pago y entrega general</summary><div class="grid gap-3 px-5 pb-4"><label class="text-sm">Condiciones de pago<input v-model="offerForm.paymentTerms" maxlength="100" class="field-control !h-9" /></label><label class="text-sm">Entrega general (días)<input v-model.number="offerForm.deliveryDays" type="number" min="0" required class="field-control !h-9" /></label></div></details>
              <details v-if="offerForm.expenses.length || offerExpenseCapabilities.add">
                <summary class="cursor-pointer px-5 py-3.5 text-sm font-medium text-fg">Cargos adicionales de la oferta<span v-if="offerForm.expenses.length" class="ml-2 text-fg">{{ offerMoney(offerExpenseTotal) }}</span><span v-else class="ml-2 text-xs font-normal text-muted-fg">Opcional</span></summary>
                <div class="space-y-3 px-5 pb-4">
                  <p class="text-xs leading-5 text-muted-fg">Importes que el proveedor cobra aparte, como flete o seguro. Si ya están incluidos en el precio del producto, no los agregue de nuevo.</p>
                  <p class="text-xs leading-5 text-muted-fg">Los gastos propios de la compra se presupuestan en la orden; los reales se registran en la recepción para el retaceo.</p>
                  <div v-for="(expense, index) in offerForm.expenses" :key="index" class="grid items-end gap-3 border-t border-border pt-3 sm:grid-cols-2">
                    <label class="text-sm">Tipo de gasto<select v-model.number="expense.expenseTypeId" required class="field-control !h-9" :disabled="busy || !offerExpenseCapabilities.edit"><option :value="0" disabled>Seleccione</option><option v-for="type in offerExpenseTypes" :key="type.id" :value="type.id">{{ type.name }}</option></select></label>
                    <label class="text-sm">Monto<input v-model.number="expense.amount" type="number" min="0" step="0.01" required class="field-control !h-9" :disabled="busy || !offerExpenseCapabilities.edit" /></label>
                    <label class="text-sm sm:col-span-2">Descripción<input v-model="expense.description" maxlength="500" class="field-control !h-9" placeholder="Ej. Transporte hasta el almacén" :disabled="busy || !offerExpenseCapabilities.edit" /></label>
                    <label class="text-sm sm:col-span-2"><span class="sr-only">Cómo se cobra este gasto</span><select v-model="expense.chargeMode" :disabled="busy || !offerExpenseCapabilities.edit" class="field-control !h-9" aria-label="Cómo se cobra este gasto"><option value="fixed">Completo por orden</option><option value="proportional">Proporcional a productos comprados</option></select></label>
                    <button v-if="offerExpenseCapabilities.edit" type="button" class="justify-self-start text-sm font-medium text-danger disabled:opacity-50" :disabled="busy" :aria-label="'Quitar gasto ' + (index + 1)" @click="removeOfferExpense(index)">Quitar gasto</button>
                  </div>
                  <AppButton v-if="offerExpenseCapabilities.add" type="button" variant="outline" :disabled="busy || !catalogs.expenseTypes.length" @click="addOfferExpense">Agregar cargo</AppButton>
                  <p v-if="!catalogs.expenseTypes.length && offerExpenseCapabilities.add" class="text-xs text-muted-fg">Configure los tipos de gasto desde Retaceo.</p>
                </div>
              </details>
              <div class="space-y-3 px-5 py-4">
                <p class="text-sm font-semibold">Revisión de Compras</p>
                <label class="flex items-start gap-2.5 text-sm"><input v-model="offerForm.costsConfirmed" type="checkbox" class="mt-0.5 h-4 w-4 accent-accent" :disabled="busy" /><span>Revisé los cargos adicionales de esta oferta.<span class="mt-0.5 block text-xs leading-5 text-muted-fg">Están registrados arriba, incluidos en el precio o no aplican.</span></span></label>
                <label class="flex items-start gap-2.5 text-sm"><input v-model="offerForm.conditionsConfirmed" type="checkbox" class="mt-0.5 h-4 w-4 accent-accent" :disabled="busy" />Revisé pago, mínimo de compra y vigencia.</label>
                <p v-if="!offerForm.costsConfirmed || !offerForm.conditionsConfirmed" class="flex items-start gap-2 text-xs leading-5 text-muted-fg"><Info class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" /><span><span class="font-medium text-fg">Puede guardar la oferta.</span> La comparación será parcial hasta completar la revisión.</span></p>
              </div>
              <details :open="offerQuantityChanged">
                <summary class="cursor-pointer px-5 py-3.5 text-sm font-medium text-fg">Referencia de la oferta<span v-if="!offerQuantityChanged" class="ml-2 text-xs font-normal text-muted-fg">Opcional</span></summary>
                <div class="px-5 pb-4"><label class="block text-sm">Documento o comunicación de respaldo<input v-model="offerForm.providerConfirmation" maxlength="500" :required="offerQuantityChanged" class="field-control !h-9" placeholder="Número de cotización, correo o mensaje recibido" :disabled="busy" /></label>
                <p v-if="offerQuantityChanged" class="mt-2 text-xs text-warning">La cantidad cotizada difiere de la consultada. Identifique la oferta que respalda esa cantidad y su precio.</p></div>
              </details>
            </div>
          </div>


        </form>

        <QuotationComparison v-if="!offer && workspace === 'compare' && current" :key="'compare-' + current.id" embedded :process-id="current.id" @awarded="afterAward" />
        <section v-if="!offer && workspace === 'orders' && current.orders.length" class="rounded-[12px] border border-border bg-surface p-5 sm:p-6">
          <h2 class="text-lg font-semibold">Órdenes de esta compra</h2><p class="mt-1 text-sm text-muted-fg">Abra la orden para continuar con su aprobación y recepción.</p>
          <div class="mt-5 divide-y divide-border"><RouterLink v-for="o in current.orders" :key="o.id" :to="`/purchases/orders?id=${o.id}`" class="flex items-center justify-between gap-4 py-4 text-sm"><span class="font-medium text-accent">{{ o.code }}</span><span class="text-muted-fg">{{ orderStatusLabel(o.status) }}</span><span class="text-accent" aria-hidden="true">→</span></RouterLink></div>
        </section>
      </template>
    </div>
    <PurchaseActionDialog v-if="confirm" title="Confirmar adjudicación" description="Se generará una orden por proveedor con los productos y cantidades seleccionados. Revise cada orden antes de aprobarla." :busy="busy" :error="error" @close="confirm = false" @confirm="award" />
    <PurchaseActionDialog v-if="leaving || discardChanges" title="Descartar cambios" description="Tiene datos sin guardar en este proceso." :busy="false" @close="resolveDiscard(false)" @confirm="resolveDiscard(true)" />
  </AdminLayout>
</template>
