<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { Calculator, CheckCircle2, LockKeyhole, Pencil, Plus, RefreshCw, Search, ShieldCheck, X, XCircle } from "lucide-vue-next";
import { RouterLink, useRoute, useRouter } from "vue-router";
import PurchaseActionDialog from "../components/base/PurchaseActionDialog.vue";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppBadge from "../components/base/AppBadge.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import { usePermissions } from "../composables/usePermissions";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { onlyOptionId } from "../utils/purchase-workflow";
import { activeCompanyId } from "../services/company-context";
import { http } from "../services/http.service";
import { getApiErrorMessage } from "../utils/api-error";

type FobLine = { purchaseItemId: number; costFob: number };

const { can } = usePermissions();
const route = useRoute();
const router = useRouter();
let version = 0;
let mounted = true;
const confirmation = ref<{ action: string; message: string; title: string; description: string; reason: boolean } | null>(null);
const records = ref<any[]>([]);
const purchases = ref<any[]>([]);
const selectedId = ref<number | null>(null);
const search = ref("");
const statusFilter = ref("");
const loading = ref(false);
const saving = ref(false);
const drawerOpen = ref(false);
const discardChanges = ref(false);
let initialForm = '';
const { leaving, resolveLeave } = useUnsavedChanges(
  () => drawerOpen.value && JSON.stringify(form) !== initialForm,
  () => saving.value,
);
const editingId = ref<number | null>(null);
const errorMessage = ref("");
const successMessage = ref("");
const form = reactive({
  purchaseId: 0,
  retaceoDate: "",
  originCountry: "",
  importInvoiceNumber: "",
  importInvoiceDate: "",
  importPolicyNumber: "",
  importPolicyDate: "",
  totalFreight: 0,
  totalExpenses: 0,
  totalDai: 0,
  importVat: 0,
  notes: "",
  details: [] as FobLine[],
});

const selected = computed(() => filteredRecords.value.find((record) => record.id === selectedId.value) ?? null);
const selectedPurchase = computed(() => purchases.value.find((purchase) => purchase.id === form.purchaseId) ?? null);
const eligiblePurchases = computed(() => purchases.value.filter((purchase) => !purchase.retaceos?.some((record: any) => record.status !== "cancelled")));
const filteredRecords = computed(() => {
  const term = search.value.trim().toLowerCase();
  return records.value.filter((record) => {
    const text = `${record.code} ${record.supplier?.name ?? ""} ${record.purchase?.documentNumber ?? ""} ${record.importInvoiceNumber ?? ""}`.toLowerCase();
    return (!term || text.includes(term)) && (!statusFilter.value || record.status === statusFilter.value);
  });
});
const preview = computed(() => {
  const fob = form.details.reduce((sum, line) => sum + Number(line.costFob || 0), 0);
  const acquisition = fob + Number(form.totalFreight || 0) + Number(form.totalExpenses || 0) + Number(form.totalDai || 0);
  return { fob, acquisition };
});

function dateValue() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function money(value: unknown, currency = (drawerOpen.value ? selectedPurchase.value?.currency : selected.value?.purchase.currency) ?? "USD") {
  return new Intl.NumberFormat("es-SV", { style: "currency", currency }).format(Number(value ?? 0));
}

function shortDate(value: string) {
  return new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: string) {
  return ({ draft: "Borrador", calculated: "Calculado", verified: "Verificado", closed: "Cerrado", cancelled: "Cancelado" } as Record<string, string>)[status] ?? status;
}

function statusVariant(status: string): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "closed") return "success";
  if (status === "cancelled") return "danger";
  if (status === "verified") return "info";
  if (status === "calculated") return "warning";
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
  const currentVersion = ++version;
  const companyId = activeCompanyId.value;
  if (!companyId) { loading.value = false; return; }
  loading.value = true;
  const config = { headers: { "X-Company-Id": String(companyId) } };
  try {
    const [retaceosResponse, purchasesResponse] = await Promise.all([http.get("/retaceos", config), http.get("/retaceos/purchases", config)]);
    if (!mounted || currentVersion !== version || companyId !== activeCompanyId.value) return;
    records.value = retaceosResponse.data.data;
    purchases.value = purchasesResponse.data.data;
    const related = records.value.find((record) => route.query.id ? record.id === Number(route.query.id) : record.purchaseId === Number(route.query.purchaseId) && record.status !== "cancelled");
    if (route.query.id || route.query.purchaseId) selectedId.value = related?.id ?? null;
    else if (!filteredRecords.value.some((record) => record.id === selectedId.value)) selectedId.value = filteredRecords.value[0]?.id ?? null;
  } catch (error) {
    if (mounted && currentVersion === version && companyId === activeCompanyId.value) showError(error, "No se pudo cargar el retaceo");
  } finally {
    if (currentVersion === version) loading.value = false;
  }
}

