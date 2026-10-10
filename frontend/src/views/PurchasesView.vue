<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import { activeCompanyId } from "../services/company-context";
import PurchaseActionDialog from "../components/base/PurchaseActionDialog.vue";
import AdminLayout from "../layouts/AdminLayout.vue";
import PurchasesNav from "../components/purchases/PurchasesNav.vue";
import PurchaseSectionHeader from "../components/purchases/PurchaseSectionHeader.vue";
import PurchaseTabs from "../components/purchases/PurchaseTabs.vue";
import AppBadge from "../components/base/AppBadge.vue";
import TrashButton from "../components/admin/TrashButton.vue";
import AppButton from "../components/base/AppButton.vue";
import TrackingLink from "../components/purchases/TrackingLink.vue";
import AppInput from "../components/base/AppInput.vue";
import { usePermissions } from "../composables/usePermissions";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { http } from "../services/http.service";
import { getApiErrorMessage } from "../utils/api-error";
import { projectComparisonExpenses } from '../utils/quotation-comparison';
import { isPendingPurchase, purchaseStage, isCurrentPurchaseWeek } from '../utils/purchase-inbox';
import { receiptProgress, purchasePurposeLabel, onlyOptionId, quotationPendingLines, nextOrderReceipt, receiptNextStep, orderNeedsAttention, orderReceiptStage } from "../utils/purchase-workflow";

type Section = "requests" | "quotations" | "orders";
type Catalogs = {
  generalWarehouse?: { id: number; name: string; branchId: number; branch: { name: string } } | null;
  branches: Array<{ id: number; name: string; warehouses: Array<{ id: number; name: string; locations: Array<{ id: number; code: string; aisle: string; rack: string; level: string; position: string }> }> }>;
  products: Array<{ id: number; sku: string; internalCode: string; name: string; purchaseUnit: { id: number; name: string } }>;
  suppliers: Array<{ id: number; code: string; name: string }>;
  expenseTypes: Array<{ id: number; name: string }>;
};
type RequestLine = { productId: number; quantity: any; unitId: number; description: string; notes: string };
type QuoteSource = { requestDetailId: number; quantity: number };
type QuoteLine = { productId: number; quantity: any; unitId: number; unitPrice: any; discount: any; taxRate: any; deliveryDays: any; availableQuantity: any; notes: string; sources: QuoteSource[] };
type ExpenseLine = { id?: number; expenseTypeId: number; description: string; amount: any };

const props = defineProps<{ section: Section }>();
const { can } = usePermissions();
const route = useRoute();
const router = useRouter();
let loadVersion = 0;
let mounted = true;
const pendingAction = ref<{ path: string; title: string; description: string; success: string; reason: boolean; method?: "delete" } | null>(null);
const orderSelections = ref<Array<{ quotationDetailId: number; productName: string; pending: number; quantity: number | string }>>([]);
const catalogs = ref<Catalogs>({ branches: [], products: [], suppliers: [], expenseTypes: [] });
const requests = ref<any[]>([]);
const quotations = ref<any[]>([]);
const orders = ref<any[]>([]);
const selectedId = ref<number | null>(null);
const search = ref("");
const statusFilter = ref("");
const pendingOnly = ref(false);
const requestAgeTab = ref<'recent' | 'older'>('recent');
const historyFrom = ref(''), historyTo = ref('');
const documentDate = (record: any) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date(record.quotationDate || record.orderDate || record.requestDate || record.createdAt));
const requestInTab = (record: any) => isCurrentPurchaseWeek(record.quotationDate || record.orderDate || record.requestDate || record.createdAt);
const activeFilterCount = computed(() => Number(!!statusFilter.value) + Number(pendingOnly.value) + Number(!!historyFrom.value) + Number(!!historyTo.value));
function clearFilters() { search.value = ''; statusFilter.value = ''; pendingOnly.value = false; historyFrom.value = ''; historyTo.value = ''; }
const handledSupplier = ref('');
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const drawer = ref<"request" | "quotation" | "order" | "receive" | null>(null);
const editingId = ref<number | null>(null);
const orderQuotation = ref<any | null>(null);
const discardChanges = ref(false);
let initialForm = '';
const { leaving, resolveLeave } = useUnsavedChanges(
  () => !!drawer.value && initialForm !== formSnapshot(),
  () => saving.value,
);

const requestForm = reactive({ branchId: 0, warehouseId: 0, requiredDate: "", justification: "", purpose: "", notes: "", details: [] as RequestLine[] });
const quotationForm = reactive({ supplierId: 0, requestIds: [] as number[], quotationDate: "", validUntil: "", currency: "USD", paymentTerms: "", deliveryDays: 0 as any, notes: "", details: [] as QuoteLine[], expenses: [] as ExpenseLine[] });
const orderForm = reactive({ branchId: 0, warehouseId: 0, expectedDate: "", paymentTerms: "", notes: "",quotationId:0,confirmationReason:'',confirmOfferChanges:false,managementReview:false,details:[] as any[],expenses: [] as ExpenseLine[] });
const editableOrderQuotes=ref<any[]>([]);
const canEditOrder = computed(() => props.section==='orders' && !!selected.value && ['draft','returned'].includes(selected.value.status) && can('purchase_orders.update'));
const pendingQuantityReviews = ref<any[]>([]);
const orderEditTotals = computed(() => {
  let gross=0,subtotal=0,tax=0;
  for(const line of orderForm.details){const g=roundMoney(Number(line.quantity)*Number(line.unitPrice));const net=roundMoney(g-Number(line.discount||0));gross+=g;subtotal+=net;tax+=roundMoney(net*Number(line.taxRate||0)/100);}
  let expenses=roundMoney(orderForm.expenses.reduce((n,e)=>n+Number(e.amount||0),0));
  const current=selected.value,quote=orderQuotation.value;
  const unchanged=current&&JSON.stringify(orderForm.expenses.map(e=>[e.id,e.expenseTypeId,e.description||'',Number(e.amount)]))===JSON.stringify(current.expenses.map((e:any)=>[e.id,e.expenseTypeId,e.description||'',Number(e.amount)]));
  if(current&&quote?.expenses&&unchanged&&orderForm.quotationId===current.quotationId){const before=current.details.reduce((n:number,d:any)=>n+Number(d.subtotal)+Number(d.discount),0);expenses=projectComparisonExpenses({...quote,orders:[{status:'draft',expenses:current.expenses}]},before,gross-before,Number(quote.subtotal)).total;}
  return {subtotal:roundMoney(subtotal),tax:roundMoney(tax),expenses,total:roundMoney(subtotal+tax+expenses)};
});
const receiveForm = reactive({ requestId: '', supplierInvoiceNumber: "", supplierInvoiceDate: "", notes: "", items: [] as Array<{ orderDetailId: number; locationId: number; quantity: any }> });
const preparingReceipt = ref(false);
const receiptReview = ref<{ payload: { requestId: string; supplierInvoiceNumber?: string; supplierInvoiceDate?: string; notes?: string; items: { orderDetailId: number; locationId?: number; quantity: number }[] }; description: string } | null>(null);

