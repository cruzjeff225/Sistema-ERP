<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import PurchasesNav from '../components/purchases/PurchasesNav.vue';
import PurchaseSectionHeader from '../components/purchases/PurchaseSectionHeader.vue';
import PurchaseTabs from '../components/purchases/PurchaseTabs.vue';
import TrashButton from '../components/admin/TrashButton.vue';
import AppButton from '../components/base/AppButton.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { isCurrentPurchaseWeek } from '../utils/purchase-inbox';
import { filterQuotationProcesses, quotationProcessDay } from '../utils/quotation-process-inbox';
import { getApiErrorMessage } from '../utils/api-error';
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
const quantityStatus = computed(() => current.value?.quantityReviewStatus ?? 'draft');
const quantitiesAuthorized = computed(() => quantityStatus.value === 'approved' && current.value?.quantityApprovedRevision === current.value?.quantityRevision);
const canAdjustProposal = computed(() => !!current.value && !current.value.rfqs.length && !current.value.orders.length && (quantityStatus.value === 'pending_review' ? can('purchase_orders.approve') : ['draft','returned'].includes(quantityStatus.value) && can('purchase_quotations.update')));
const quantityStatusLabel = computed(() => ({ draft: 'Preparar cantidades', pending_review: 'Gerencia revisa las cantidades', approved: 'Cantidades autorizadas para cotizar', returned: 'Cantidades devueltas a Compras' } as Record<string,string>)[quantityStatus.value]);
const quantityDecision = ref<'submit'|'approve'|'return'|null>(null);
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
const quotes = computed(() => current.value?.rfqs.filter((r: any) => r.quotation) ?? []);
const receivedQuotes = computed(() => quotes.value.filter((r: any) => ['received', 'under_review', 'selected'].includes(r.quotation.status)));
const availableSuppliers = computed(() => catalogs.value.suppliers.filter((supplier: any) => !current.value?.rfqs.some((rfq: any) => rfq.supplierId === supplier.id)));
const activeOrders = computed(() => current.value?.orders.filter((order: any) => !['cancelled', 'rejected'].includes(order.status)) ?? []);
const pendingResponse = computed(() => current.value?.rfqs.find((rfq: any) => !rfq.quotation || rfq.quotation.status === 'draft'));
const remainingProducts = computed(() => current.value?.lines.filter((line: any) => Number(line.purchaseQuantity) > Number(line.purchasedQuantity ?? 0)).length ?? 0);
const nextStep = computed(() => {
  if (!quantitiesAuthorized.value) return { title: quantityStatusLabel.value, description: quantityStatus.value === 'returned' ? 'Revise las observaciones y ajuste los productos antes de volver a enviar.' : quantityStatus.value === 'pending_review' ? 'Gerencia puede ajustar qué y cuánto comprar antes de autorizar la consulta de precios.' : 'Revise lo solicitado por las sucursales y proponga cuánto comprar.', action: 'quantities' };
  if (activeOrders.value.length && !remainingProducts.value) return { title: 'Continuar con las órdenes', description: 'Los productos ya fueron asignados. Abra las órdenes para continuar con la aprobación y recepción.', action: 'orders' };
  if (receivedQuotes.value.length) return { title: 'Elegir la compra', description: `${receivedQuotes.value.length} ${receivedQuotes.value.length === 1 ? 'oferta recibida' : 'ofertas recibidas'}. Compare el costo y elija un proveedor o combine productos.`, action: 'compare' };
  if (pendingResponse.value) return { title: 'Registrar la respuesta del proveedor', description: 'Descargue el PDF para solicitar precios y registre la oferta cuando la reciba.', action: 'offer' };
  return { title: 'Consultar proveedores', description: 'Las cantidades están autorizadas. Seleccione un proveedor y los productos que desea cotizar.', action: 'suppliers' };
});
const canRegisterResponse = (rfq: any) => !!rfq && (!rfq.quotation ? can('purchase_quotations.create') : ['draft', 'received', 'selected', 'under_review'].includes(rfq.quotation.status) && !rfq.quotation.orders.some((order: any) => !['cancelled', 'rejected'].includes(order.status)) && can('purchase_quotations.update'));
const orderStatusLabel = (status: string) => ({ draft: 'Borrador', pending_approval: 'Pendiente de Gerencia', returned: 'Devuelta con observaciones', approved: 'Aprobada', sent: 'Enviada al proveedor', partially_received: 'Recepción parcial', received: 'Recibida', rejected: 'Rechazada', cancelled: 'Cancelada' } as Record<string, string>)[status] ?? status;
const localDate = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date(value));
const shortDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
const processLabel = (d: any) => `Gestión #${d.id} · ${shortDate(d.dateFrom)}${d.dateFrom.slice(0, 10) === d.dateTo.slice(0, 10) ? '' : ' – ' + shortDate(d.dateTo)}`;
const headers = (company = activeCompanyId.value) => ({ headers: { 'X-Company-Id': String(company) } });
function clearFilters() { documentSearch.value = ''; historyFrom.value = ''; historyTo.value = ''; }
function resetEditing() { quantityDecision.value = null; awardReference = null; offer.value = null; editingProduct.value = false; addingSupplier.value = false; selectedRequests.value = []; lineEdit.reason = ''; Object.keys(awards).forEach(k => delete awards[Number(k)]); }
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
function selectWorkspace(value: string) { if (!workspaceTabs.value.some(tab => tab.value === value) || value === workspace.value) return; if(value==='suppliers'&&!quantitiesAuthorized.value){error.value='Gerencia debe autorizar las cantidades antes de consultar proveedores.';return;} change(() => { workspace.value = value as typeof workspace.value; }); }
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
  } catch (e) { if (mounted && version === openVersion && company === activeCompanyId.value) error.value = getApiErrorMessage(e, 'No se pudo abrir la gestión de cotizaciones'); } finally { if (version === openVersion) opening.value = false; }
}
async function run(work: (scope: MutationScope) => Promise<void>) { if (busy.value || !activeCompanyId.value) return; const scope = { companyId: activeCompanyId.value, epoch: companyEpoch }; busy.value = true; error.value = ''; success.value = ''; try { await work(scope); } catch (e) { if (validScope(scope)) error.value = getApiErrorMessage(e, 'No se pudo guardar'); } finally { if (validScope(scope)) busy.value = false; } }
function create() { void run(async scope => { const r = await http.post('/supply/consolidations', { dateFrom: from.value || requests.value.filter(r => selectedRequests.value.includes(r.id)).map(r => localDate(r.requestDate)).sort()[0], dateTo: to.value || date(), requestIds: selectedRequests.value }, headers(scope.companyId)); if (!validScope(scope)) return; selectedRequests.value = []; selectedId.value = r.data.data.id; showNew.value = false; clearFilters(); documentTab.value = 'week'; await open(selectedId.value); if (!validScope(scope)) return; await load(); if (validScope(scope)) success.value = 'Productos cargados. Prepare las cantidades y envíelas a Gerencia antes de cotizar.'; }); }
function edit(line: any) { change(() => { editingProduct.value = true; Object.assign(lineEdit, { productId: line.productId, purchaseQuantity: Number(line.purchaseQuantity), reason: line.reason ?? '' }); initialProduct = JSON.stringify(lineEdit); }); }
function saveLine() { void run(async scope => { await http.patch(`/supply/consolidations/${selectedId.value}/lines`, {...lineEdit,expectedRevision:current.value?.quantityRevision}, headers(scope.companyId)); if (!validScope(scope)) return; await open(selectedId.value); if (validScope(scope)) success.value = 'Decisión registrada. La cantidad solicitada se conserva.'; }); }
function reviewQuantities(notes = '') { const action=quantityDecision.value,id=selectedId.value,revision=current.value?.quantityRevision;if(!action||!revision)return;void run(async scope => {await http.post(`/supply/consolidations/${id}/quantities/${action}`,{expectedRevision:revision,notes},headers(scope.companyId));if(!validScope(scope))return;quantityDecision.value=null;await open(id);if(!validScope(scope))return;await load();if(validScope(scope))success.value=action==='approve'?'Cantidades autorizadas. Compras puede consultar proveedores.':action==='submit'?'Cantidades enviadas a revisión de Gerencia.':'Propuesta devuelta con observaciones.';}); }
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
    <div class="mx-auto max-w-[1440px] space-y-6">
      <PurchasesNav />
      <PurchaseSectionHeader :title="offer ? 'Registrar oferta' : 'Gestionar cotizaciones'" :description="offer ? 'Complete la respuesta del proveedor para poder compararla.' : 'Revise los productos y consulte a los proveedores desde una misma compra.'">
        <template #actions>
          <RouterLink v-if="can('purchase_orders.view') && can('purchase_orders.approve')" to="/purchases/orders" class="text-sm font-medium text-accent">Volver a revisión de Gerencia</RouterLink>
          <RouterLink v-if="can('purchase_quotations.view')" to="/purchases/quotations" class="text-sm font-medium text-accent">Volver a cotizaciones</RouterLink>
          <template v-if="!offer">
            <AppButton variant="outline" :disabled="loading || opening || busy || changed" @click="load">Actualizar</AppButton>
            <AppButton v-if="can('purchase_quotations.create') && can('purchase_requests.view')" :variant="showNew ? 'outline' : 'primary'" :disabled="busy || loading || opening" @click="toggleNew">{{ showNew ? 'Cerrar nueva cotización' : 'Nueva cotización' }}</AppButton>
          </template>
        </template>
      </PurchaseSectionHeader>

      <p v-if="error" role="alert" class="rounded-xl bg-danger/10 p-4 text-sm text-danger">{{ error }}</p>
      <p v-if="success" role="status" class="rounded-xl bg-success/10 p-4 text-sm text-success">{{ success }}</p>

      <section v-if="!offer && !showNew" class="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <PurchaseTabs :model-value="documentTab" :items="[{ value: 'week', label: 'Esta semana' }, { value: 'all', label: 'Anteriores' }]" label="Antigüedad de las gestiones" :disabled="busy || loading || opening" @update:model-value="selectDocumentPeriod" />
          <details class="relative">
            <summary class="cursor-pointer text-sm font-medium text-muted-fg">Filtrar<span v-if="activeFilterCount" class="ml-2 rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-fg">{{ activeFilterCount }}</span></summary>
            <div class="absolute right-0 top-full z-30 mt-3 w-[min(320px,calc(100vw-3rem))] space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-subtle">
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

      <section v-if="can('purchase_quotations.create') && can('purchase_requests.view') && !offer && !opening && (showNew || !contextUnavailable && !documents.length && !loading)" class="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div><h2 class="text-lg font-semibold">Solicitudes para cotizar</h2><p class="mt-1 text-sm text-muted-fg">Seleccione las solicitudes que atenderá en esta compra.</p></div>
          <details class="max-w-full">
            <summary class="cursor-pointer text-sm font-medium text-muted-fg">Filtrar por fechas</summary>
            <div class="mt-3 flex flex-wrap gap-3"><label class="text-sm">Desde<input v-model="from" type="date" class="field-control" /></label><label class="text-sm">Hasta<input v-model="to" type="date" class="field-control" /></label></div>
          </details>
        </div>
        <div class="my-5 flex flex-wrap items-center justify-between gap-3">
          <PurchaseTabs :model-value="requestAgeTab" :items="[{ value: 'recent', label: 'Esta semana' }, { value: 'older', label: 'Anteriores' }]" label="Antigüedad de las solicitudes" :disabled="busy" @update:model-value="selectRequestPeriod" />
          <span class="text-sm text-muted-fg">{{ selectedRequests.length }} seleccionadas</span>
        </div>
        <div class="max-h-80 divide-y divide-border overflow-auto rounded-xl border border-border">
          <label v-for="r in eligible" :key="r.id" class="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-surface-secondary" :class="selectedRequests.includes(r.id) ? 'bg-accent-soft' : ''">
            <input v-model="selectedRequests" type="checkbox" :value="r.id" :disabled="busy" class="h-4 w-4 shrink-0" />
            <span class="min-w-0 flex-1"><strong class="block text-sm">{{ r.code }} · {{ r.branch.name }}</strong><span class="mt-1 block text-xs text-muted-fg">{{ shortDate(r.requestDate) }}</span></span>
            <span class="shrink-0 text-xs text-muted-fg">{{ r.details.length }} productos</span>
          </label>
          <p v-if="!eligible.length" class="p-6 text-center text-sm text-muted-fg">No hay solicitudes pendientes para estas fechas.</p>
        </div>
        <div class="mt-5 flex justify-end"><AppButton v-if="can('purchase_quotations.create')" :disabled="!selectedRequests.length || busy" @click="create">Continuar con los productos</AppButton></div>
      </section>

      <template v-if="current && !showNew && !opening && visibleDocuments.some(d => d.id === current.id)">
        <section v-if="!offer" class="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="max-w-2xl"><p class="mb-1 text-xs font-medium text-muted-fg">Siguiente paso</p><h2 class="text-lg font-semibold">{{ nextStep.title }}</h2><p class="mt-1 text-sm text-muted-fg">{{ nextStep.description }}</p></div>
            <div class="flex flex-wrap gap-2">
              <AppButton v-if="['draft','returned'].includes(quantityStatus) && can('purchase_quotations.update')" :disabled="busy || changed" @click="quantityDecision='submit'">Enviar cantidades a Gerencia</AppButton>
              <template v-if="quantityStatus==='pending_review' && can('purchase_orders.approve')">
                <AppButton variant="outline" :disabled="busy || changed" @click="quantityDecision='return'">Devolver con observaciones</AppButton>
                <AppButton :disabled="busy || changed" @click="quantityDecision='approve'">Autorizar cantidades para cotizar</AppButton>
              </template>
              <AppButton v-if="quantitiesAuthorized && !current.rfqs.length && can('purchase_orders.approve')" variant="outline" :disabled="busy || changed" @click="quantityDecision='return'">Devolver cantidades</AppButton>
              <AppButton v-if="nextStep.action === 'suppliers' && can('purchase_quotations.create')" :disabled="busy || changed" @click="change(() => { workspace = 'suppliers'; })">Preparar solicitud al proveedor</AppButton>
              <AppButton v-if="nextStep.action === 'offer' && canRegisterResponse(pendingResponse)" :disabled="busy || changed" @click="change(() => { workspace = 'suppliers'; startOffer(pendingResponse); })">{{ pendingResponse.quotation ? 'Completar oferta' : 'Registrar oferta' }}</AppButton>
              <RouterLink v-if="nextStep.action === 'compare' && can('purchase_quotations.view')" :to="'/purchases/comparison?id=' + selectedId" class="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground">Comparar y elegir ofertas</RouterLink>
              <AppButton v-if="nextStep.action === 'orders' && can('purchase_orders.view') && workspace !== 'orders'" :disabled="busy || changed" @click="change(() => { workspace = 'orders'; })">Ver órdenes</AppButton>
            </div>
          </div>
          <p v-if="current.quantityReviewNotes && !quantitiesAuthorized" class="mt-3 rounded-lg bg-surface-secondary p-3 text-sm"><strong class="font-medium">Observaciones de Gerencia:</strong> {{ current.quantityReviewNotes }}</p>
        </section>
        <div v-if="!offer" class="flex flex-wrap items-center justify-between gap-4">
          <PurchaseTabs :model-value="workspace" :items="workspaceTabs" label="Secciones de la gestión" :disabled="busy || loading" @update:model-value="selectWorkspace" />
          <div class="flex items-center gap-4">
            <details v-if="can('trash.delete')" class="relative">
              <summary class="cursor-pointer text-sm text-muted-fg">Más acciones</summary>
              <div class="absolute right-0 top-full z-30 mt-3 min-w-52 rounded-xl border border-border bg-surface p-3 shadow-subtle"><TrashButton entity="purchase_processes" :record-id="current.id" :label="current.code" :disabled="busy || changed" @deleted="load" /></div>
            </details>
          </div>
        </div>

        <section v-if="!offer && workspace === 'products'" class="overflow-hidden rounded-2xl border border-border bg-surface">
          <div class="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div><h2 class="text-lg font-semibold">Productos a cotizar</h2><p class="mt-1 text-sm text-muted-fg">Compras propone las cantidades y Gerencia las revisa antes de consultar precios.</p></div>
            <AppButton v-if="canAdjustProposal" variant="outline" :disabled="busy" @click="change(addProduct)">Agregar producto</AppButton>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[600px] text-left text-sm">
              <thead class="border-y border-border bg-surface-secondary text-xs text-muted-fg"><tr><th class="px-5 py-3 font-medium sm:px-6">Producto</th><th class="px-4 py-3 text-right font-medium">Solicitado</th><th class="px-4 py-3 text-right font-medium">A cotizar</th><th class="px-5 py-3 sm:px-6"><span class="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                <tr v-for="l in current.lines" :key="l.id" class="border-b border-border last:border-b-0">
                  <td class="px-5 py-4 sm:px-6">
                    <strong class="font-medium">{{ l.product.name }}</strong><span class="mt-1 block text-xs text-muted-fg">{{ l.unit.name }}<template v-if="l.reason"> · {{ l.reason }}</template></span>
                    <details v-if="l.sources.length" class="mt-2">
                      <summary class="cursor-pointer text-xs font-medium text-accent">Detalle por sucursal</summary>
                      <div class="mt-3 space-y-3 rounded-xl bg-surface-secondary p-3">
                        <div v-for="s in l.sources" :key="s.id"><p class="text-xs font-medium">{{ s.requestDetail.request.branch.name }} · {{ s.requestDetail.request.code }}</p><p class="mt-1 text-xs leading-relaxed text-muted-fg">{{ s.quantity }} solicitado · {{ s.dispatchedQuantity }} despachado · {{ s.distributedQuantity }} recibido · {{ s.pendingQuantity }} pendiente</p></div>
                      </div>
                    </details>
                    <span v-else class="mt-2 block text-xs text-muted-fg">Agregado por Compras</span>
                  </td>
                  <td class="px-4 py-4 text-right tabular-nums text-muted-fg">{{ l.requestedQuantity }}</td>
                  <td class="px-4 py-4 text-right font-semibold tabular-nums">{{ l.purchaseQuantity }}</td>
                  <td class="px-5 py-4 text-right sm:px-6"><AppButton v-if="canAdjustProposal" size="sm" variant="outline" :disabled="busy" @click="edit(l)">Modificar</AppButton></td>
                </tr>
              </tbody>
            </table>
          </div>
          <form v-if="editingProduct && canAdjustProposal" class="m-5 grid gap-4 rounded-xl border border-border bg-surface-secondary p-4 sm:m-6 sm:grid-cols-2" @submit.prevent="saveLine">
            <label class="text-sm">Producto existente o adicional<select v-model.number="lineEdit.productId" :disabled="!!current.rfqs.length" class="field-control" required><option :value="0" disabled>Seleccione</option><option v-for="p in catalogs.products" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
            <label class="text-sm">Cantidad propuesta para comprar<input v-model.number="lineEdit.purchaseQuantity" type="number" min="0" step="1" required class="field-control" /></label>
            <label class="text-sm sm:col-span-2">Motivo del cambio<input v-model="lineEdit.reason" required maxlength="1000" class="field-control" /></label>
            <div class="flex flex-wrap justify-end gap-3 sm:col-span-2"><AppButton type="button" variant="outline" :disabled="busy" @click="change(() => { editingProduct = false; })">Cancelar</AppButton><AppButton type="submit" :disabled="busy || !lineEdit.productId">Guardar decisión</AppButton></div>
          </form>
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-border p-5 sm:p-6">
            <p class="text-xs text-muted-fg">{{ current.rfqs.length ? 'Las cantidades consultadas se conservan. Compras elige las ofertas y Gerencia autoriza el importe final.' : quantitiesAuthorized ? 'Cantidades autorizadas. Prepare las solicitudes a proveedores.' : 'Autorice las cantidades antes de preparar los PDF para proveedores.' }}</p>
            <AppButton v-if="quantitiesAuthorized && can('purchase_quotations.view')" :disabled="busy" @click="change(() => { workspace = 'suppliers'; })">Continuar con proveedores</AppButton>
          </div>
        </section>

        <section v-if="!offer && workspace === 'suppliers' && quantitiesAuthorized" class="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div><h2 class="text-lg font-semibold">Consulta a proveedores</h2><p class="mt-1 text-sm text-muted-fg">Prepare el PDF y registre la oferta de cada proveedor.</p></div>
            <AppButton v-if="current.rfqs.length && availableSuppliers.length && can('purchase_quotations.create') && !addingSupplier" variant="outline" :disabled="busy" @click="addingSupplier = true">Consultar otro proveedor</AppButton>
          </div>
          <form v-if="(!current.rfqs.length || addingSupplier) && can('purchase_quotations.create')" class="mt-5 space-y-5 rounded-xl border border-border bg-surface-secondary p-4 sm:p-5" @submit.prevent="requestQuote">
            <label class="block max-w-lg text-sm font-medium">Proveedor<select v-model.number="supplierId" class="field-control" required><option :value="0" disabled>Seleccione</option><option v-for="s in availableSuppliers" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
            <p v-if="!availableSuppliers.length" class="text-sm text-muted-fg">No hay proveedores disponibles para una nueva consulta.</p>
            <fieldset><legend class="text-sm font-medium">Productos a consultar</legend><p class="mt-1 text-xs text-muted-fg">Puede consultar el mismo producto a varios proveedores.</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <label v-for="l in current.lines.filter((l: any) => Number(l.purchaseQuantity) > 0)" :key="l.id" class="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface p-3"><input v-model="rfqLineIds" type="checkbox" :value="l.id" :disabled="busy" class="h-4 w-4 shrink-0" /><span class="min-w-0 flex-1 text-sm">{{ l.product.name }}</span><span class="text-sm font-medium tabular-nums">{{ l.purchaseQuantity }}</span></label>
              </div>
            </fieldset>
            <div class="flex flex-wrap justify-end gap-3"><AppButton v-if="addingSupplier" type="button" variant="outline" :disabled="busy" @click="addingSupplier = false">Cancelar</AppButton><AppButton type="submit" :disabled="busy || !supplierId || !rfqLineIds.length">Preparar solicitud</AppButton></div>
          </form>
          <div v-if="current.rfqs.length" class="mt-5 divide-y divide-border">
            <div v-for="r in current.rfqs" :key="r.id" class="flex flex-wrap items-center justify-between gap-4 py-5">
              <div class="min-w-0"><h3 class="font-medium">{{ r.supplier.name }}</h3><p class="mt-1 text-xs text-muted-fg">{{ r.code }} · {{ !r.quotation ? 'Esperando oferta' : r.quotation.status === 'draft' ? 'Oferta por completar' : ['received', 'selected', 'under_review'].includes(r.quotation.status) ? 'Oferta registrada' : 'Oferta cerrada' }}</p><RouterLink v-if="r.quotation" :to="`/purchases/quotations?id=${r.quotation.id}`" class="mt-2 inline-block text-xs font-medium text-accent">Ver {{ r.quotation.code }}</RouterLink></div>
              <div class="flex flex-wrap items-center gap-3"><AppButton size="sm" variant="outline" :disabled="busy" @click="download(r)">Descargar PDF</AppButton><AppButton v-if="canRegisterResponse(r)" size="sm" :variant="r.quotation && r.quotation.status !== 'draft' ? 'outline' : 'primary'" :disabled="busy" @click="startOffer(r)">{{ !r.quotation ? 'Registrar oferta' : r.quotation.status === 'draft' ? 'Completar oferta' : 'Editar oferta' }}</AppButton></div>
            </div>
          </div>
        </section>

        <form v-if="offer" class="rounded-2xl border border-border bg-surface p-5 sm:p-6" @submit.prevent="saveOffer">
          <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="text-lg font-semibold">{{ offer.supplier.name }}</h2><p class="mt-1 text-xs text-muted-fg">Solicitud {{ offer.code }}</p></div><AppButton type="button" variant="outline" :disabled="busy" @click="change(() => { offer = null; })">Cerrar oferta</AppButton></div>
          <div class="my-6 grid gap-4 sm:grid-cols-3">
            <label class="text-sm">Fecha de oferta<input v-model="offerForm.quotationDate" type="date" required class="field-control" /></label><label class="text-sm">Vigente hasta<input v-model="offerForm.validUntil" type="date" required class="field-control" /></label><label class="text-sm">Moneda<input v-model="offerForm.currency" pattern="[A-Z]{3}" required class="field-control" /></label>
          </div>
          <details class="mb-6 rounded-xl border border-border p-4"><summary class="cursor-pointer text-sm font-medium text-muted-fg">Pago y entrega general</summary><div class="mt-4 grid gap-4 sm:grid-cols-2"><label class="text-sm">Condiciones de pago<input v-model="offerForm.paymentTerms" maxlength="100" class="field-control" /></label><label class="text-sm">Entrega general (días)<input v-model.number="offerForm.deliveryDays" type="number" min="0" required class="field-control" /></label></div></details>
          <h3 class="mb-4 text-sm font-semibold">Productos de la oferta</h3>
          <div class="grid items-start gap-4 xl:grid-cols-2">
            <section v-for="l in offerForm.details" :key="l.productId" class="rounded-xl border border-border p-4 sm:p-5">
              <div class="mb-4"><h4 class="font-medium">{{ l.productName }}</h4><p class="mt-1 text-xs text-muted-fg">Cantidad consultada: {{ consultedQuantity(l) }}</p></div>
              <label class="mb-4 block text-sm">Respuesta del proveedor<select v-model="l.availabilityStatus" class="field-control" required @change="changeAvailability(l)"><option v-if="l.availabilityStatus==='unconfirmed'" value="unconfirmed" disabled>Disponibilidad por confirmar</option><option value="available">Tiene este producto</option><option value="unavailable">No tiene este producto</option><option value="not_quoted">No cotizado</option></select></label>
              <div v-if="l.availabilityStatus==='available'" class="grid gap-4 sm:grid-cols-2"><label class="text-sm">Precio por unidad<input v-model.number="l.unitPrice" type="number" min="0.0001" step="0.0001" required class="field-control" :disabled="!!l.presentation" /></label><label class="text-sm">Cantidad disponible<input v-model.number="l.availableQuantity" type="number" min="1" :max="l.quantity" step="1" required class="field-control" /></label></div>
              <p v-else class="text-xs text-muted-fg">{{ l.availabilityStatus==='unconfirmed'?'La oferta anterior guardó cero. Confirme qué cantidad tiene el proveedor.':'Este producto no se incluirá en sus órdenes.' }}</p>
              <details v-if="l.availabilityStatus==='available'" class="mt-4"><summary class="cursor-pointer text-xs font-medium text-accent">Cantidad cotizada, presentación y mínimo</summary><div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="text-sm">Cantidad cotizada<input v-model.number="l.quantity" type="number" min="1" step="1" required class="field-control" /></label><label class="text-sm">Compra mínima (0 = ninguna)<input v-model.number="l.minimumQuantity" type="number" min="0" :max="l.quantity" step="1" class="field-control" /></label><label class="text-sm sm:col-span-2">Presentación del precio<input v-model="l.presentation" class="field-control" placeholder="Vacío: unidad de compra. Ej. Caja de 12" /></label><template v-if="l.presentation"><label class="text-sm">Unidades de compra por presentación<input v-model.number="l.unitsPerPack" type="number" min="1" step="1" required class="field-control" /></label><label class="text-sm">Precio por presentación<input v-model.number="l.presentationPrice" type="number" min="0.0001" step="0.0001" required class="field-control" /></label><p class="text-xs text-muted-fg sm:col-span-2">Precio normalizado por unidad: {{ offerMoney(Number(l.presentationPrice||0)/Number(l.unitsPerPack||1)) }}</p></template></div></details>
              <details class="mt-4"><summary class="cursor-pointer text-xs font-medium text-accent">Descuento, impuesto y condiciones</summary><div class="mt-4 grid gap-3 sm:grid-cols-3"><label class="text-sm">Descuento total<input v-model.number="l.discount" type="number" min="0" step="0.01" class="field-control" /></label><label class="text-sm">Impuesto %<input v-model.number="l.taxRate" type="number" min="0" max="100" step="0.01" class="field-control" /></label><label class="text-sm">Entrega (días)<input v-model.number="l.deliveryDays" type="number" min="0" class="field-control" /></label><label class="text-sm sm:col-span-3">Disponibilidad y condiciones<input v-model="l.notes" maxlength="1000" class="field-control" /></label></div></details>
            </section>
          </div>
          <details v-if="offerForm.expenses.length || offerExpenseCapabilities.add" class="mt-6 rounded-xl border border-border p-4">
            <summary class="cursor-pointer text-sm font-medium text-muted-fg">Cargos adicionales de la oferta<span v-if="offerForm.expenses.length" class="ml-2 text-fg">{{ offerMoney(offerExpenseTotal) }}</span><span v-else class="ml-2 text-xs font-normal">Opcional</span></summary>
            <div class="mt-4 space-y-3">
              <p class="text-xs leading-5 text-muted-fg">Importes que el proveedor cobra aparte, como flete o seguro. Si ya están incluidos en el precio del producto, no los agregue de nuevo.</p>
              <p class="text-xs leading-5 text-muted-fg">Los gastos propios de la compra se presupuestan en la orden; los reales se registran en la recepción para el retaceo.</p>
              <div v-for="(expense, index) in offerForm.expenses" :key="index" class="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(140px,1fr)_minmax(160px,2fr)_130px_36px]">
                <label class="text-sm">Tipo de gasto<select v-model.number="expense.expenseTypeId" required class="field-control" :disabled="busy || !offerExpenseCapabilities.edit"><option :value="0" disabled>Seleccione</option><option v-for="type in offerExpenseTypes" :key="type.id" :value="type.id">{{ type.name }}</option></select></label>
                <label class="text-sm">Descripción<input v-model="expense.description" maxlength="500" class="field-control" placeholder="Ej. Transporte hasta el almacén" :disabled="busy || !offerExpenseCapabilities.edit" /></label>
                <label class="text-sm">Monto<input v-model.number="expense.amount" type="number" min="0" step="0.01" required class="field-control" :disabled="busy || !offerExpenseCapabilities.edit" /><select v-model="expense.chargeMode" :disabled="busy || !offerExpenseCapabilities.edit" class="field-control mt-2" aria-label="Cómo se cobra este gasto"><option value="fixed">Completo por orden</option><option value="proportional">Proporcional a productos comprados</option></select></label>
                <button v-if="offerExpenseCapabilities.edit" type="button" class="icon-button text-danger" :disabled="busy" :aria-label="'Quitar gasto ' + (index + 1)" @click="removeOfferExpense(index)">×</button>
              </div>
              <AppButton v-if="offerExpenseCapabilities.add" type="button" variant="outline" :disabled="busy || !catalogs.expenseTypes.length" @click="addOfferExpense">Agregar cargo</AppButton>
              <p v-if="!catalogs.expenseTypes.length && offerExpenseCapabilities.add" class="text-xs text-muted-fg">Configure los tipos de gasto desde Retaceo.</p>
            </div>
          </details>
          <div class="mt-6 space-y-3 border-t border-border pt-5">
            <p class="text-sm font-medium">Revisión de Compras</p>
            <label class="flex items-start gap-2 text-sm"><input v-model="offerForm.costsConfirmed" type="checkbox" class="mt-1" :disabled="busy" /><span>Revisé los cargos adicionales de esta oferta.<span class="mt-1 block text-xs leading-5 text-muted-fg">Están registrados arriba, incluidos en el precio o no aplican.</span></span></label>
            <label class="flex items-start gap-2 text-sm"><input v-model="offerForm.conditionsConfirmed" type="checkbox" class="mt-1" :disabled="busy" />Revisé pago, mínimo de compra y vigencia.</label>
            <p v-if="!offerForm.costsConfirmed || !offerForm.conditionsConfirmed" class="text-xs text-warning">Puede guardar la oferta. La comparación será parcial hasta completar la revisión.</p>
          </div>
          <details class="mt-5 rounded-xl border border-border p-4" :open="offerQuantityChanged">
            <summary class="cursor-pointer text-sm font-medium text-muted-fg">Referencia de la oferta<span v-if="!offerQuantityChanged" class="ml-2 text-xs font-normal">Opcional</span></summary>
            <label class="mt-4 block text-sm">Documento o comunicación de respaldo<input v-model="offerForm.providerConfirmation" maxlength="500" :required="offerQuantityChanged" class="field-control" placeholder="Número de cotización, correo o mensaje recibido" :disabled="busy" /></label>
            <p v-if="offerQuantityChanged" class="mt-2 text-xs text-warning">La cantidad cotizada difiere de la consultada. Identifique la oferta que respalda esa cantidad y su precio.</p>
          </details>
          <div v-if="offerForm.currency!=='USD'" class="mt-5 grid gap-3 sm:grid-cols-2"><label class="text-sm">USD por {{ offerForm.currency }} (opcional)<input v-model.number="offerForm.exchangeRateToUsd" type="number" min="0.00000001" step="0.00000001" class="field-control" /></label><label class="text-sm">Fecha del tipo de cambio<input v-model="offerForm.exchangeRateDate" type="date" :max="date()" :required="!!offerForm.exchangeRateToUsd" class="field-control" /></label></div>
          <div class="mt-6 flex flex-wrap justify-end gap-3"><AppButton type="button" variant="outline" :disabled="busy" @click="change(() => { offer = null; })">Cancelar</AppButton><AppButton type="submit" :disabled="busy">Guardar oferta recibida</AppButton></div>
        </form>

        <section v-if="!offer && workspace === 'compare'" class="rounded-2xl border border-border bg-surface p-6"><h2 class="text-lg font-semibold">Comparar ofertas</h2><RouterLink :to="'/purchases/comparison?id=' + selectedId" class="mt-4 inline-block rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground">Elegir proveedor por producto</RouterLink></section>
        <section v-if="!offer && workspace === 'orders' && current.orders.length" class="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h2 class="text-lg font-semibold">Órdenes de esta compra</h2><p class="mt-1 text-sm text-muted-fg">Abra la orden para continuar con su aprobación y recepción.</p>
          <div class="mt-5 divide-y divide-border"><RouterLink v-for="o in current.orders" :key="o.id" :to="`/purchases/orders?id=${o.id}`" class="flex items-center justify-between gap-4 py-4 text-sm"><span class="font-medium text-accent">{{ o.code }}</span><span class="text-muted-fg">{{ orderStatusLabel(o.status) }}</span><span class="text-accent" aria-hidden="true">→</span></RouterLink></div>
        </section>
      </template>
    </div>
    <PurchaseActionDialog v-if="confirm" title="Confirmar adjudicación" description="Se generará una orden por proveedor con los productos y cantidades seleccionados. Revise cada orden antes de aprobarla." :busy="busy" :error="error" @close="confirm = false" @confirm="award" />
    <PurchaseActionDialog v-if="quantityDecision" :title="quantityDecision==='approve'?'Autorizar cantidades':quantityDecision==='submit'?'Enviar cantidades a Gerencia':'Devolver propuesta'" :description="quantityDecision==='approve'?'Estas cantidades serán la base de los PDF para proveedores. Lo solicitado originalmente se conserva.':quantityDecision==='submit'?'Gerencia podrá aumentar, reducir o agregar productos antes de consultar proveedores.':'Compras recibirá sus observaciones para ajustar la propuesta.'" :require-reason="quantityDecision==='return'" :busy="busy" :error="error" @close="quantityDecision=null" @confirm="reviewQuantities" />
    <PurchaseActionDialog v-if="leaving || discardChanges" title="Descartar cambios" description="Tiene datos sin guardar en este proceso." :busy="false" @close="resolveDiscard(false)" @confirm="resolveDiscard(true)" />
  </AdminLayout>
</template>