function fillFromPurchase(purchase: any) {
  form.importInvoiceNumber = purchase?.supplierInvoiceNumber ?? "";
  form.importInvoiceDate = purchase?.supplierInvoiceDate?.slice(0, 10) ?? "";
  form.details = (purchase?.items ?? []).map((item: any) => ({ purchaseItemId: item.id, costFob: Number(item.lineTotal) }));
}

function newRetaceo() {
  const purchase = eligiblePurchases.value.find((item) => item.id === Number(route.query.purchaseId || onlyOptionId(eligiblePurchases.value)));
  errorMessage.value = "";
  editingId.value = null;
  Object.assign(form, {
    purchaseId: purchase?.id ?? 0,
    retaceoDate: dateValue(),
    originCountry: "",
    importInvoiceNumber: purchase?.supplierInvoiceNumber ?? "",
    importInvoiceDate: purchase?.supplierInvoiceDate?.slice(0, 10) ?? "",
    importPolicyNumber: "",
    importPolicyDate: "",
    totalFreight: 0,
    totalExpenses: 0,
    totalDai: 0,
    importVat: 0,
    notes: "",
    details: [],
  });
  fillFromPurchase(purchase);
  drawerOpen.value = true;
}

function editRetaceo(record: any) {
  errorMessage.value = "";
  editingId.value = record.id;
  Object.assign(form, {
    purchaseId: record.purchaseId,
    retaceoDate: record.retaceoDate.slice(0, 10),
    originCountry: record.originCountry ?? "",
    importInvoiceNumber: record.importInvoiceNumber ?? "",
    importInvoiceDate: record.importInvoiceDate?.slice(0, 10) ?? "",
    importPolicyNumber: record.importPolicyNumber ?? "",
    importPolicyDate: record.importPolicyDate?.slice(0, 10) ?? "",
    totalFreight: Number(record.totalFreight),
    totalExpenses: Number(record.totalExpenses),
    totalDai: Number(record.totalDai),
    importVat: Number(record.importVat),
    notes: record.notes ?? "",
    details: record.details.map((detail: any) => ({ purchaseItemId: detail.purchaseItemId, costFob: Number(detail.costFob) })),
  });
  drawerOpen.value = true;
}

function closeDrawer(force = false) {
  if (saving.value && !force) return;
  if (!force && JSON.stringify(form) !== initialForm) { discardChanges.value = true; return; }
  discardChanges.value = false;
  drawerOpen.value = false;
  editingId.value = null;
}

async function save() {
  if (saving.value || !activeCompanyId.value) return;
  if (!form.purchaseId || !form.details.length) return showError(null, "Seleccione una recepción con productos");
  if (!Number.isFinite(preview.value.acquisition) || preview.value.fob <= 0 && preview.value.acquisition > 0) return showError(null, "El FOB debe ser mayor que cero para distribuir gastos");
  const companyId = activeCompanyId.value;
  saving.value = true;
  errorMessage.value = "";
  try {
    const payload = {
      ...form,
      importInvoiceDate: form.importInvoiceDate || null,
      importPolicyDate: form.importPolicyDate || null,
    };
    const config = { headers: { "X-Company-Id": String(companyId) } };
    const response = editingId.value ? await http.patch(`/retaceos/${editingId.value}`, payload, config) : await http.post("/retaceos", payload, config);
    if (!mounted || companyId !== activeCompanyId.value) return;
    selectedId.value = response.data.data.id;
    showSuccess(editingId.value ? "Retaceo actualizado. Pendiente de cálculo" : "Retaceo creado en borrador");
    closeDrawer(true);
    search.value = ''; statusFilter.value = '';
    await router.replace({ query: { id: String(selectedId.value) } });
    await load();
  } catch (error) {
    if (mounted && companyId === activeCompanyId.value) showError(error, "No se pudo guardar el retaceo");
  } finally {
    saving.value = false;
  }
}