const sectionMeta = computed(() => ({
  requests: { title: "Solicitudes de compra", eyebrow: "Abastecimiento de proveedores", subtitle: "Prepara la solicitud de tu sucursal y envíala a Compras.", icon: ClipboardCheck, create: "Nueva solicitud" },
  quotations: { title: "Cotizaciones", eyebrow: "Evaluación de proveedores", subtitle: "Compara costos, disponibilidad y tiempos antes de decidir.", icon: FileSearch, create: "Registrar cotización" },
  orders: { title: "Órdenes de compra", eyebrow: "Compra autorizada", subtitle: "Revisa la compra, envíala al proveedor y registra lo recibido.", icon: ShoppingCart, create: "" },
})[props.section]);
const records = computed(() => [...(props.section === "requests" ? requests.value : props.section === "quotations" ? quotations.value : orders.value)].sort((a, b) => new Date(b.requestDate || b.quotationDate || b.orderDate || b.createdAt).getTime() - new Date(a.requestDate || a.quotationDate || a.orderDate || a.createdAt).getTime() || b.id - a.id));
const selected = computed(() => filteredRecords.value.find((record) => record.id === selectedId.value) ?? null);
const filteredRecords = computed(() => {
  const term = search.value.trim().toLowerCase();
  return records.value.filter((record) => {
    const text = `${record.code} ${purchasePurposeLabel(record.purpose)} ${record.justification ?? ""} ${record.supplier?.name ?? ""} ${record.branch?.name ?? ""}`.toLowerCase();
    const pending = isPendingPurchase(props.section, record.status)
      && (props.section !== 'orders' || orderNeedsAttention(record))
      && (props.section !== 'quotations' || (record.validUntil?.slice(0, 10) >= dateValue() && (record.status !== 'selected' || quotationPendingLines(record).length > 0)));
    return (requestAgeTab.value === 'older' || requestInTab(record)) && (requestAgeTab.value !== 'older' || ((!historyFrom.value || documentDate(record) >= historyFrom.value) && (!historyTo.value || documentDate(record) <= historyTo.value))) && (!term || text.includes(term)) && (!statusFilter.value || record.status === statusFilter.value) && (!pendingOnly.value || pending);
  });
});
// The tracking view understands requests, offers and orders; the other sections have their own link.
const trackingType = computed(() => ({ requests: 'request', quotations: 'quotation', orders: 'order' } as Record<string, 'request' | 'quotation' | 'order'>)[props.section]);
const nextAction = computed(() => {
  const r = selected.value;
  if (!r || ['cancelled','expired','closed','fulfilled'].includes(r.status) || r.status === 'rejected' && props.section !== 'requests') return null;
  const action = (label: string, permission: string, run: () => void) => can(permission) ? { label, run } : null;
  if (props.section === 'requests') {
    if (r.status === 'rejected') return action('Corregir solicitud', 'purchase_requests.update', () => editRequest(r));
    if (r.status === 'draft') return action(r.purpose ? 'Enviar a Compras' : 'Completar solicitud', 'purchase_requests.update', () => r.purpose ? void workflow('/purchase-requests/' + r.id + '/submit', 'Solicitud enviada a Compras') : editRequest(r));
    if (r.status === 'in_procurement' && (r.details ?? []).some((d: any) => Number(d.receivedFromPurchases) > 0 && Number(d.dispatchedQuantity) < Number(d.quantity))) return action('Entregar a sucursal', 'inventory.view', () => { void router.push({ path: '/inventory/warehouse', query: { requestId: String(r.id) } }); });
    if (['submitted','approved','in_quotation','partially_ordered','in_procurement'].includes(r.status)) return action('Continuar en Cotizaciones', 'purchase_quotations.view', () => newQuotation(r));
    return action('Ver entregas a sucursal', 'inventory.view', () => { void router.push({ path: '/inventory/warehouse', query: { requestId: String(r.id) } }); });
  }
  if (props.section === 'quotations') {
    if (r.rfq) return action(r.status === 'draft' ? 'Completar oferta' : 'Comparar y elegir productos', r.status === 'draft' ? 'purchase_quotations.update' : 'purchase_quotations.view', () => { void router.push({ path: r.status === 'draft' ? '/purchases/quotations/manage' : '/purchases/comparison', query: { id: String(r.rfq.consolidationId), ...(r.status === 'draft' ? { rfqId: String(r.rfq.id) } : {}) } }); });
    if (r.status === 'draft') return action('Confirmar oferta recibida', 'purchase_quotations.update', () => { void workflow('/purchase-quotations/' + r.id + '/receive', 'Oferta recibida'); });
    if (['received','under_review'].includes(r.status) && !quoteExpired.value) return action('Elegir oferta', 'purchase_quotations.select', () => { void workflow('/purchase-quotations/' + r.id + '/select', 'Oferta seleccionada'); });
    if (r.status === 'selected' && pendingOrderLines.value.length && !quoteExpired.value) return action('Crear orden de compra', 'purchase_orders.create', () => newOrder(r));
  }
  if (props.section === 'orders') {
    if (r.status === 'returned') return action('Revisar observaciones', 'purchase_orders.update', () => { detailView.value='approval'; });
    if (r.status === 'draft') return action('Enviar a Gerencia', 'purchase_orders.update', () => { void workflow('/purchase-orders/' + r.id + '/submit', 'Orden enviada a aprobación'); });
    if (r.status === 'pending_approval') return action('Revisar para aprobar', 'purchase_orders.approve', () => { detailView.value='approval'; });
    if (r.status === 'approved') return action('Marcar enviada al proveedor', 'purchase_orders.send', () => { void workflow('/purchase-orders/' + r.id + '/send', 'Orden enviada'); });
    const receipt = nextOrderReceipt(r.purchases);
    if (['partially_received', 'received'].includes(r.status) && receipt) {
      const step = receiptNextStep(receipt).step;
      if (step === 'placement' && can('inventory.view') && can('purchases.view')) return action('Ubicar productos', 'inventory.view', () => { void router.push({ path: '/inventory/warehouse', query: { purchaseId: String(receipt.id) } }); });
      if (step === 'cost' && can('retaceos.view')) return action('Continuar en Retaceo', 'retaceos.view', () => { void router.push({ path: '/purchases/retaceos', query: { purchaseId: String(receipt.id) } }); });
      return action(step === 'verify' ? 'Verificar recepción' : step === 'close' ? 'Cerrar recepción' : 'Ver recepción pendiente', 'purchases.view', () => { void router.push('/purchases/receipts?id=' + receipt.id); });
    }
    if (['sent','partially_received'].includes(r.status)) return action('Registrar recepción', can('purchase_orders.receive') ? 'purchase_orders.receive' : 'purchases.create', () => { void openReceive(r); });
  }
  return null;
});
const secondaryActions = computed(() => {
 const r = selected.value; if (!r) return false; if(can('trash.delete')) return true;
 if (props.section === 'requests') return ['draft','rejected'].includes(r.status) && can('purchase_requests.update') || r.status === 'submitted' && (can('purchase_requests.approve') || can('purchase_requests.reject')) || ['draft','submitted','approved','in_quotation','partially_ordered'].includes(r.status) && can('purchase_requests.cancel') || !['draft','rejected','cancelled'].includes(r.status) && can('inventory.view');
 if (props.section === 'quotations') return ['draft','received'].includes(r.status) && can('purchase_quotations.update') || ['received','under_review'].includes(r.status) && can('purchase_quotations.reject') || ['draft','received','under_review'].includes(r.status) && can('purchase_quotations.cancel');
 return ['draft','returned'].includes(r.status) && can('purchase_orders.update') || ['draft','returned','rejected','pending_approval','approved','sent'].includes(r.status) && can('purchase_orders.cancel') || ['sent','partially_received'].includes(r.status) && (can('purchase_orders.receive') || can('purchases.create'));
});
const selectedStage = computed(() => selected.value && props.section === 'orders' && selected.value.status === 'received' ? orderReceiptStage(selected.value) : selected.value ? purchaseStage(props.section, selected.value.status) : '');
const expandedAmounts = ref(false);
const detailView = ref('products');
const detailTabs = computed(() => [
  { value: 'products', label: 'Productos' },
  ...(props.section==='orders'?[{value:'approval',label:'Gerencia'}]:[]),
  ...(props.section === 'requests' ? [{ value: 'deliveries', label: 'Entregas' }] : []),
  ...(props.section === 'orders' ? [{ value: 'receipts', label: 'Recepciones', count: selected.value?.purchases?.length ?? 0 }] : []),
  ...(props.section !== 'requests' ? [{ value: 'costs', label: 'Gastos y total' }] : []),
  { value: 'information', label: 'Información' },
]);
function selectDetailView(value: string) {
  if (!saving.value && detailTabs.value.some(tab => tab.value === value)) detailView.value = value;
}
const inboxTitle = computed(() => ({ requests: 'Solicitudes', quotations: 'Ofertas recibidas', orders: 'Órdenes' })[props.section]);
const requestWarehouses = computed(() => catalogs.value.generalWarehouse ? [catalogs.value.generalWarehouse] : []);
const orderWarehouses = computed(() => catalogs.value.branches.find((branch) => branch.id === orderForm.branchId)?.warehouses ?? []);
const receiveLocations = computed(() => {
  const order = orders.value.find((item) => item.id === editingId.value);
  return catalogs.value.branches.flatMap((branch) => branch.warehouses).find((warehouse) => warehouse.id === order?.warehouseId)?.locations ?? [];
});
const receiptRows = computed(() => receiveForm.items.map(item => {
  const line = selected.value?.details.find((detail: any) => detail.id === item.orderDetailId);
  const pending = line ? roundMoney(Number(line.quantity) - Number(line.receivedQuantity)) : 0;
  return { item, line, pending, remaining: Math.max(0, roundMoney(pending - Number(item.quantity || 0))) };
}));
const eligibleRequests = computed(() => requests.value.filter((request) => ["approved", "in_quotation", "partially_ordered"].includes(request.status)));
const pendingOrderLines = computed(() => props.section === 'quotations' && selected.value ? quotationPendingLines(selected.value) : []);
const quoteExpired = computed(() => props.section === 'quotations' && selected.value?.validUntil.slice(0, 10) < dateValue());
const relatedDocuments = computed(() => {
  const record = selected.value;
  if (!record) return [];
  const links: { id: number; code: string; label: string; section: Section; status: string; permission: string }[] = [];
  if (props.section === 'requests') {
    for (const link of record.quotationLinks ?? []) links.push({ ...link.quotation, label: 'Cotización', section: 'quotations', permission: 'purchase_quotations.view' });
  } else if (props.section === 'quotations') {
    for (const link of record.requestLinks ?? []) links.push({ ...link.request, label: 'Solicitud', section: 'requests', permission: 'purchase_requests.view' });
    for (const order of record.orders ?? []) links.push({ ...order, label: 'Orden', section: 'orders', permission: 'purchase_orders.view' });
  } else if (record.quotation) {
    links.push({ ...record.quotation, label: 'Cotización', section: 'quotations', permission: 'purchase_quotations.view' });
  }
  return links.filter(link => can(link.permission));
});
const statusOptions = computed(() => ({
  requests: ["in_procurement", "partially_distributed", "fulfilled", "draft", "submitted", "approved", "in_quotation", "partially_ordered", "completed", "rejected", "cancelled"],
  quotations: ["draft", "received", "under_review", "selected", "rejected", "expired", "cancelled"],
  orders: ["draft", "returned","rejected","pending_approval", "approved", "sent", "partially_received", "received", "cancelled", "closed"],
})[props.section]);
const quoteTotals = computed(() => {
  const subtotal = quotationForm.details.reduce((sum, line) => sum + roundMoney(Number(line.quantity || 0) * Number(line.unitPrice || 0)), 0);
  const discount = quotationForm.details.reduce((sum, line) => sum + Number(line.discount || 0), 0);
  const tax = quotationForm.details.reduce((sum, line) => {
    const net = Number(line.quantity || 0) * Number(line.unitPrice || 0) - Number(line.discount || 0);
    return sum + roundMoney(Math.max(0, roundMoney(net)) * (Number(line.taxRate || 0) / 100));
  }, 0);
  const expenses = quotationForm.expenses.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return { subtotal: roundMoney(subtotal), discount: roundMoney(discount), tax: roundMoney(tax), expenses: roundMoney(expenses), total: roundMoney(subtotal - discount + tax + expenses) };
});