async function workflow(action: string, message: string, confirmed = false, reason = "") {
  if (!selected.value || saving.value || !activeCompanyId.value) return;
  if (!confirmed && ["close", "cancel"].includes(action)) {
    errorMessage.value = "";
    confirmation.value = { action, message, title: action === "close" ? "Cerrar retaceo" : "Cancelar retaceo", description: action === "close" ? `Se confirmará el costo real de ${selected.value.details.length} productos de ${selected.value.code}. El retaceo quedará cerrado y no podrá editarse.` : `Se cancelará ${selected.value.code}. La recepción quedará disponible para un nuevo retaceo.`, reason: action === "cancel" };
    return;
  }
  const companyId = activeCompanyId.value;
  saving.value = true;
  errorMessage.value = "";
  try {
    const response = await http.post(`/retaceos/${selected.value.id}/${action}`, { reason }, { headers: { "X-Company-Id": String(companyId) } });
    if (!mounted || companyId !== activeCompanyId.value) return;
    selectedId.value = response.data.data.id;
    confirmation.value = null;
    showSuccess(message);
    await load();
  } catch (error) {
    if (mounted && companyId === activeCompanyId.value) showError(error, "No se pudo completar la acción");
  } finally {
    saving.value = false;
  }
}

function confirmWorkflow(reason: string) {
  if (confirmation.value) workflow(confirmation.value.action, confirmation.value.message, true, reason);
}

function traceDocuments(record: any) {
  const order = record.purchase?.purchaseOrder;
  const requests = order?.quotation?.requestLinks?.map((link: any) => ({
    code: link.request.code, path: `/purchases/requests?id=${link.request.id}`, permission: 'purchase_requests.view',
  })) ?? [];
  return [...requests,
    ...(order?.quotation ? [{ code: order.quotation.code, path: `/purchases/quotations?id=${order.quotation.id}`, permission: 'purchase_quotations.view' }] : []),
    ...(order ? [{ code: order.code, path: `/purchases/orders?id=${order.id}`, permission: 'purchase_orders.view' }] : []),
    { code: record.purchase.documentNumber, path: `/purchases/receipts?id=${record.purchase.id}`, permission: 'purchases.view' },
  ].filter(item => can(item.permission));
}

async function selectRecord(id: number) {
  if (saving.value) return;
  selectedId.value = id;
  await router.replace({ query: { id: String(id) } });
}
watch(drawerOpen, value => { if (value) initialForm = JSON.stringify(form); }, { flush: 'post' });
watch(() => [route.query.id, route.query.purchaseId], () => {
  search.value = ''; statusFilter.value = '';
  if (Number(route.query.id) !== selectedId.value) void load();
});
watch(() => form.purchaseId, (id, previous) => {
  if (!drawerOpen.value || editingId.value || id === previous) return;
  fillFromPurchase(purchases.value.find((purchase) => purchase.id === id));
});
watch(activeCompanyId, () => {
  ++version; records.value = []; purchases.value = [];
  selectedId.value = null; search.value = ""; statusFilter.value = "";
  confirmation.value = null; errorMessage.value = ""; successMessage.value = "";
  closeDrawer(true); load();
}, { flush: "sync" });
watch(filteredRecords, (items) => { if (!items.some((item) => item.id === selectedId.value)) selectedId.value = items[0]?.id ?? null; });
onBeforeUnmount(() => { mounted = false; ++version; });
onMounted(load);
</script>