function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function dateValue(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function money(value: number | string, currency = (drawer.value === "quotation" ? quotationForm.currency : selected.value?.currency) ?? "USD") {
  return new Intl.NumberFormat("es-SV", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD" }).format(Number(value ?? 0));
}

function shortDate(value: string | null | undefined) {
  if (!value) return 'Por confirmar';
  return new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: string) {
  return ({
    draft: "Borrador", returned:'Devuelta con observaciones', submitted: "Enviada a Compras", approved: "Aprobada", rejected: "Rechazada", in_quotation: "En cotización",
    partially_ordered: "Ordenada parcialmente", completed: "Ordenada completamente", cancelled: "Cancelada", received: "Recibida",
    in_procurement: "En Compras", partially_distributed: "Distribución parcial", fulfilled: "Entregada a sucursal", under_review: "En evaluación", selected: "Seleccionada", expired: "Vencida", pending_approval: "Pendiente de aprobación",
    sent: "Enviada al proveedor", partially_received: "Recepción parcial", closed: "Cerrada",
    RECEIVED: 'Recibida', VERIFIED: 'Verificada', COSTED: 'Retaceada', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
  } as Record<string, string>)[status] ?? status;
}

function statusVariant(status: string): "success" | "danger" | "warning" | "info" | "neutral" {
  if (["approved", "selected", "received", "completed", "closed", "fulfilled"].includes(status)) return "success";
  if (["rejected", "cancelled", "expired"].includes(status)) return "danger";
  if (["returned","submitted", "pending_approval", "under_review", "partially_ordered", "partially_received"].includes(status)) return "warning";
  if (["in_quotation", "sent"].includes(status)) return "info";
  return "neutral";
}

function showError(error: unknown, fallback: string) {
  successMessage.value = "";
  errorMessage.value = getApiErrorMessage(error, fallback);
}

function showSuccess(message: string) {
  errorMessage.value = "";
  successMessage.value = message;
}

async function load() {
  const version = ++loadVersion;
  const companyId = activeCompanyId.value;
  if (!companyId) { loading.value = false; return; }
  const config = { headers: { "X-Company-Id": String(companyId) } };
  loading.value = true;
  try {
    const [catalogResponse, requestResponse, quotationResponse, orderResponse, quantityReviews] = await Promise.all([
      http.get("/purchase-catalogs", config),
      can("purchase_requests.view") ? http.get("/purchase-requests", config) : Promise.resolve({ data: { data: [] } }),
      can("purchase_quotations.view") ? http.get("/purchase-quotations", config) : Promise.resolve({ data: { data: [] } }),
      can("purchase_orders.view") ? http.get("/purchase-orders", config) : Promise.resolve({ data: { data: [] } }),
      props.section === "orders" && can("purchase_orders.approve") ? http.get("/supply/consolidations", config) : Promise.resolve({ data: { data: [] } }),
    ]);
    if (!mounted || version !== loadVersion || companyId !== activeCompanyId.value) return;
    catalogs.value = catalogResponse.data.data;
    requests.value = requestResponse.data.data;
    quotations.value = quotationResponse.data.data;
    orders.value = orderResponse.data.data;
    pendingQuantityReviews.value = quantityReviews.data.data.filter((p:any)=>p.quantityReviewStatus==='pending_review');
    const requested = Number(route.query.id);
    const linked = records.value.find(record => record.id === requested);
    if (route.query.id) {
      if (linked) { if (!requestInTab(linked)) requestAgeTab.value = 'older'; selectedId.value = requested; }
      else { selectedId.value = null; showError(null, 'El documento no está disponible en esta empresa.'); }
    } else if (!filteredRecords.value.some((record) => record.id === selectedId.value)) selectedId.value = filteredRecords.value[0]?.id ?? null;
    const supplierId = typeof route.query.supplier === 'string' ? route.query.supplier : '';
    if (props.section === 'quotations' && supplierId && supplierId !== handledSupplier.value && can('purchase_quotations.create')) {
      handledSupplier.value = supplierId;
      const supplier = catalogs.value.suppliers.find(item => String(item.id) === supplierId);
      if (supplier) { newQuotation(); quotationForm.supplierId = supplier.id; }
      else showError(null, 'El proveedor no está disponible para cotizar.');
    }
  } catch (error) {
    if (mounted && version === loadVersion && companyId === activeCompanyId.value) showError(error, "No se pudo cargar el proceso de compras");
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

async function runMutation(operation: (config: { headers: { "X-Company-Id": string } }) => Promise<any>, message: string, destination?: Section) {
  if (saving.value || !activeCompanyId.value) return;
  const companyId = activeCompanyId.value;
  const section = props.section;
  saving.value = true;
  errorMessage.value = "";
  try {
    const response = await operation({ headers: { "X-Company-Id": String(companyId) } });
    if (!mounted || companyId !== activeCompanyId.value || section !== props.section) return;
    closeDrawer(true);
    pendingAction.value = null;
    showSuccess(message);
    if (destination && destination !== props.section) {
      await router.push({ path: `/purchases/${destination}`, query: { id: response.data.data.id } });
    } else {
      if (destination) {
        search.value = ''; statusFilter.value = ''; pendingOnly.value = false;
        // Reload first so the route watcher finds the new record instead of reporting it as unavailable.
        await load();
        selectedId.value = response.data.data.id;
        await router.replace({ query: { ...route.query, id: String(selectedId.value) } });
      } else await load();
    }
  } catch (error) {
    if (mounted && companyId === activeCompanyId.value && section === props.section) showError(error, "No se pudo completar la operación");
  } finally {
    saving.value = false;
  }
}

async function selectRecord(id: number) {
  if (saving.value) return;
  const failure = await router.replace({ query: { ...route.query, id: String(id) } });
  if (!failure) selectedId.value = id;
}
async function selectAgeTab(tab: 'recent' | 'older') {
  if (saving.value || loading.value || requestAgeTab.value === tab) return;
  const query = { ...route.query }; delete query.id;
  const failure = await router.replace({ query });
  if (failure && route.query.id) return;
  requestAgeTab.value = tab;
  selectedId.value = filteredRecords.value[0]?.id ?? null;
}
function changeDocumentPeriod(value: string) {
  if (value === 'recent' || value === 'older') void selectAgeTab(value);
}

function formSnapshot() {
  return JSON.stringify(drawer.value === 'request' ? requestForm : drawer.value === 'quotation' ? quotationForm : drawer.value === 'order' ? { ...orderForm, selections: orderSelections.value } : receiveForm);
}

function closeDrawer(force = false) {
  if (saving.value && !force) return;
  if (!force && drawer.value && initialForm !== formSnapshot()) { discardChanges.value = true; return; }
  discardChanges.value = false;
  drawer.value = null;
  editingId.value = null;
  orderQuotation.value = null;
  receiptReview.value = null;
}

function addRequestLine() {
  requestForm.details.push({ productId: 0, quantity: 1, unitId: 0, description: "", notes: "" });
}

function syncRequestUnit(line: RequestLine) {
  line.unitId = catalogs.value.products.find((product) => product.id === line.productId)?.purchaseUnit.id ?? 0;
}

function newRequest() {
  editingId.value = null;
  const branch = catalogs.value.branches.find(item => item.id === onlyOptionId(catalogs.value.branches));
  Object.assign(requestForm, { branchId: branch?.id ?? 0, warehouseId: catalogs.value.generalWarehouse?.id ?? 0, requiredDate: dateValue(7), justification: "", purpose: "", notes: "", details: [] });
  addRequestLine();
  drawer.value = "request";
}

function editRequest(record: any) {
  editingId.value = record.id;
  Object.assign(requestForm, {
    branchId: record.branchId,
    warehouseId: catalogs.value.generalWarehouse?.id ?? 0,
    requiredDate: record.requiredDate.slice(0, 10),
    justification: record.justification,
    purpose: record.purpose ?? "",
    notes: record.notes ?? "",
    details: record.details.map((line: any) => ({ productId: line.productId, quantity: Number(line.quantity), unitId: line.unitId, description: line.description ?? "", notes: line.notes ?? "" })),
  });
  drawer.value = "request";
}

async function saveRequest() {
  if (!requestForm.purpose) return showError(null, "Seleccione para qué se compran estos productos");
  if (!requestForm.warehouseId) return showError(null, "Falta configurar el centro general de recepción. Un administrador debe definirlo en Configuración → Centro de recepción de compras.");
  if (!requestForm.branchId || !requestForm.details.length) return showError(null, "Seleccione sucursal y al menos un producto");
  if (requestForm.details.some(line => !line.productId || !line.unitId)) return showError(null, 'Seleccione un producto en cada línea');
  const payload = { ...requestForm, requiredDate: requestForm.requiredDate };
  await runMutation((config) => editingId.value ? http.patch(`/purchase-requests/${editingId.value}`, payload, config) : http.post("/purchase-requests", payload, config), editingId.value ? "Solicitud actualizada" : "Solicitud creada en borrador", "requests");
}

function newQuotation(request?: any) {
  const consolidationId = request?.details?.flatMap((d: any) => d.consolidationSources ?? [])[0]?.line.consolidationId;
  void router.push({ path: '/purchases/quotations/manage', query: consolidationId ? { id: String(consolidationId) } : request ? { requestId: String(request.id) } : {} });
}
function deliveryQuantity(line: any, field: 'quantity' | 'receivedQuantity') { return Math.round((line.transferItems ?? []).reduce((n: number, i: any) => n + Number(i[field]), 0) * 100) / 100; }

function rebuildQuoteLines() {
  const current = new Map(quotationForm.details.map((line) => [line.productId, line]));
  const grouped = new Map<number, QuoteLine>();
  for (const request of eligibleRequests.value.filter((item) => quotationForm.requestIds.includes(item.id))) {
    for (const detail of request.details) {
      const existing = grouped.get(detail.productId);
      if (existing) {
        existing.quantity += Number(detail.quantity);
        existing.availableQuantity += Number(detail.quantity);
        existing.sources.push({ requestDetailId: detail.id, quantity: Number(detail.quantity) });
      } else {
        const previous = current.get(detail.productId);
        grouped.set(detail.productId, {
          productId: detail.productId,
          quantity: Number(detail.quantity),
          unitId: detail.unitId,
          unitPrice: previous?.unitPrice ?? 0,
          discount: previous?.discount ?? 0,
          taxRate: previous?.taxRate ?? 13,
          deliveryDays: previous?.deliveryDays ?? quotationForm.deliveryDays,
          availableQuantity: Number(detail.quantity),
          notes: previous?.notes ?? "",
          sources: [{ requestDetailId: detail.id, quantity: Number(detail.quantity) }],
        });
      }
    }
  }
  quotationForm.details = [...grouped.values()];
}

function editQuotation(record: any) {
  if (record.rfq) { void router.push({ path: '/purchases/quotations/manage', query: { id: String(record.rfq.consolidationId), rfqId: String(record.rfq.id) } }); return; }
  editingId.value = record.id;
  Object.assign(quotationForm, {
    supplierId: record.supplierId,
    requestIds: record.requestLinks.map((link: any) => link.requestId),
    quotationDate: record.quotationDate.slice(0, 10),
    validUntil: record.validUntil.slice(0, 10),
    currency: record.currency,
    paymentTerms: record.paymentTerms ?? "",
    deliveryDays: record.deliveryDays,
    notes: record.notes ?? "",
    details: record.details.map((line: any) => ({ productId: line.productId, quantity: Number(line.quantity), unitId: line.unitId, unitPrice: Number(line.unitPrice), discount: Number(line.discount), taxRate: Number(line.taxRate), deliveryDays: line.deliveryDays ?? record.deliveryDays, availableQuantity: Number(line.availableQuantity), notes: line.notes ?? "", sources: line.requestDetailLinks.map((source: any) => ({ requestDetailId: source.requestDetailId, quantity: Number(source.quantity) })) })),
    expenses: record.expenses.map((expense: any) => ({ expenseTypeId: expense.expenseTypeId, description: expense.description ?? "", amount: Number(expense.amount) })),
  });
  drawer.value = "quotation";
}

function addExpense(target: ExpenseLine[]) {
  target.push({ expenseTypeId: catalogs.value.expenseTypes[0]?.id ?? 0, description: "", amount: 0 });
}

async function saveQuotation() {
  if (!quotationForm.supplierId || !quotationForm.details.length) return showError(null, "Seleccione proveedor y solicitudes aprobadas");
  if (quotationForm.details.some((line) => Number(line.discount) > Number(line.quantity) * Number(line.unitPrice))) return showError(null, "El descuento no puede superar el importe del producto");
  const payload = { ...quotationForm, currency: quotationForm.currency.trim().toUpperCase() };
  await runMutation((config) => editingId.value ? http.patch(`/purchase-quotations/${editingId.value}`, payload, config) : http.post("/purchase-quotations", payload, config), editingId.value ? "Cotización actualizada" : "Cotización registrada", "quotations");
}

function newOrder(quotation: any) {
  const destination = { branchId: catalogs.value.generalWarehouse?.branchId ?? 0, warehouseId: catalogs.value.generalWarehouse?.id ?? 0 };
  editingId.value = null;
  orderQuotation.value = quotation;
  orderSelections.value = quotationPendingLines(quotation);
  if (!orderSelections.value.length) return showError(null, 'La oferta ya no tiene cantidades pendientes de ordenar');
  Object.assign(orderForm, { ...destination, expectedDate: dateValue(Math.max(quotation.deliveryDays, 1)), paymentTerms: quotation.paymentTerms ?? "", notes: "", expenses: quotation.expenses.map((expense: any) => ({ expenseTypeId: expense.expenseTypeId, description: expense.description ?? "", amount: Number(expense.amount) })) });
  drawer.value = "order";
}

async function editOrder(record: any) {
  if (!['draft','returned'].includes(record.status)) return showError(null,'Gerencia debe devolver la orden antes de editarla.');
  editingId.value = record.id;
  orderQuotation.value = record.quotation;
  Object.assign(orderForm, { branchId: record.branchId, warehouseId: record.warehouseId, expectedDate: record.expectedDate?.slice(0, 10) ?? '', paymentTerms: record.paymentTerms ?? "", notes: record.notes ?? "",quotationId:record.quotationId,confirmationReason:'',confirmOfferChanges:false,managementReview:false,details:record.details.map((d:any)=>({quotationDetailId:d.quotationDetailId,productName:d.product.name,quantity:Number(d.quantity),unitPrice:Number(d.unitPrice),discount:Number(d.discount),taxRate:Number(d.taxRate)})),expenses: record.expenses.map((expense: any) => ({ id: expense.id, expenseTypeId: expense.expenseTypeId, description: expense.description ?? "", amount: Number(expense.amount) })) });
  editableOrderQuotes.value=[];
  if(record.consolidationId && can('purchase_quotations.view')){const company=activeCompanyId.value;try{const response=await http.get('/supply/consolidations/'+record.consolidationId,{headers:{'X-Company-Id':String(company)}});if(!mounted||company!==activeCompanyId.value||selectedId.value!==record.id)return;editableOrderQuotes.value=response.data.data.rfqs.filter((r:any)=>r.quotation).map((r:any)=>({...r.quotation,supplier:r.supplier}));}catch(e){return showError(e,'No se pudo consultar la oferta de origen');}}
  drawer.value = "order";
}
function changeOrderProvider(){const quote=editableOrderQuotes.value.find(q=>q.id===orderForm.quotationId);if(!quote)return;orderForm.details=quote.details.filter((d:any)=>d.availabilityStatus==='available').map((d:any)=>({quotationDetailId:d.id,productName:catalogs.value.products.find(p=>p.id===d.productId)?.name??'Producto',quantity:Math.min(Number(d.quantity),Number(d.availableQuantity)),unitPrice:Number(d.unitPrice),discount:Number(d.discount),taxRate:Number(d.taxRate)}));orderForm.expenses=quote.expenses.map((e:any)=>({expenseTypeId:e.expenseTypeId,description:e.description??'',amount:Number(e.amount)}));}

async function saveOrder() {
  const details = orderSelections.value.filter((line) => Number(line.quantity) > 0).map((line) => ({ quotationDetailId: line.quotationDetailId, quantity: Number(line.quantity) }));
  if (!orderForm.branchId || !orderForm.warehouseId) return showError(null, "Seleccione la sucursal y el almacén");
  if (!editingId.value && !details.length) return showError(null, "Seleccione al menos una cantidad pendiente");
  const payload = editingId.value
    ? { expectedDate: orderForm.expectedDate, paymentTerms: orderForm.paymentTerms, notes: orderForm.notes, expenses: orderForm.expenses,quotationId:orderForm.quotationId,confirmationReason:orderForm.confirmationReason,confirmOfferChanges:orderForm.confirmOfferChanges,details:orderForm.details.map(({productName:_name,...d})=>d) }
    : { branchId: orderForm.branchId, warehouseId: orderForm.warehouseId, expectedDate: orderForm.expectedDate, notes: orderForm.notes, details };
  await runMutation((config) => editingId.value ? http.patch(`/purchase-orders/${editingId.value}`, payload, config) : http.post(`/purchase-orders/from-quotation/${orderQuotation.value.id}`, payload, config), editingId.value ? "Orden actualizada" : "Orden generada", "orders");
}

async function openReceive(record: any) {
  if (preparingReceipt.value || saving.value) return;
  const companyId = activeCompanyId.value, version = loadVersion;
  preparingReceipt.value = true;
  try {
    const response = await http.get(`/purchase-orders/${record.id}`, { headers: { 'X-Company-Id': String(companyId) } });
    if (!mounted || version !== loadVersion || companyId !== activeCompanyId.value) return;
    const fresh = response.data.data;
    if (!['sent', 'partially_received'].includes(fresh.status)) return showError(null, 'La orden debe estar enviada al proveedor para registrar la recepción. Actualice el listado.');
    orders.value = orders.value.map(order => order.id === fresh.id ? fresh : order);
    selectedId.value = fresh.id; editingId.value = fresh.id;
    Object.assign(receiveForm, { requestId: crypto.randomUUID(), supplierInvoiceNumber: '', supplierInvoiceDate: dateValue(), notes: '',
      items: fresh.details.filter((line: any) => Number(line.quantity) > Number(line.receivedQuantity)).map((line: any) => ({ orderDetailId: line.id, locationId: 0, quantity: 0 })) });
    drawer.value = 'receive';
  } catch (caught) { if (mounted && companyId === activeCompanyId.value) showError(caught, 'No se pudieron consultar las cantidades pendientes'); }
  finally { preparingReceipt.value = false; }
}

function fillPendingReceipt() {
  for (const item of receiveForm.items) {
    const line = selected.value?.details.find((detail: any) => detail.id === item.orderDetailId);
    item.quantity = line ? Math.max(0, roundMoney(Number(line.quantity) - Number(line.receivedQuantity))) : 0;
  }
}
function receiveOrder() {
  if (!editingId.value) return;
  const items = receiveForm.items.filter((item) => Number(item.quantity) > 0).map(item => ({ ...item, locationId: item.locationId || undefined, quantity: Number(item.quantity) }));
  if (!items.length) return showError(null, "Indique una cantidad recibida mayor que cero");
  for (const item of items) {
    const line = selected.value?.details.find((detail: any) => detail.id === item.orderDetailId);
    if (!Number.isSafeInteger(item.quantity)) return showError(null, 'La cantidad recibida debe ser un número entero.');
    if (!line || !Number.isFinite(item.quantity) || item.quantity > roundMoney(Number(line.quantity) - Number(line.receivedQuantity))) return showError(null, 'La cantidad recibida supera lo pendiente en la orden');
  }
  const description = items.map(item => { const line = selected.value.details.find((detail: any) => detail.id === item.orderDetailId); return `${line.product.name}: ${item.quantity} ${line.unit.name}`; }).join('; ');
  const progress = receiptProgress(selected.value.details, items);
  const outcome = progress.complete ? 'La orden quedará recibida completamente.' : `Recepción parcial: quedarán ${progress.pendingLines} productos con cantidades pendientes.`;
  errorMessage.value = '';
  receiptReview.value = { payload: { requestId: receiveForm.requestId, supplierInvoiceNumber: receiveForm.supplierInvoiceNumber.trim() || undefined, supplierInvoiceDate: receiveForm.supplierInvoiceDate || undefined, notes: receiveForm.notes.trim() || undefined, items }, description: `${selected.value.code}. ${description}. ${outcome} Estas cantidades quedarán recibidas y pendientes de viñeteo y confirmación física de ubicación.` };
}
async function confirmReceipt() {
  if (!receiptReview.value || !editingId.value) return;
  const id = editingId.value, payload = receiptReview.value.payload;
  await runMutation(config => http.post(`/purchase-orders/${id}/receive`, payload, config), 'Recepción registrada; confirme el viñeteo y la ubicación en bodega', 'orders');
}

async function workflow(path: string, success: string) {
  if (saving.value) return;
  if (path.endsWith('/approve')) {
    errorMessage.value = '';
    pendingAction.value = { path, success, reason: false, title: 'Aprobar documento',
      description: props.section === 'requests' ? `Aprobar ${selected.value.code} para solicitar ofertas a proveedores. Esta acción no compra ni ingresa productos al inventario.` : `Autorizar ${selected.value.code} para ${selected.value.supplier.name} por ${money(selected.value.total)}. Las existencias por ubicación se actualizarán cuando bodega confirme la colocación.` };
    return;
  }
  if (path.endsWith('/send') || path.endsWith('/select')) {
    errorMessage.value = '';
    pendingAction.value = { path, success, reason: false,
      title: path.endsWith('/send') ? 'Marcar orden como enviada' : 'Seleccionar oferta',
      description: path.endsWith('/send') ? `Confirmar que ${selected.value.code} ya fue enviada al proveedor. Esta acción registra el estado; no envía correos ni archivos.` : `Seleccionar ${selected.value.code} de ${selected.value.supplier.name} para generar órdenes de compra.` };
    return;
  }
  if (path.endsWith("/cancel") || path.endsWith("/reject") || path.endsWith("/return")) {
    errorMessage.value = "";
    pendingAction.value = { path, title: path.endsWith("/return") ? "Devolver con observaciones" : path.endsWith("/cancel") ? "Cancelar documento" : "Rechazar documento", description: `Documento ${selected.value?.code ?? ""}. El motivo quedará registrado en su historial.`, success, reason: true };
    return;
  }
  await runMutation((config) => http.post(path, {}, config), success);
}

async function confirmAction(reason: string) {
  const action = pendingAction.value;
  if (!action) return;
  await runMutation((config) => action.method === "delete" ? http.delete(action.path, config) : http.post(action.path, { reason }, config), action.success);
}

async function downloadExpenseDocument(document: { id: number; fileName: string }) {
  try {
    const response = await http.get(`/purchase-order-expenses/documents/${document.id}/content`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = document.fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showError(error, "No se pudo descargar el documento");
  }
}

async function uploadExpenseDocument(expenseId: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || saving.value) return;
  if (file.size > 10 * 1024 * 1024) return showError(null, "El documento no debe superar 10 MB");
  const data = new FormData();
  data.append("file", file);
  await runMutation((config) => http.post(`/purchase-order-expenses/${expenseId}/documents`, data, config), "Documento adjuntado al gasto");
}

function removeExpenseDocument(documentId: number) {
  errorMessage.value = "";
  pendingAction.value = { path: `/purchase-order-expenses/documents/${documentId}`, title: "Eliminar documento", description: "El comprobante se enviará a la papelera. Podrá recuperarse durante 30 días desde Configuración.", success: "Documento eliminado", reason: false, method: "delete" };
}

function resetContext() {
  ++loadVersion;
  requests.value = []; quotations.value = []; orders.value = []; pendingQuantityReviews.value = [];
  catalogs.value = { branches: [], products: [], suppliers: [], expenseTypes: [] };
  historyFrom.value = ''; historyTo.value = ''; requestAgeTab.value = 'recent'; selectedId.value = null; search.value = ""; statusFilter.value = ""; pendingOnly.value = false; handledSupplier.value = '';
  errorMessage.value = ""; successMessage.value = ""; pendingAction.value = null;
  closeDrawer(true);
  load();
}
watch([() => props.section, activeCompanyId], resetContext, { flush: "sync" });
watch(filteredRecords, (items) => {
  if (route.query.id) { selectedId.value = items.find(item => item.id === Number(route.query.id))?.id ?? null; return; }
  if (!items.some((item) => item.id === selectedId.value)) selectedId.value = items[0]?.id ?? null;
});
watch(() => route.query.id, (id) => {
  closeDrawer(true); pendingAction.value = null;
  const record = records.value.find(item => item.id === Number(id));
  if (record) {
    if (!requestInTab(record)) requestAgeTab.value = 'older';
    if (!filteredRecords.value.some(item => item.id === record.id)) clearFilters();
    selectedId.value = record.id;
  }
  else if (id) { selectedId.value = null; showError(null, 'El documento no está disponible en esta empresa.'); }
  else selectedId.value = filteredRecords.value[0]?.id ?? null;
});
watch(selectedId, () => { expandedAmounts.value = false; detailView.value = 'products'; });
watch(drawer, (value) => { if (value) { errorMessage.value = ""; successMessage.value = ""; initialForm = formSnapshot(); } });
onBeforeUnmount(() => { mounted = false; ++loadVersion; });
watch(() => requestForm.branchId, () => { if (!requestWarehouses.value.some((item) => item.id === requestForm.warehouseId)) requestForm.warehouseId = onlyOptionId(requestWarehouses.value); });
watch(() => orderForm.branchId, () => { if (!orderWarehouses.value.some((item) => item.id === orderForm.warehouseId)) orderForm.warehouseId = onlyOptionId(orderWarehouses.value); });
onMounted(load);
</script>

<template>
  <AdminLayout :title="sectionMeta.title">

    <div class="mx-auto max-w-[1440px] space-y-6">
      <PurchasesNav />
      <PurchaseSectionHeader :title="sectionMeta.title" :description="sectionMeta.subtitle">
        <template #actions><div class="flex gap-2"><AppButton variant="outline" :disabled="loading || saving" title="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" /><span class="hidden sm:inline">Actualizar</span></AppButton><AppButton v-if="props.section === 'requests' && can('purchase_requests.create')" :disabled="loading || saving" @click="newRequest"><Plus class="h-4 w-4" />{{ sectionMeta.create }}</AppButton><AppButton v-if="props.section === 'quotations' && can('purchase_quotations.create')" :disabled="loading || saving" @click="newQuotation()"><Plus class="h-4 w-4" />{{ sectionMeta.create }}</AppButton></div></template>
      </PurchaseSectionHeader>
      <section v-if="props.section==='orders' && pendingQuantityReviews.length" class="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 class="text-sm font-semibold">Cantidades por revisar antes de cotizar <span class="ml-2 text-muted-fg">{{ pendingQuantityReviews.length }}</span></h2>
        <div class="mt-3 max-h-48 divide-y divide-border overflow-y-auto"><RouterLink v-for="proposal in pendingQuantityReviews" :key="proposal.id" :to="{path:'/purchases/quotations/manage',query:{id:String(proposal.id)}}" class="flex items-center justify-between gap-3 py-3 text-sm"><span>Compra #{{ proposal.id }} · {{ shortDate(proposal.createdAt) }}</span><span class="font-medium text-accent">Revisar cantidades →</span></RouterLink></div>
      </section>
      <p v-if="errorMessage" role="alert" class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ errorMessage }}</p>
      <p v-if="successMessage" role="status" class="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{{ successMessage }}</p>

      <div class="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside :aria-label="'Bandeja de ' + inboxTitle.toLowerCase()" class="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-surface lg:sticky lg:top-0">
          <div class="space-y-4 border-b border-border/70 p-4">
            <div class="flex items-center justify-between gap-3"><h2 class="text-sm font-semibold">{{ inboxTitle }}</h2><span class="text-xs tabular-nums text-muted-fg">{{ filteredRecords.length }}</span></div>
            <PurchaseTabs :model-value="requestAgeTab" :items="[{ value: 'recent', label: 'Esta semana' }, { value: 'older', label: 'Anteriores' }]" label="Período de documentos" :disabled="saving || loading || !!drawer" @update:model-value="changeDocumentPeriod" />
            <div class="relative"><Search class="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-fg" aria-hidden="true" /><input v-model="search" type="search" :disabled="saving || !!drawer" class="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg" aria-label="Buscar documentos" :placeholder="props.section === 'requests' ? 'Código, motivo o sucursal' : 'Código o proveedor'" /></div>
            <details class="border-t border-border/70 pt-3">
              <summary class="cursor-pointer text-sm font-medium text-muted-fg">Filtros<span v-if="activeFilterCount" class="ml-2 text-accent">{{ activeFilterCount }}</span></summary>
              <fieldset :disabled="saving || !!drawer" class="mt-3 space-y-3">
                <label class="block text-xs text-muted-fg">Estado<select v-model="statusFilter" aria-label="Filtrar por estado" class="field-control"><option value="">Todos los estados</option><option v-for="status in statusOptions" :key="status" :value="status">{{ statusLabel(status) }}</option></select></label>
                <label class="flex items-center gap-2 text-sm"><input v-model="pendingOnly" type="checkbox" class="h-4 w-4 accent-accent" />Solo pendientes</label>
                <div v-if="requestAgeTab === 'older'" class="grid grid-cols-2 gap-2"><label class="text-xs text-muted-fg">Desde<input v-model="historyFrom" type="date" :max="historyTo || undefined" class="field-control !px-2" /></label><label class="text-xs text-muted-fg">Hasta<input v-model="historyTo" type="date" :min="historyFrom || undefined" class="field-control !px-2" /></label></div>
                <button v-if="activeFilterCount || search" type="button" class="text-sm text-accent" @click="clearFilters">Limpiar filtros</button>
              </fieldset>
            </details>
          </div>
          <div class="scrollbar-thin max-h-[260px] overflow-y-auto p-2 lg:max-h-[580px]">
            <button v-for="record in filteredRecords" :key="record.id" type="button" class="mb-1 w-full rounded-xl border px-3 py-3 text-left transition-colors" :class="selectedId === record.id ? 'border-accent/25 bg-accent-soft' : 'border-transparent hover:bg-surface-secondary'" :disabled="saving || !!drawer" :aria-pressed="selectedId === record.id" @click="selectRecord(record.id)">
              <span class="flex flex-wrap items-center justify-between gap-2"><span class="font-semibold text-fg">{{ record.code }}</span><AppBadge :variant="statusVariant(record.status)">{{ statusLabel(record.status) }}</AppBadge></span>
              <span class="mt-2 block truncate text-sm text-muted-fg">{{ record.supplier?.name || record.branch?.name || record.justification }}</span>
              <span class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-fg"><span>{{ shortDate(record.requestDate || record.quotationDate || record.orderDate || record.createdAt) }}</span><strong v-if="record.total !== undefined" class="font-medium tabular-nums text-fg">{{ money(record.total, record.currency) }}</strong><span v-else>{{ purchasePurposeLabel(record.purpose) }}</span></span>
            </button>
            <p v-if="!filteredRecords.length && !loading" class="px-4 py-10 text-center text-sm text-muted-fg">No hay documentos para mostrar.</p>
          </div>
        </aside>

        <section v-if="selected" aria-label="Detalle del documento" class="min-h-[560px] min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-surface">
          <header class="space-y-4 border-b border-border/70 p-5 sm:p-6">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h2 class="text-xl font-semibold tracking-tight">{{ selected.code }}</h2><AppBadge :variant="statusVariant(selected.status)">{{ statusLabel(selected.status) }}</AppBadge><TrackingLink v-if="trackingType" :type="trackingType" :id="selected.id" /></div><p class="mt-2 text-sm text-muted-fg">{{ selected.supplier?.name || selected.branch?.name }}</p></div>
              <fieldset :disabled="saving" class="flex flex-wrap items-center gap-2">
            <AppButton v-if="canEditOrder" variant="outline" @click="editOrder(selected)"><Pencil class="h-4 w-4" />{{ selected.status === 'returned' ? 'Corregir orden' : 'Editar borrador' }}</AppButton>
            <AppButton v-if="nextAction" :disabled="preparingReceipt" @click="nextAction.run()">{{ nextAction.label }}<ChevronRight class="h-4 w-4" /></AppButton>
            <details v-if="secondaryActions" :key="'actions-' + selected.id" class="relative"><summary class="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-muted-fg">Más acciones</summary><div class="absolute right-0 z-30 mt-2 flex min-w-56 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-subtle"><AppButton v-if="props.section === 'orders' && ['sent','partially_received'].includes(selected.status) && (can('purchase_orders.receive') || can('purchases.create'))" variant="outline" :disabled="preparingReceipt" @click="openReceive(selected)">{{ selected.purchases?.some((p: any) => p.status !== 'CANCELLED') ? 'Registrar otra recepción' : 'Registrar recepción' }}</AppButton><RouterLink v-if="props.section === 'requests' && !['draft','rejected','cancelled'].includes(selected.status) && can('inventory.view')" :to="{ path: '/inventory/warehouse', query: { requestId: selected.id } }" class="rounded-lg border border-border px-3 py-2 text-sm text-center">Ver entregas a sucursal</RouterLink><AppButton v-if="props.section === 'requests' && (['draft','rejected'].includes(selected.status) && can('purchase_requests.update'))" variant="outline" @click="editRequest(selected)"><Pencil class="h-4 w-4" />{{ selected.purpose ? 'Editar' : 'Completar solicitud' }}</AppButton><AppButton v-if="props.section === 'quotations' && (['draft','received'].includes(selected.status) && can('purchase_quotations.update'))" variant="outline" @click="editQuotation(selected)"><Pencil class="h-4 w-4" />Editar</AppButton><AppButton v-if="props.section === 'orders' && (['draft','returned'].includes(selected.status) && can('purchase_orders.update'))" variant="outline" @click="editOrder(selected)"><Pencil class="h-4 w-4" />Editar</AppButton><AppButton v-if="props.section === 'quotations' && ['received','under_review'].includes(selected.status) && can('purchase_quotations.reject')" variant="outline" @click="workflow(`/purchase-quotations/${selected.id}/reject`, 'Cotización rechazada')"><XCircle class="h-4 w-4" />Rechazar</AppButton><AppButton v-if="(props.section === 'requests' && ['draft','submitted','approved','in_quotation','partially_ordered'].includes(selected.status) && can('purchase_requests.cancel')) || (props.section === 'quotations' && ['draft','received','under_review'].includes(selected.status) && can('purchase_quotations.cancel')) || (props.section === 'orders' && ['draft','returned','rejected','pending_approval','approved','sent'].includes(selected.status) && can('purchase_orders.cancel'))" variant="outline" @click="workflow(`/${props.section === 'requests' ? 'purchase-requests' : props.section === 'quotations' ? 'purchase-quotations' : 'purchase-orders'}/${selected.id}/cancel`, 'Documento cancelado')"><XCircle class="h-4 w-4" />Cancelar documento</AppButton><TrashButton :entity="props.section === 'requests' ? 'purchase_requests' : props.section === 'quotations' ? 'purchase_quotations' : 'purchase_orders'" :record-id="selected.id" :label="selected.code" :disabled="saving" @deleted="load" /></div></details>
          </fieldset>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
              <p class="font-medium text-accent">{{ selectedStage }}</p>
              <p v-if="props.section === 'requests'" class="text-muted-fg">Requerida <span class="font-medium text-fg">{{ shortDate(selected.requiredDate) }}</span></p>
              <p v-else-if="props.section === 'quotations'" class="text-muted-fg">Vigente hasta <span class="font-medium text-fg">{{ shortDate(selected.validUntil) }}</span><span class="ml-3">Entrega {{ selected.deliveryDays ?? 'Por confirmar' }}{{ selected.deliveryDays != null ? ' días' : '' }}</span></p>
              <p v-else class="text-muted-fg">Entrega esperada <span class="font-medium text-fg">{{ selected.expectedDate ? shortDate(selected.expectedDate) : 'Por confirmar' }}</span></p>
            </div>
          </header>
          <p v-if="quoteExpired && !['cancelled','rejected'].includes(selected.status)" role="status" class="border-b border-border/70 px-5 py-3 text-sm text-danger">Oferta vencida · {{ shortDate(selected.validUntil) }}</p>
          <p v-else-if="props.section === 'quotations' && selected.status === 'selected' && !pendingOrderLines.length" role="status" class="border-b border-border/70 px-5 py-3 text-sm text-success">Sin cantidades pendientes de ordenar.</p>
          <div class="border-b border-border/70 px-5 py-4 sm:px-6"><PurchaseTabs :model-value="detailView" :items="detailTabs" label="Vistas del documento" :disabled="saving" @update:model-value="selectDetailView" /></div>
          <section v-if="detailView==='approval'&&props.section==='orders'" class="space-y-5 p-5 sm:p-6">
  <div class="flex flex-wrap items-center justify-between gap-4"><div><h3 class="text-lg font-semibold">Revisión de Gerencia</h3><p class="mt-1 text-xs text-muted-fg">Versión {{ selected.revision }} · {{ statusLabel(selected.status) }}</p></div><p class="text-xl font-semibold">{{ money(selected.total,selected.currency) }}</p></div>
  <p class="text-sm text-muted-fg">Las cantidades se definieron antes de cotizar. Revise proveedores, condiciones, gastos y total para aprobar o devolver la compra a Compras.</p>
  <p v-if="selected.consolidation?.quantityApprovedBy" class="text-xs text-muted-fg">Cantidades autorizadas por usuario #{{ selected.consolidation.quantityApprovedBy }} · {{ shortDate(selected.consolidation.quantityApprovedAt) }} · versión {{ selected.consolidation.quantityApprovedRevision }}</p>
  <div v-if="selected.reviewNotes" class="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"><p class="mb-1 font-medium">Observaciones de Gerencia</p><p class="whitespace-pre-wrap">{{ selected.reviewNotes }}</p></div>
  <div class="overflow-x-auto"><table class="w-full min-w-[560px] text-left text-sm"><thead class="border-b border-border text-xs text-muted-fg"><tr><th class="p-3">Producto</th><th class="p-3 text-right">Solicitado</th><th class="p-3 text-right">Propuesto</th><th class="p-3 text-right">Diferencia</th><th class="p-3">Motivo / responsable</th></tr></thead><tbody><tr v-for="line in selected.consolidation?.lines??[]" :key="line.id" class="border-b border-border"><td class="p-3 font-medium">{{ line.product.name }}</td><td class="p-3 text-right">{{ Number(line.requestedQuantity) }}</td><td class="p-3 text-right">{{ Number(line.purchaseQuantity) }}</td><td class="p-3 text-right">{{ Number(line.purchaseQuantity)-Number(line.requestedQuantity) }}</td><td class="p-3 text-xs text-muted-fg">{{ line.reason||'Sin cambios sobre lo solicitado' }}<span v-if="line.decidedBy" class="mt-1 block">Usuario #{{ line.decidedBy }} · {{ shortDate(line.decidedAt) }}</span><details v-if="line.sources?.length" class="mt-2"><summary class="cursor-pointer">Solicitudes de origen</summary><p v-for="source in line.sources" :key="source.id" class="mt-1">{{ source.requestDetail.request.code }} · {{ source.requestDetail.request.branch.name }} · {{ Number(source.quantity) }}</p></details></td></tr></tbody></table></div>
  <div v-if="selected.comparisonSnapshot?.comparison" class="space-y-4"><h4 class="text-sm font-semibold">Ofertas de origen comparadas</h4><div class="overflow-x-auto"><table class="w-full min-w-[600px] text-left text-xs"><thead><tr class="border-b border-border"><th class="p-3">Producto</th><th v-for="supplier in selected.comparisonSnapshot.comparison.suppliers" :key="supplier.id" class="p-3">{{ supplier.name }}</th></tr></thead><tbody><tr v-for="row in selected.comparisonSnapshot.comparison.rows" :key="row.lineId" class="border-b border-border"><th class="p-3 font-medium">{{ row.product.name }}</th><td v-for="cell in row.cells" :key="cell.supplierId" class="p-3"><template v-if="cell.state==='not_quoted'">No cotizado</template><template v-else>{{ money(cell.unitPrice,cell.currency) }} / unidad · {{ cell.availableQuantity }} disponibles<p v-if="cell.label" class="mt-1 text-warning">{{ cell.label }}</p><p v-if="cell.eligible" class="mt-1 text-muted-fg">Total {{ money(cell.total,cell.currency) }} por {{ cell.quantity }} · Entrega {{ cell.deliveryDays }} días</p></template></td></tr></tbody></table></div><p v-if="selected.comparisonSnapshot.partialAccepted" class="text-sm text-warning">Compras confirmó que se trata de una comparación parcial con condiciones o costos pendientes.</p></div>
  <div v-if="selected.comparisonSnapshot?.orderChanges" class="rounded-xl border border-border p-4 text-sm"><p class="font-medium">Cambios registrados en la orden</p><p class="mt-1 text-muted-fg">{{ selected.comparisonSnapshot.orderChanges.reason }}</p><p v-if="selected.comparisonSnapshot.commercialConfirmation" class="mt-2 text-xs">Confirmación del proveedor: {{ selected.comparisonSnapshot.commercialConfirmation.reason }} · Usuario #{{ selected.comparisonSnapshot.commercialConfirmation.userId }}</p></div>
  <div class="grid gap-3 rounded-xl bg-surface-secondary p-4 text-sm sm:grid-cols-4"><span>Productos netos<strong class="mt-1 block">{{ money(Number(selected.subtotal)-Number(selected.discount)) }}</strong></span><span>Impuestos<strong class="mt-1 block">{{ money(selected.tax) }}</strong></span><span>Gastos previstos<strong class="mt-1 block">{{ money(selected.additionalExpenses) }}</strong></span><span>Total final<strong class="mt-1 block">{{ money(selected.total) }}</strong></span></div>
  <p v-if="selected.approvedAt" class="text-xs text-muted-fg">Aprobada por usuario #{{ selected.approvedBy }} · {{ shortDate(selected.approvedAt) }} · Versión {{ selected.approvedRevision }}</p>
  <div v-if="selected.status==='returned'&&can('purchase_orders.update')" class="flex flex-wrap justify-end gap-3"><AppButton variant="outline" :disabled="saving" @click="editOrder(selected)">Corregir orden</AppButton><AppButton :disabled="saving" @click="workflow('/purchase-orders/'+selected.id+'/submit','Corrección enviada a Gerencia')">Enviar corrección a Gerencia</AppButton></div>
  <div v-if="selected.status==='pending_approval'&&can('purchase_orders.approve')" class="flex flex-wrap justify-end gap-3"><AppButton variant="outline" :disabled="saving" @click="workflow('/purchase-orders/'+selected.id+'/reject','Orden rechazada')">Rechazar</AppButton><AppButton variant="outline" :disabled="saving" @click="workflow('/purchase-orders/'+selected.id+'/return','Orden devuelta con observaciones')">Devolver con observaciones</AppButton><AppButton :disabled="saving" @click="workflow('/purchase-orders/'+selected.id+'/approve','Orden aprobada por Gerencia')">Aprobar esta versión</AppButton></div>
</section>
<section v-if="detailView === 'products'" class="p-5 sm:p-6"><div class="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 class="font-semibold text-fg">Productos <span class="text-sm font-normal text-muted-fg">({{ selected.details.length }})</span></h3><button v-if="props.section !== 'requests'" type="button" class="text-xs text-accent" @click="expandedAmounts = !expandedAmounts">{{ expandedAmounts ? 'Ocultar impuestos y descuentos' : 'Ver impuestos y descuentos' }}</button></div><p v-if="props.section === 'requests'" class="mb-4 text-sm leading-6 text-muted-fg">{{ purchasePurposeLabel(selected.purpose) }}<span v-if="selected.justification"> · {{ selected.justification }}</span></p><div class="overflow-x-auto rounded-lg border border-border"><table class="w-full text-left text-sm" :class="props.section === 'requests' ? 'min-w-[380px]' : 'min-w-[680px]'"><thead class="border-b border-border bg-surface-secondary text-xs text-muted-fg"><tr><th class="px-4 py-3">Producto</th><th class="px-4 py-3 text-right">{{ props.section === 'requests' ? 'Solicitado' : props.section === 'orders' ? 'Comprado' : 'Cotizado' }}</th><th v-if="props.section !== 'requests'" class="px-4 py-3 text-right">Precio</th><th v-if="props.section === 'quotations'" class="px-4 py-3 text-right">Disponible</th><th v-if="props.section === 'orders'" class="px-4 py-3 text-right">Recibido</th><th v-if="props.section === 'orders'" class="px-4 py-3 text-right">Pendiente</th><th v-if="props.section !== 'requests' && expandedAmounts" class="px-4 py-3 text-right">Descuento</th><th v-if="props.section !== 'requests' && expandedAmounts" class="px-4 py-3 text-right">Impuesto</th><th v-if="props.section !== 'requests'" class="px-4 py-3 text-right">Total</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="line in selected.details" :key="line.id"><td class="px-4 py-3"><p class="font-medium text-fg">{{ line.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ line.product.internalCode }} · {{ line.unit.name }}</p></td><td class="px-4 py-3 text-right font-medium text-fg">{{ Number(line.quantity) }}</td><td v-if="props.section !== 'requests'" class="px-4 py-3 text-right text-muted-fg">{{ money(line.unitPrice) }}</td><td v-if="props.section === 'quotations'" class="px-4 py-3 text-right text-muted-fg">{{ Number(line.availableQuantity) }}</td><td v-if="props.section === 'orders'" class="px-4 py-3 text-right text-muted-fg">{{ Number(line.receivedQuantity) }}</td><td v-if="props.section === 'orders'" class="px-4 py-3 text-right font-medium tabular-nums">{{ Math.max(0, roundMoney(Number(line.quantity) - Number(line.receivedQuantity))) }}</td><td v-if="props.section !== 'requests' && expandedAmounts" class="px-4 py-3 text-right">{{ money(line.discount) }}</td><td v-if="props.section !== 'requests' && expandedAmounts" class="px-4 py-3 text-right">{{ money(line.taxAmount) }}<span class="block text-xs text-muted-fg">{{ Number(line.taxRate) }}%</span></td><td v-if="props.section !== 'requests'" class="px-4 py-3 text-right font-semibold text-fg">{{ money(line.total) }}</td></tr></tbody></table></div></section>

          <section v-if="detailView === 'deliveries' && props.section === 'requests'" class="p-5 sm:p-6">
          <h3 class="font-semibold">Entrega a la sucursal solicitante</h3>
          <div class="mt-4 overflow-x-auto"><table class="w-full min-w-[560px] text-left text-sm"><thead><tr><th>Producto</th><th>Solicitado</th><th>Despachado</th><th>Recibido en sucursal</th><th>Pendiente</th></tr></thead><tbody><tr v-for="line in selected.details" :key="line.id"><td class="py-3">{{ line.product.name }} · {{ line.unit.name }}</td><td>{{ Number(line.quantity) }}</td><td>{{ deliveryQuantity(line,'quantity') }}</td><td>{{ deliveryQuantity(line,'receivedQuantity') }}</td><td>{{ Math.max(0, Number(line.quantity) - deliveryQuantity(line,'receivedQuantity')) }}</td></tr></tbody></table></div>
        </section>

          <section v-if="detailView === 'receipts' && props.section === 'orders'" class="p-5 sm:p-6">
          <h3 class="font-semibold text-fg">Recepciones</h3>
          <div v-for="receipt in selected.purchases" :key="receipt.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm">
            <div><strong>{{ receipt.documentNumber }}</strong><span class="ml-2 text-xs" :class="receipt.status === 'CANCELLED' ? 'text-danger' : 'text-muted-fg'">{{ receiptNextStep(receipt).label }}</span><p class="mt-1 text-xs text-muted-fg">{{ shortDate(receipt.purchaseDate) }} · {{ receipt.supplierInvoiceNumber || 'Sin factura' }}</p></div>
            <div class="flex flex-wrap items-center gap-3"><strong>{{ money(receipt.total, selected.currency) }}</strong><RouterLink v-if="can('purchases.view')" :to="{ path: '/purchases/receipts', query: { id: receipt.id } }" class="text-accent">Ver recepción</RouterLink><RouterLink v-if="can('retaceos.view') && receipt.status !== 'CANCELLED' && !receipt.retaceoArchived && (receipt.hasActiveRetaceo || ['VERIFIED','COSTED'].includes(receipt.status))" :to="{ path: '/purchases/retaceos', query: { purchaseId: receipt.id } }" class="text-accent">{{ receipt.hasActiveRetaceo ? 'Ver retaceo' : 'Preparar retaceo' }}</RouterLink></div>
          </div>
        <div v-if="!selected.purchases?.length" class="mt-4 rounded-xl bg-surface-secondary p-5"><p class="text-sm text-muted-fg">Esta orden aún no tiene recepciones registradas.</p><AppButton v-if="['sent','partially_received'].includes(selected.status) && (can('purchase_orders.receive') || can('purchases.create'))" class="mt-4" :disabled="saving || preparingReceipt" @click="openReceive(selected)">Registrar recepción</AppButton></div></section>

          <section v-if="detailView === 'costs' && props.section !== 'requests'" class="p-5 sm:p-6"><div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <h3 class="font-semibold text-fg">Gastos adicionales</h3>
            <div class="mt-3 space-y-3">
              <div v-for="expense in selected.expenses" :key="expense.id" class="rounded-lg border border-border bg-surface p-3 text-sm">
                <div class="flex items-start justify-between gap-3"><span class="text-muted-fg"><strong class="font-medium text-fg">{{ expense.expenseType.name }}</strong><span v-if="expense.description"> · {{ expense.description }}</span></span><strong class="shrink-0 text-fg">{{ money(expense.amount) }}</strong></div>
                <div v-if="props.section === 'orders'" class="mt-3 border-t border-border pt-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <span v-for="document in expense.documents" :key="document.id" class="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-secondary px-2 py-1 text-xs">
                      <button type="button" class="flex min-w-0 items-center gap-1.5 text-fg" :title="'Descargar ' + document.fileName" @click="downloadExpenseDocument(document)"><FileText class="h-3.5 w-3.5 shrink-0" /><span class="max-w-40 truncate">{{ document.fileName }}</span></button>
                      <button v-if="can('purchase_expenses.update') && selected.status !== 'cancelled'" type="button" class="ml-1 text-danger" title="Eliminar documento" :disabled="saving" @click="removeExpenseDocument(document.id)"><X class="h-3.5 w-3.5" /></button>
                    </span>
                    <label v-if="can('purchase_expenses.create') && selected.status !== 'cancelled'" class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-xs font-medium text-muted-fg hover:border-accent hover:text-accent"><Upload class="h-3.5 w-3.5" />Adjuntar<input class="sr-only" type="file" :disabled="saving" accept=".pdf,.jpg,.jpeg,.png,.webp" @change="uploadExpenseDocument(expense.id, $event)" /></label>
                  </div>
                  <p v-if="!expense.documents?.length" class="mt-2 flex items-center gap-1.5 text-xs text-muted-fg"><Paperclip class="h-3.5 w-3.5" />Sin evidencias adjuntas.</p>
                </div>
              </div>
              <p v-if="!selected.expenses.length" class="text-sm text-muted-fg">Sin gastos adicionales.</p>
            </div>
          </div>
          <dl class="space-y-2 text-sm"><div class="flex justify-between"><dt class="text-muted-fg">{{ props.section === 'orders' ? 'Subtotal neto' : 'Subtotal' }}</dt><dd>{{ money(selected.subtotal) }}</dd></div><div class="flex justify-between"><dt class="text-muted-fg">{{ props.section === 'orders' ? 'Descuento incluido' : 'Descuento' }}</dt><dd>{{ props.section === 'orders' ? '' : '-' }}{{ money(selected.discount) }}</dd></div><div class="flex justify-between"><dt class="text-muted-fg">Impuestos</dt><dd>{{ money(selected.tax) }}</dd></div><div class="flex justify-between"><dt class="text-muted-fg">Gastos</dt><dd>{{ money(selected.additionalExpenses) }}</dd></div><div class="flex justify-between border-t border-border pt-3 text-base font-semibold"><dt>Total</dt><dd>{{ money(selected.total) }}</dd></div></dl>
        </div></section>

          <section v-if="detailView === 'information'" class="space-y-6 p-5 sm:p-6"><h3 class="font-semibold">Datos del documento</h3>        <dl class="grid gap-5 sm:grid-cols-2"><div v-if="props.section === 'requests'" ><dt class="text-xs text-muted-fg">Fecha requerida</dt><dd class="mt-1 text-sm font-medium text-fg">{{ shortDate(selected.requiredDate) }}</dd></div><div v-if="props.section === 'requests'" ><dt class="text-xs text-muted-fg">Solicitante</dt><dd class="mt-1 text-sm font-medium text-fg">{{ selected.user?.username }}</dd></div><div v-if="props.section === 'quotations'" ><dt class="text-xs text-muted-fg">Vigente hasta</dt><dd class="mt-1 text-sm font-medium text-fg">{{ shortDate(selected.validUntil) }}</dd></div><div v-if="props.section === 'quotations'" ><dt class="text-xs text-muted-fg">Entrega</dt><dd class="mt-1 text-sm font-medium text-fg">{{ selected.deliveryDays != null ? selected.deliveryDays + ' días' : 'Por confirmar' }}</dd></div><div v-if="props.section === 'orders'" ><dt class="text-xs text-muted-fg">Fecha esperada</dt><dd class="mt-1 text-sm font-medium text-fg">{{ shortDate(selected.expectedDate) }}</dd></div><div v-if="props.section !== 'quotations'"><dt class="text-xs text-muted-fg">Centro de almacenaje</dt><dd class="mt-1 text-sm font-medium text-fg">{{ selected.warehouse?.name || 'Por confirmar' }}</dd></div><div ><dt class="text-xs text-muted-fg">Productos</dt><dd class="mt-1 text-sm font-medium text-fg">{{ selected.details.length }} líneas</dd></div><div ><dt class="text-xs text-muted-fg">Origen</dt><dd class="mt-1 text-sm font-medium text-fg">{{ props.section === 'requests' ? `${selected.quotationLinks.length} cotizaciones` : props.section === 'quotations' ? `${selected.requestLinks.length} solicitudes` : selected.quotation?.code || 'Orden directa' }}</dd></div></dl>

        <section v-if="props.section === 'requests'" class="border-t border-border/70 pt-5"><p class="mb-3 text-sm font-medium text-fg">{{ purchasePurposeLabel(selected.purpose) }}</p><p class="text-xs font-semibold text-muted-fg">Motivo de la compra</p><p class="mt-2 max-w-3xl text-sm leading-6 text-fg">{{ selected.justification }}</p></section>
<section v-if="selected.notes" class="border-t border-border/70 pt-5"><h3 class="font-semibold text-fg">Observaciones</h3><p class="mt-2 whitespace-pre-wrap break-words text-sm text-muted-fg">{{ selected.notes }}</p></section>

<section v-if="relatedDocuments.length" class="border-t border-border/70 pt-5"><h3 class="font-semibold">Documentos relacionados</h3><nav aria-label="Documentos relacionados" class="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">
          <RouterLink v-for="document in relatedDocuments" :key="`${document.section}-${document.id}`" :to="{ path: `/purchases/${document.section}`, query: { id: document.id } }" class="min-w-0">
            <span class="block text-xs text-muted-fg">{{ document.label }} · {{ statusLabel(document.status) }}</span>
            <span class="font-semibold text-accent hover:underline">{{ document.code }}</span>
          </RouterLink>
        </nav></section>
</section>

          <div v-if="props.section !== 'requests' && detailView !== 'costs'" class="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-5 py-4 sm:px-6"><span class="text-sm text-muted-fg">Total de {{ props.section === 'orders' ? 'la orden' : 'la oferta' }}</span><strong class="text-lg font-semibold tabular-nums">{{ money(selected.total) }}</strong></div>
        </section>
        <section v-else aria-label="Detalle del documento" class="flex min-h-[420px] min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-surface p-8 text-center">
        <component :is="sectionMeta.icon" class="h-9 w-9 text-muted-fg" />
        <p class="font-medium text-fg">{{ loading ? 'Cargando documentos...' : props.section === 'quotations' && filteredRecords.length ? 'Seleccione una cotización para ver su detalle' : search || activeFilterCount ? 'Sin coincidencias' : `Sin ${sectionMeta.title.toLowerCase()}` }}</p>
        <AppButton v-if="search || activeFilterCount" variant="outline" @click="clearFilters"><X class="h-4 w-4" />Limpiar filtros</AppButton>
        <RouterLink v-else-if="!loading && props.section === 'orders' && can('purchase_quotations.view')" to="/purchases/quotations" class="text-sm font-medium text-accent">Ver cotizaciones</RouterLink>
        <RouterLink v-else-if="!loading && props.section === 'quotations' && can('purchase_requests.view')" to="/purchases/requests" class="text-sm font-medium text-accent">Ver solicitudes</RouterLink>
      </section>
      </div>
    </div>

    <div v-if="drawer" class="fixed inset-0 z-50 flex justify-end bg-black/35" @click.self="closeDrawer()"><aside role="dialog" aria-modal="true" aria-label="Documento de compras" class="h-full w-full max-w-3xl overflow-y-auto bg-surface p-4 shadow-xl sm:p-6" @keydown.esc="closeDrawer()"><div class="flex items-start justify-between"><div><p class="section-eyebrow">Proceso de compras</p><h2 class="mt-1 text-xl font-semibold text-fg">{{ drawer === 'request' ? (editingId ? 'Editar solicitud' : 'Nueva solicitud') : drawer === 'quotation' ? (editingId ? 'Editar cotización' : 'Registrar cotización') : drawer === 'order' ? (editingId ? 'Editar orden' : 'Generar orden de compra') : 'Registrar recepción' }}</h2></div><button type="button" class="icon-button" title="Cerrar" @click="closeDrawer()"><X class="h-5 w-5" /></button></div>

      <p v-if="errorMessage" role="alert" class="sticky top-0 z-10 mt-4 rounded-lg border border-danger/30 bg-surface p-3 text-sm text-danger">{{ errorMessage }}</p>
      <form v-if="drawer === 'request'" class="mt-6 space-y-6" @submit.prevent="saveRequest"><fieldset :disabled="saving" class="min-w-0 space-y-6"><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Sucursal<select v-model.number="requestForm.branchId" required class="field-control"><option disabled :value="0">Seleccionar sucursal</option><option v-for="branch in catalogs.branches" :key="branch.id" :value="branch.id">{{ branch.name }}</option></select></label><label class="text-sm font-medium text-fg">Centro general de almacenaje<select v-model.number="requestForm.warehouseId" disabled class="field-control"><option disabled :value="0">Configure el centro general</option><option v-for="warehouse in requestWarehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option></select></label><label class="text-sm font-medium text-fg">Finalidad de la compra<select v-model="requestForm.purpose" required class="field-control"><option disabled value="">Seleccionar finalidad</option><option value="resale">Reposición para reventa</option><option value="operations">Insumos para operación / instalación</option><option value="mixed">Mixta: reventa y operación</option></select></label><AppInput v-model="requestForm.requiredDate" type="date" label="Fecha requerida" :min="dateValue()" required /><AppInput class="sm:col-span-2" v-model="requestForm.justification" label="Motivo de la compra" placeholder="Ej. Reposición de láminas o insumos para instalación" required maxlength="1000" /></div><div><div class="mb-3 flex items-center justify-between"><div><h3 class="font-semibold text-fg">Productos e insumos a comprar</h3></div><AppButton variant="outline" size="sm" type="button" :disabled="requestForm.details.length >= catalogs.products.length" @click="addRequestLine"><Plus class="h-4 w-4" />Producto</AppButton></div><div class="space-y-3"><div v-for="(line, index) in requestForm.details" :key="index" class="grid items-end gap-3 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_150px_150px_36px]"><label class="text-sm font-medium text-fg">Producto<select v-model.number="line.productId" required class="field-control" @change="syncRequestUnit(line)"><option disabled :value="0">Seleccionar producto</option><option v-for="product in catalogs.products" :key="product.id" :value="product.id" :disabled="requestForm.details.some((other) => other !== line && other.productId === product.id)">{{ product.internalCode }} · {{ product.name }}</option></select></label><AppInput v-model="line.quantity as any" type="number" min="1" step="1" label="Cantidad solicitada" required /><label class="text-sm font-medium text-fg">Unidad de compra<input :value="catalogs.products.find((product) => product.id === line.productId)?.purchaseUnit.name" disabled class="field-control" /></label><button type="button" class="icon-button mb-1 text-danger" title="Quitar producto" :disabled="requestForm.details.length === 1" @click="requestForm.details.splice(index, 1)"><Trash2 class="h-4 w-4" /></button></div></div></div><details class="border-t border-border pt-4" :open="!!requestForm.notes"><summary class="cursor-pointer text-sm font-medium text-muted-fg">Observaciones (opcional)</summary><label class="mt-3 block text-sm font-medium text-fg">Observaciones<textarea v-model="requestForm.notes" class="mt-1.5 min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" maxlength="2000" /></label></details><div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="closeDrawer()">Cancelar</AppButton><AppButton type="submit" :disabled="saving">Guardar borrador</AppButton></div></fieldset></form>

      <form v-else-if="drawer === 'quotation' && (eligibleRequests.length > 0 || editingId)" class="mt-6 space-y-6" @submit.prevent="saveQuotation"><fieldset :disabled="saving" class="min-w-0 space-y-6"><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Proveedor<select v-model.number="quotationForm.supplierId" required class="field-control"><option disabled :value="0">Seleccionar proveedor</option><option v-for="supplier in catalogs.suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.code }} · {{ supplier.name }}</option></select></label><AppInput v-model="quotationForm.currency" label="Moneda" pattern="[A-Z]{3}" required maxlength="3" /><AppInput v-model="quotationForm.quotationDate" type="date" label="Fecha de cotización" required /><AppInput v-model="quotationForm.validUntil" type="date" label="Vigente hasta" :min="quotationForm.quotationDate" required /><AppInput v-model="quotationForm.paymentTerms" label="Condiciones de pago" /><AppInput v-model="quotationForm.deliveryDays as any" type="number" min="0" label="Entrega general (días)" /></div><div><h3 class="font-semibold text-fg">Solicitudes aprobadas</h3><div class="grid gap-2 sm:grid-cols-2"><label v-for="request in eligibleRequests" :key="request.id" class="flex items-start gap-2 rounded-lg border border-border p-3 text-sm"><input v-model="quotationForm.requestIds" type="checkbox" :value="request.id" class="mt-0.5 h-4 w-4" @change="rebuildQuoteLines" /><span><strong class="block text-fg">{{ request.code }}</strong><span class="text-muted-fg">{{ request.branch.name }} · {{ purchasePurposeLabel(request.purpose) }}</span></span></label></div></div><div><h3 class="font-semibold text-fg">Oferta por producto</h3><div class="mt-3 space-y-4"><div v-for="line in quotationForm.details" :key="line.productId" class="border-t border-border pt-4"><p class="mb-3 font-medium text-fg">{{ catalogs.products.find((product) => product.id === line.productId)?.name }} <span class="text-sm font-normal text-muted-fg">· {{ line.quantity }} {{ catalogs.products.find((product) => product.id === line.productId)?.purchaseUnit.name }}</span></p><div class="grid gap-3 sm:grid-cols-3"><AppInput v-model="line.unitPrice as any" type="number" min="0" step="0.0001" label="Precio unitario" required /><AppInput v-model="line.taxRate as any" type="number" min="0" max="100" step="0.01" label="Impuesto %" /><AppInput v-model="line.availableQuantity as any" type="number" min="0" :max="line.quantity" step="1" label="Cantidad disponible" required /></div><details class="mt-3" :open="Number(line.discount) > 0 || Number(line.deliveryDays) > 0"><summary class="cursor-pointer text-sm text-muted-fg">Descuento y plazo de entrega</summary><div class="mt-3 grid gap-3 sm:grid-cols-2"><AppInput v-model="line.discount as any" type="number" min="0" :max="Number(line.quantity) * Number(line.unitPrice)" step="0.01" label="Descuento" /><AppInput v-model="line.deliveryDays as any" type="number" min="0" label="Entrega (días)" /></div></details></div><div v-if="!quotationForm.details.length" class="border-y border-border py-6 text-sm"><p class="text-muted-fg">{{ eligibleRequests.length ? 'Sin solicitudes seleccionadas.' : 'No hay solicitudes aprobadas pendientes de cotizar.' }}</p><RouterLink v-if="!eligibleRequests.length && can('purchase_requests.view')" to="/purchases/requests" class="mt-2 inline-block font-medium text-accent">Ver solicitudes</RouterLink></div></div></div><details class="border-t border-border pt-4" :open="quotationForm.expenses.length > 0"><summary class="mb-3 cursor-pointer text-sm font-medium text-muted-fg">Gastos adicionales ({{ quotationForm.expenses.length }})</summary><div><div class="flex items-center justify-between"><div><h3 class="font-semibold text-fg">Gastos ofertados</h3><p class="text-sm text-muted-fg">Flete, seguro y otros conceptos configurables.</p></div><AppButton variant="outline" size="sm" type="button" :disabled="!catalogs.expenseTypes.length" v-if="can('purchase_expenses.create') && (!editingId || can('purchase_expenses.update'))" @click="addExpense(quotationForm.expenses)"><Plus class="h-4 w-4" />Gasto</AppButton></div><div v-for="(expense, index) in quotationForm.expenses" :key="index" class="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_130px_36px]"><label class="text-sm font-medium text-fg">Tipo<select v-model.number="expense.expenseTypeId" :disabled="editingId ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" required class="field-control"><option v-for="type in catalogs.expenseTypes" :key="type.id" :value="type.id">{{ type.name }}</option></select></label><AppInput v-model="expense.description" :disabled="editingId ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" label="Descripción" /><AppInput v-model="expense.amount as any" :disabled="editingId ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" type="number" min="0" step="0.01" label="Monto" required /><button type="button" class="icon-button mt-7 text-danger" title="Quitar gasto" :disabled="editingId ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" @click="quotationForm.expenses.splice(index, 1)"><Trash2 class="h-4 w-4" /></button></div></div></details><div class="grid gap-2 rounded-lg bg-surface-secondary p-4 text-sm sm:grid-cols-5"><span>Subtotal<br><strong>{{ money(quoteTotals.subtotal) }}</strong></span><span>Descuento<br><strong>{{ money(quoteTotals.discount) }}</strong></span><span>Impuestos<br><strong>{{ money(quoteTotals.tax) }}</strong></span><span>Gastos<br><strong>{{ money(quoteTotals.expenses) }}</strong></span><span>Total<br><strong class="text-base text-fg">{{ money(quoteTotals.total) }}</strong></span></div><div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="closeDrawer()">Cancelar</AppButton><AppButton type="submit" :disabled="saving || !quotationForm.details.length">Guardar cotización</AppButton></div></fieldset></form>

      <section v-else-if="drawer === 'quotation'" class="mt-6 space-y-4 border-y border-border py-6"><h3 class="font-semibold text-fg">No hay solicitudes aprobadas pendientes</h3><AppButton v-if="can('purchase_requests.view')" type="button" @click="router.push('/purchases/requests')"><ClipboardCheck class="h-4 w-4" />Ver solicitudes de compra</AppButton><AppButton type="button" variant="outline" @click="closeDrawer()">Cerrar</AppButton></section>
      <form v-else-if="drawer === 'order'" class="mt-6 space-y-6" @submit.prevent="saveOrder"><fieldset :disabled="saving" class="min-w-0 space-y-6"><section v-if="editingId" class="space-y-4"><div v-if="selected?.status==='returned' && selected.reviewNotes" class="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"><p class="mb-1 font-medium">Observaciones de Gerencia</p><p class="whitespace-pre-wrap">{{ selected.reviewNotes }}</p></div><label v-if="editableOrderQuotes.length" class="block text-sm font-medium">Oferta / proveedor<select v-model.number="orderForm.quotationId" class="field-control" @change="changeOrderProvider"><option v-for="quote in editableOrderQuotes" :key="quote.id" :value="quote.id">{{ quote.code }} · {{ quote.supplier.name }}</option></select></label><div v-for="line in orderForm.details" :key="line.quotationDetailId" class="rounded-xl border border-border p-4"><p class="mb-3 text-sm font-medium">{{ line.productName }}</p><div class="grid gap-3 sm:grid-cols-4"><label class="text-xs">Cantidad<input v-model.number="line.quantity" type="number" min="1" step="1" required class="field-control" /></label><label class="text-xs">Precio unitario<input v-model.number="line.unitPrice" type="number" min="0.0001" step="0.0001" required class="field-control" /></label><label class="text-xs">Descuento total<input v-model.number="line.discount" type="number" min="0" step="0.01" class="field-control" /></label><label class="text-xs">Impuesto %<input v-model.number="line.taxRate" type="number" min="0" max="100" step="0.01" class="field-control" /></label></div></div><label class="block text-sm">Motivo de los cambios<input v-model="orderForm.confirmationReason" required maxlength="500" class="field-control" /></label><label class="flex items-start gap-2 text-sm"><input v-model="orderForm.confirmOfferChanges" type="checkbox" class="mt-1" />Confirmé con el proveedor las nuevas cantidades, precios o condiciones; la referencia está en el motivo.</label><p class="text-xs text-warning">Las cantidades no pueden superar lo autorizado antes de cotizar. Los cambios se enviarán nuevamente a Gerencia.</p></section><div v-if="orderQuotation" class="rounded-lg border border-border bg-surface-secondary p-4"><p class="text-xs font-semibold text-muted-fg">COTIZACIÓN DE ORIGEN</p><p class="mt-1 font-semibold text-fg">{{ orderQuotation.code }} · {{ orderQuotation.supplier?.name }}</p></div><div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Sucursal<select v-model.number="orderForm.branchId" disabled required class="field-control"><option disabled :value="0">Seleccionar sucursal</option><option v-for="branch in catalogs.branches" :key="branch.id" :value="branch.id">{{ branch.name }}</option></select></label><label class="text-sm font-medium text-fg">Almacén destino<select v-model.number="orderForm.warehouseId" disabled required class="field-control"><option disabled :value="0">Seleccionar almacén</option><option v-for="warehouse in orderWarehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option></select></label><AppInput v-model="orderForm.expectedDate" type="date" :min="dateValue()" label="Fecha esperada" required /><AppInput v-model="orderForm.paymentTerms" label="Condiciones de pago" :disabled="!editingId" maxlength="100" /></div><section v-if="!editingId"><h3 class="font-semibold text-fg">Productos a ordenar</h3><div v-for="line in orderSelections" :key="line.quotationDetailId" class="mt-3 grid items-end gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_160px]"><div><p class="font-medium">{{ line.productName }}</p><p class="text-xs text-muted-fg">Disponible pendiente: {{ line.pending }}</p></div><AppInput v-model="line.quantity as any" type="number" min="0" :max="line.pending" step="1" label="Cantidad" required /></div><p v-if="!orderSelections.length" class="mt-3 text-sm text-muted-fg">La cotización no tiene cantidades pendientes.</p></section><details class="border-t border-border pt-4" :open="!!orderForm.notes"><summary class="cursor-pointer text-sm font-medium text-muted-fg">Observaciones (opcional)</summary><label class="mt-3 block text-sm font-medium text-fg">Observaciones<textarea v-model="orderForm.notes" class="mt-1.5 min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" /></label></details><div v-if="editingId"><div class="flex items-center justify-between"><h3 class="font-semibold text-fg">Gastos acordados</h3><AppButton variant="outline" size="sm" type="button" :disabled="!catalogs.expenseTypes.length" v-if="can('purchase_expenses.create')" @click="addExpense(orderForm.expenses)"><Plus class="h-4 w-4" />Gasto</AppButton></div><div v-for="(expense, index) in orderForm.expenses" :key="index" class="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_130px_36px]"><label class="text-sm font-medium text-fg">Tipo<select v-model.number="expense.expenseTypeId" :disabled="expense.id ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" required class="field-control"><option v-for="type in catalogs.expenseTypes" :key="type.id" :value="type.id">{{ type.name }}</option></select></label><AppInput v-model="expense.description" :disabled="expense.id ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" label="Descripción" /><AppInput v-model="expense.amount as any" :disabled="expense.id ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" type="number" min="0" step="0.01" label="Monto" required /><button type="button" class="icon-button mt-7 text-danger" title="Quitar gasto" :disabled="expense.id ? !can('purchase_expenses.update') : !can('purchase_expenses.create')" @click="orderForm.expenses.splice(index, 1)"><Trash2 class="h-4 w-4" /></button></div></div><div v-if="editingId" class="grid gap-3 rounded-xl bg-surface-secondary p-4 text-sm sm:grid-cols-4"><span>Subtotal<strong class="mt-1 block">{{ money(orderEditTotals.subtotal,selected?.currency) }}</strong></span><span>Impuestos<strong class="mt-1 block">{{ money(orderEditTotals.tax,selected?.currency) }}</strong></span><span>Gastos previstos<strong class="mt-1 block">{{ money(orderEditTotals.expenses,selected?.currency) }}</strong></span><span>Total actualizado<strong class="mt-1 block text-base">{{ money(orderEditTotals.total,selected?.currency) }}</strong></span></div><div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="closeDrawer()">Cancelar</AppButton><AppButton type="submit" :disabled="saving || (!editingId && !orderSelections.some((line) => Number(line.quantity) > 0))">{{ saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Generar orden' }}</AppButton></div></fieldset></form>

      <form v-else-if="drawer === 'receive'" class="mt-6 space-y-6" @submit.prevent="receiveOrder"><fieldset :disabled="saving || !!receiptReview" class="min-w-0 space-y-6">
        <div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="receiveForm.supplierInvoiceNumber" label="Factura del proveedor" placeholder="Opcional" /><AppInput v-model="receiveForm.supplierInvoiceDate" type="date" label="Fecha de factura" /></div>
        <div>
          <p class="mb-4 text-sm text-muted-fg">{{ selected?.code }} · {{ selected?.supplier.name }} · {{ selected?.warehouse.name }}</p>
          <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold text-fg">Mercadería recibida</h3><AppButton type="button" variant="outline" size="sm" @click="fillPendingReceipt"><Check class="h-4 w-4" />Completar pendientes</AppButton></div>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-[650px] text-left text-sm">
              <thead class="border-y border-border bg-surface-secondary text-xs text-muted-fg"><tr><th class="p-3">Producto / Ubicación</th><th class="p-3 text-right">Ordenado</th><th class="p-3 text-right">Recibido anteriormente</th><th class="w-32 p-3">Recibido ahora</th><th class="p-3 text-right">Pendiente</th></tr></thead>
              <tbody class="divide-y divide-border">
                <tr v-for="row in receiptRows" :key="row.item.orderDetailId">
                  <td class="min-w-52 p-3"><p class="font-medium">{{ row.line?.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ row.line?.unit.name }}</p>
                    <select v-model.number="row.item.locationId" :aria-label="'Ubicación de ' + row.line?.product.name" :disabled="Number(row.item.quantity) <= 0" class="field-control mt-2"><option :value="0">Sugerir espacio (pendiente de confirmación)</option><option v-for="location in receiveLocations" :key="location.id" :value="location.id">{{ location.code }} · {{ location.aisle }} / {{ location.rack }} / {{ location.level }}</option></select>
                  </td>
                  <td class="p-3 text-right tabular-nums">{{ Number(row.line?.quantity) }}</td>
                  <td class="p-3 text-right tabular-nums">{{ Number(row.line?.receivedQuantity) }}</td>
                  <td class="p-3"><input v-model="row.item.quantity" type="number" min="0" :max="row.pending" step="1" :aria-label="'Recibido ahora de ' + row.line?.product.name" required class="field-control w-28" /></td>
                  <td class="p-3 text-right font-medium tabular-nums">{{ row.remaining }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!receiveLocations.length" class="mt-4 text-sm text-muted-fg">La recepción quedará pendiente de ubicación hasta registrar un espacio.</p>
        </div>
        <label class="block text-sm font-medium text-fg">Observaciones de recepción<textarea v-model="receiveForm.notes" class="mt-1.5 min-h-20 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" maxlength="2000" /></label>
        <div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="closeDrawer()">Cancelar</AppButton><AppButton type="submit" :disabled="saving || !receiveForm.items.some((item) => Number(item.quantity) > 0)">Revisar recepción</AppButton></div>
      </fieldset></form>

    </aside></div>
    <PurchaseActionDialog v-if="receiptReview" title="Confirmar recepción" :description="receiptReview.description" :busy="saving" :error="errorMessage" @confirm="confirmReceipt" @close="receiptReview = null" />
    <PurchaseActionDialog v-if="discardChanges" title="Descartar cambios" description="Hay cambios sin guardar en este documento. ¿Deseas descartarlos?" @confirm="closeDrawer(true)" @close="discardChanges = false" />
    <PurchaseActionDialog v-if="leaving" title="Salir sin guardar" description="Los cambios de este documento no se han guardado." @confirm="resolveLeave(true)" @close="resolveLeave(false)" />
    <PurchaseActionDialog v-if="pendingAction" :title="pendingAction.title" :description="pendingAction.description" :require-reason="pendingAction.reason" :busy="saving" :error="errorMessage" @confirm="confirmAction" @close="pendingAction = null" />
    <p v-if="loading || preparingReceipt" role="status" class="mt-3 text-sm text-muted-fg">{{ preparingReceipt ? 'Consultando cantidades pendientes...' : 'Actualizando documentos...' }}</p>
  </AdminLayout>
</template>