<template>
  <AdminLayout title="Retaceo">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="section-eyebrow">Costo real de adquisición</p>
        <h1 class="page-title mt-1">Retaceo</h1>
        <p class="page-subtitle">Distribuye costos de importación sobre lo realmente recibido, con control y trazabilidad.</p>
      </div>
      <div class="flex gap-2">
        <AppButton variant="outline" :disabled="loading || saving" title="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" />Actualizar</AppButton>
        <AppButton v-if="can('retaceos.create')" :disabled="loading || saving || !eligiblePurchases.length" @click="newRetaceo"><Plus class="h-4 w-4" />Nuevo retaceo</AppButton>
      </div>
    </div>

    <div v-if="errorMessage" role="alert" class="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{{ errorMessage }}</div>
    <div v-if="successMessage" role="status" class="mb-4 rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">{{ successMessage }}</div>

    <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_190px]">
      <label class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><input v-model="search" aria-label="Buscar retaceos" class="mt-0 h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg" placeholder="Código, proveedor, recepción o factura" /></label>
      <select v-model="statusFilter" aria-label="Filtrar por estado" class="field-control"><option value="">Todos los estados</option><option v-for="status in ['draft','calculated','verified','closed','cancelled']" :key="status" :value="status">{{ statusLabel(status) }}</option></select>
    </div>

    <div class="grid min-h-[600px] overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[350px_minmax(0,1fr)]">
      <aside class="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
        <div class="border-b border-border px-4 py-3 text-xs font-semibold text-muted-fg">{{ filteredRecords.length }} RETACEOS</div>
        <div class="scrollbar-thin max-h-[250px] lg:max-h-[650px] overflow-y-auto p-2">
          <button v-for="record in filteredRecords" :key="record.id" class="mb-1 w-full rounded-lg px-3 py-3 text-left transition" :class="selectedId === record.id ? 'bg-accent-soft' : 'hover:bg-surface-secondary'"  :disabled="saving" @click="selectRecord(record.id)">
            <span class="flex items-start justify-between gap-3"><span class="min-w-0"><strong class="block truncate text-fg">{{ record.code }}</strong><span class="mt-1 block truncate text-xs text-muted-fg">{{ record.supplier.name }} · {{ record.purchase.documentNumber }}</span></span><AppBadge :variant="statusVariant(record.status)">{{ statusLabel(record.status) }}</AppBadge></span>
            <span class="mt-2 flex justify-between text-xs text-muted-fg"><span>{{ shortDate(record.retaceoDate) }}</span><strong class="text-fg">{{ money(record.totalCost, record.purchase.currency) }}</strong></span>
          </button>
          <p v-if="!filteredRecords.length" class="px-4 py-12 text-center text-sm text-muted-fg">No hay retaceos para mostrar.</p>
        </div>
      </aside>

      <main v-if="selected" class="min-w-0">
        <header class="border-b border-border p-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div><div class="flex items-center gap-2"><h2 class="text-xl font-semibold text-fg">{{ selected.code }}</h2><AppBadge :variant="statusVariant(selected.status)">{{ statusLabel(selected.status) }}</AppBadge></div><p class="mt-1 text-sm text-muted-fg">{{ selected.supplier.name }} · Recepción {{ selected.purchase.documentNumber }}</p></div>
            <fieldset :disabled="saving" class="flex flex-wrap gap-2">
              <AppButton v-if="['draft','calculated'].includes(selected.status) && can('retaceos.update')" variant="outline" @click="editRetaceo(selected)"><Pencil class="h-4 w-4" />Editar</AppButton>
              <AppButton v-if="['draft','calculated'].includes(selected.status) && can('retaceos.calculate')" @click="workflow('calculate','Retaceo calculado')"><Calculator class="h-4 w-4" />Calcular</AppButton>
              <AppButton v-if="selected.status === 'calculated' && can('retaceos.verify')" @click="workflow('verify','Retaceo verificado')"><ShieldCheck class="h-4 w-4" />Verificar</AppButton>
              <AppButton v-if="selected.status === 'verified' && can('retaceos.close')" @click="workflow('close','Retaceo cerrado y costo real confirmado')"><LockKeyhole class="h-4 w-4" />Cerrar</AppButton>
              <AppButton v-if="!['closed','cancelled'].includes(selected.status) && can('retaceos.cancel')" variant="outline" @click="workflow('cancel','Retaceo cancelado')"><XCircle class="h-4 w-4" />Cancelar</AppButton>
            </fieldset>
          </div>
          <nav aria-label="Documentos de origen del retaceo" class="mt-4 flex flex-wrap items-center gap-4 text-sm"><RouterLink v-for="document in traceDocuments(selected)" :key="document.path" :to="document.path" class="font-medium text-accent hover:underline">{{ document.code }}</RouterLink></nav>
        </header>

        <section class="grid gap-px border-b border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
          <div v-for="item in [
            ['FOB', selected.totalFob], ['Flete', selected.totalFreight], ['Otros gastos', selected.totalExpenses], ['DAI', selected.totalDai], ['IVA excluido', selected.importVat], [selected.status === 'draft' ? 'Costo previsto' : 'Costo adquisición', selected.totalCost]
          ]" :key="item[0]" class="bg-surface p-4"><p class="text-xs font-medium text-muted-fg">{{ item[0] }}</p><p class="mt-1 text-lg font-semibold text-fg">{{ money(item[1]) }}</p></div>
        </section>

        <section class="p-5">
          <div class="mb-3 flex items-end justify-between gap-4"><div><h3 class="font-semibold text-fg">Distribución por producto</h3><p class="text-sm text-muted-fg">El porcentaje se calcula dinámicamente sobre el FOB. El IVA de importación no participa.</p></div><CheckCircle2 v-if="selected.excludesImportVat" class="h-5 w-5 text-success" /></div>
          <div class="overflow-x-auto rounded-lg border border-border"><table class="w-full min-w-[980px] text-left text-sm"><thead class="border-b border-border bg-surface-secondary text-xs text-muted-fg"><tr><th class="px-4 py-3">Producto</th><th class="px-4 py-3 text-right">Cantidad</th><th class="px-4 py-3 text-right">FOB</th><th class="px-4 py-3 text-right">Distribución</th><th class="px-4 py-3 text-right">Flete</th><th class="px-4 py-3 text-right">Gastos</th><th class="px-4 py-3 text-right">DAI</th><th class="px-4 py-3 text-right">Costo unitario</th><th class="px-4 py-3 text-right">Costo total</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="detail in selected.details" :key="detail.id"><td class="px-4 py-3"><strong class="text-fg">{{ detail.product.name }}</strong><span class="block text-xs text-muted-fg">{{ detail.product.internalCode }} · {{ detail.purchaseItem?.location?.code ?? 'Sin ubicación' }}</span></td><td class="px-4 py-3 text-right">{{ Number(detail.quantity) }}</td><td class="px-4 py-3 text-right">{{ money(detail.costFob) }}</td><td class="px-4 py-3 text-right">{{ Number(detail.distributionPercent).toFixed(2) }}%</td><td class="px-4 py-3 text-right">{{ money(detail.freightAmount) }}</td><td class="px-4 py-3 text-right">{{ money(detail.expenseAmount) }}</td><td class="px-4 py-3 text-right">{{ money(detail.daiAmount) }}</td><td class="px-4 py-3 text-right font-medium">{{ money(detail.unitCost) }}</td><td class="px-4 py-3 text-right font-semibold text-fg">{{ money(detail.totalCost) }}</td></tr></tbody></table></div>
        </section>
        <section class="border-t border-border p-5">
          <h3 class="font-semibold text-fg">Datos de importación</h3>
          <dl class="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt class="text-muted-fg">Factura</dt><dd>{{ selected.importInvoiceNumber || 'Sin factura' }}<span v-if="selected.importInvoiceDate"> · {{ shortDate(selected.importInvoiceDate) }}</span></dd></div>
            <div><dt class="text-muted-fg">Póliza</dt><dd>{{ selected.importPolicyNumber || 'Sin póliza' }}<span v-if="selected.importPolicyDate"> · {{ shortDate(selected.importPolicyDate) }}</span></dd></div>
            <div><dt class="text-muted-fg">Origen</dt><dd>{{ selected.originCountry || 'No indicado' }}</dd></div>
            <div><dt class="text-muted-fg">Destino</dt><dd>{{ selected.purchase.branch?.name }} · {{ selected.purchase.warehouse?.name }}</dd></div>
          </dl>
          <p v-if="selected.notes" class="mt-4 whitespace-pre-wrap break-words text-sm text-muted-fg">{{ selected.notes }}</p>
        </section>
      </main>
      <main v-else class="grid place-items-center p-10 text-center"><div><Calculator class="mx-auto h-10 w-10 text-muted-fg" /><p class="mt-3 font-medium text-fg">Selecciona un retaceo</p><p class="mt-1 text-sm text-muted-fg">Aquí verás su cálculo, porcentajes y trazabilidad.</p></div></main>
    </div>

    <div v-if="drawerOpen" class="fixed inset-0 z-50 bg-black/45" @click.self="closeDrawer()"><aside role="dialog" aria-modal="true" aria-label="Retaceo de importación" class="ml-auto h-full w-full max-w-3xl overflow-y-auto bg-surface p-4 shadow-2xl sm:p-6" @keydown.esc="closeDrawer()"><div class="flex items-start justify-between"><div><p class="section-eyebrow">{{ editingId ? 'Modificar borrador' : 'Nueva distribución' }}</p><h2 class="mt-1 text-xl font-semibold text-fg">Retaceo de importación</h2></div><button class="icon-button" title="Cerrar" @click="closeDrawer()"><X class="h-5 w-5" /></button></div>
      <p v-if="errorMessage" role="alert" class="sticky top-0 z-10 mt-4 rounded-lg border border-danger/30 bg-surface p-3 text-sm text-danger">{{ errorMessage }}</p>
      <form class="mt-6 space-y-6" @submit.prevent="save"><fieldset :disabled="saving" class="min-w-0 space-y-6">
        <div class="grid gap-4 sm:grid-cols-2"><label class="text-sm font-medium text-fg">Recepción<select v-model.number="form.purchaseId" :disabled="!!editingId" required class="field-control"><option :value="0" disabled>Seleccionar recepción</option><option v-for="purchase in eligiblePurchases" :key="purchase.id" :value="purchase.id">{{ purchase.documentNumber }} · {{ purchase.supplier.name }}</option><option v-if="editingId && selectedPurchase" :value="selectedPurchase.id">{{ selectedPurchase.documentNumber }} · {{ selectedPurchase.supplier.name }}</option></select></label><AppInput v-model="form.retaceoDate" type="date" label="Fecha de retaceo" required /><AppInput v-model="form.originCountry" label="País de origen" maxlength="100" /><AppInput v-model="form.importInvoiceNumber" label="Factura de importación" maxlength="100" /><AppInput v-model="form.importInvoiceDate" type="date" label="Fecha de factura" /><AppInput v-model="form.importPolicyNumber" label="Póliza de importación" maxlength="100" /><AppInput v-model="form.importPolicyDate" type="date" label="Fecha de póliza" /></div>
        <div><h3 class="font-semibold text-fg">FOB por producto recibido</h3><p class="text-sm text-muted-fg">Estos valores son la base de la distribución proporcional.</p><div class="mt-3 space-y-3"><div v-for="line in form.details" :key="line.purchaseItemId" class="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_180px]"><div><p class="font-medium text-fg">{{ selectedPurchase?.items.find((item: any) => item.id === line.purchaseItemId)?.product.name }}</p><p class="text-xs text-muted-fg">Cantidad recibida: {{ selectedPurchase?.items.find((item: any) => item.id === line.purchaseItemId)?.quantity }}</p></div><AppInput v-model="line.costFob as any" type="number" min="0" step="0.01" label="Costo FOB" required /></div></div></div>
        <div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.totalFreight as any" type="number" min="0" step="0.01" label="Flete total" /><AppInput v-model="form.totalExpenses as any" type="number" min="0" step="0.01" label="Otros gastos" /><AppInput v-model="form.totalDai as any" type="number" min="0" step="0.01" label="DAI total" /><AppInput v-model="form.importVat as any" type="number" min="0" step="0.01" label="IVA de importación (excluido)" /></div>
        <div class="grid gap-3 rounded-lg border border-accent/20 bg-accent/5 p-4 sm:grid-cols-3"><div><p class="text-xs text-muted-fg">FOB</p><strong>{{ money(preview.fob) }}</strong></div><div><p class="text-xs text-muted-fg">Costo de adquisición</p><strong>{{ money(preview.acquisition) }}</strong></div><div><p class="text-xs text-muted-fg">IVA no capitalizado</p><strong>{{ money(form.importVat) }}</strong></div></div>
        <label class="block text-sm font-medium text-fg">Observaciones<textarea v-model="form.notes" maxlength="2000" class="mt-1.5 min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" /></label>
        <div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="closeDrawer()">Cancelar</AppButton><AppButton type="submit" :disabled="saving || !form.purchaseId || !form.details.length">{{ saving ? 'Guardando...' : 'Guardar borrador' }}</AppButton></div>
      </fieldset></form>
    </aside></div>
    <PurchaseActionDialog v-if="confirmation" :title="confirmation.title" :description="confirmation.description" :require-reason="confirmation.reason" :busy="saving" :error="errorMessage" @confirm="confirmWorkflow" @close="confirmation = null" />
    <PurchaseActionDialog v-if="discardChanges" title="Descartar cambios" description="Los cambios del retaceo no se han guardado." @confirm="closeDrawer(true)" @close="discardChanges = false" />
    <PurchaseActionDialog v-if="leaving" title="Salir sin guardar" description="Los cambios del retaceo no se han guardado." @confirm="resolveLeave(true)" @close="resolveLeave(false)" />
    <p v-if="loading" role="status" class="mt-3 text-sm text-muted-fg">Actualizando retaceos...</p>
    <p v-else-if="!eligiblePurchases.length && can('retaceos.create')" class="mt-3 text-sm text-muted-fg">No hay recepciones pendientes de retaceo.</p>
  </AdminLayout>
</template>
