<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Check, ChevronLeft, ChevronRight, LockKeyhole, Pencil, RefreshCw, Search, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import PurchasesNav from "../components/purchases/PurchasesNav.vue";
import PurchaseSectionHeader from "../components/purchases/PurchaseSectionHeader.vue";
import PurchaseTabs from "../components/purchases/PurchaseTabs.vue";
import TrashButton from "../components/admin/TrashButton.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import PurchaseActionDialog from "../components/base/PurchaseActionDialog.vue";
import { http } from "../services/http.service";
import { activeCompanyId } from "../services/company-context";
import { usePermissions } from "../composables/usePermissions";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { getApiErrorMessage } from "../utils/api-error";
import { currentPurchaseWeek, isCurrentPurchaseWeek } from '../utils/purchase-inbox';
import { receiptNextStep, purchaseOriginRequests } from '../utils/purchase-workflow';

type Receipt = {
  id: number; documentNumber: string; status: string; total: string; currency: string; purchaseDate: string;
  supplierInvoiceNumber: string | null; supplierInvoiceDate: string | null; notes: string | null;
  supplier: { name: string }; branch: { name: string }; warehouse: { name: string } | null;
  purchaseOrder: { id: number; code: string; consolidation?: { lines: { sources: { requestDetail: { request: { id: number; code: string; justification: string } } }[] }[] }; quotation: { id: number; code: string; requestLinks: { request: { id: number; code: string; justification: string } }[] } | null } | null;
  items: { id: number; locationId: number | null; quantity: string; quantityOrdered: string; receivedBefore: string | null; unitPrice: string; discount: string; taxAmount: string; total: string; unit: { name: string }; lineTotal: string; product: { name: string; sku: string }; location: { code: string; aisle: string; rack: string; level: string; position: string } | null; purchaseOrderDetail: { quantity: string; receivedQuantity: string; unit: { name: string } } | null }[];
  retaceos: { id: number; code: string; status: string; totalCost: string }[];
  hasActiveRetaceo: boolean; retaceoStatus: string | null; retaceoArchived: boolean;
};
const { can } = usePermissions();
const route = useRoute();
const router = useRouter();
const rows = ref<Receipt[]>([]);
const selected = ref<Receipt | null>(null);
const meta = ref({ page: 1, totalPages: 0, total: 0 });
const search = ref("");
const status = ref("");
const ageTab = ref<'recent' | 'older'>('recent');
const historyFrom = ref(''), historyTo = ref('');
const pendingOnly = ref(false);
const loading = ref(false);
const busy = ref(false);
const editing = ref(false);
const detailView = ref('products');
watch(() => selected.value?.id, () => { detailView.value = 'products'; });
watch(activeCompanyId, () => { detailView.value = 'products'; });
const error = ref("");
const success = ref('');
const nextStep = computed(() => selected.value ? receiptNextStep(selected.value) : null);
const originRequests = computed(() => purchaseOriginRequests(selected.value?.purchaseOrder));
const distributionPath = computed(() => ({ path: '/inventory/warehouse', query: originRequests.value.length === 1 ? { requestId: String(originRequests.value[0]!.id), tab: 'transfers' } : { tab: 'transfers' } }));
const activeRetaceo = computed(() => selected.value?.retaceos.find(r => r.status !== 'cancelled'));
const retaceoPending = computed(() => !!selected.value?.hasActiveRetaceo && selected.value.retaceoStatus !== 'closed');
const filterCount = computed(() => Number(!!status.value) + Number(pendingOnly.value) + (ageTab.value === 'older' ? Number(!!historyFrom.value) + Number(!!historyTo.value) : 0));
const placementPath = computed(() => ({ path: '/inventory/warehouse', query: { purchaseId: String(selected.value?.id) } }));
const action = ref<"verify" | "close" | "cancel" | null>(null);
const form = reactive({ supplierInvoiceNumber: "", supplierInvoiceDate: "", notes: "" });
let originalInvoice = '';
const discardInvoice = ref(false);
const { leaving, resolveLeave } = useUnsavedChanges(
  () => editing.value && JSON.stringify(form) !== originalInvoice,
  () => busy.value,
);
function cancelEdit() {
  if (busy.value) return;
  if (JSON.stringify(form) !== originalInvoice) { discardInvoice.value = true; return; }
  editing.value = false;
}
const labels: Record<string, string> = { RECEIVED: "Recibida", VERIFIED: "Verificada", COSTED: "Retaceada", CLOSED: "Cerrada", CANCELLED: "Cancelada" };
const actionDescription = computed(() => {
  const code = selected.value?.documentNumber;
  if (action.value === 'cancel') return `Cancelar ${code} revertirá su entrada en inventario y devolverá las cantidades a pendientes en la orden. Se requiere existencia suficiente en las ubicaciones originales. El motivo quedará registrado.`;
  if (action.value === 'verify') return `Confirmar la revisión de productos, cantidades y factura de ${code}. Los datos de factura dejarán de ser editables. No se registrará otra entrada en inventario.`;
  return `Cerrar ${code} definitivamente. No podrá editarse ni cancelarse después. Las cantidades pendientes de la orden no se modifican.`;
});
let version = 0;
onBeforeUnmount(() => { version++; });
const money = (amount: string, currency: string) => new Intl.NumberFormat("es-SV", { style: "currency", currency }).format(Number(amount));
async function load(page = 1) {
  const current = ++version;
  const company = activeCompanyId.value;
  if (!company) return;
  loading.value = true;
  error.value = "";
  try {
    const config = { headers: { "X-Company-Id": String(company) } };
    const range = ageTab.value === 'recent' ? currentPurchaseWeek() : { dateFrom: historyFrom.value || undefined, dateTo: historyTo.value || undefined };
    const response = await http.get("/purchases", { ...config, params: { page, ...range, search: search.value || undefined, status: status.value || undefined, pendingOnly: pendingOnly.value || undefined } });
    if (current !== version) return;
    rows.value = response.data.data.items;
    meta.value = response.data.data.meta;
    const id = Number(route.query.id) || selected.value?.id;
    selected.value = rows.value.find((row) => row.id === id) ?? (route.query.id ? null : rows.value[0] ?? null);
    if (Number(route.query.id) && !selected.value) {
      const detail = await http.get(`/purchases/${Number(route.query.id)}`, config);
      if (current !== version) return;
      selected.value = detail.data.data;
      if (ageTab.value === 'recent' && selected.value && !isCurrentPurchaseWeek(selected.value.purchaseDate)) {
        ageTab.value = 'older';
        await load();
      }
    }
  } catch (caught) { if (current === version) error.value = getApiErrorMessage(caught, "No se pudieron cargar las recepciones"); }
  finally { if (current === version) loading.value = false; }
}
watch(activeCompanyId, () => { ++version; rows.value = []; selected.value = null; editing.value = false; action.value = null; ageTab.value = 'recent'; search.value = ''; status.value = ''; historyFrom.value = ''; historyTo.value = ''; pendingOnly.value = false; success.value = ''; void load(); }, { immediate: true });
watch(() => route.query.id, () => { selected.value = null; editing.value = false; action.value = null; void load(meta.value.page); });
async function filterReceipts(page = 1) {
  if (busy.value || editing.value) return;
  selected.value = null; action.value = null; success.value = '';
  meta.value.page = page;
  if (route.query.id) {
    const query = { ...route.query }; delete query.id;
    await router.replace({ query });
  } else await load(page);
}
function selectReceipt(row: Receipt) {
  if (busy.value || editing.value) return;
  success.value = '';
  selected.value = row; editing.value = false; action.value = null;
  void router.replace({ query: { ...route.query, id: String(row.id) } });
}
function changeTab(tab: 'recent' | 'older') {
  if (busy.value || editing.value || loading.value) return;
  ageTab.value = tab;
  void filterReceipts();
}
function clearFilters() {
  search.value = ''; status.value = ''; pendingOnly.value = false; historyFrom.value = ''; historyTo.value = '';
  void filterReceipts();
}
function edit() {
  if (!selected.value) return;
  detailView.value = 'documents';
  Object.assign(form, { supplierInvoiceNumber: selected.value.supplierInvoiceNumber ?? "", supplierInvoiceDate: selected.value.supplierInvoiceDate?.slice(0, 10) ?? "", notes: selected.value.notes ?? "" });
  editing.value = true;
  originalInvoice = JSON.stringify(form);
}
async function mutate(reason?: string) {
  if (!selected.value || busy.value) return;
  const company = activeCompanyId.value;
  const id = selected.value.id;
  const operation = editing.value ? 'edit' : action.value;
  busy.value = true;
  error.value = "";
  try {
    const config = { headers: { "X-Company-Id": String(company) } };
    if (editing.value) await http.patch(`/purchases/${id}`, { ...form, supplierInvoiceDate: form.supplierInvoiceDate || null }, config);
    else await http.post(`/purchases/${id}/${action.value}`, { reason }, config);
    if (company !== activeCompanyId.value) return;
    editing.value = false;
    action.value = null;
    await load(meta.value.page);
    success.value = operation === 'edit' ? 'Datos de factura actualizados.' : operation === 'verify' ? 'Recepción verificada.' : operation === 'close' ? 'Recepción cerrada.' : 'Recepción cancelada e inventario revertido.';
  } catch (caught) { if (company === activeCompanyId.value) error.value = getApiErrorMessage(caught, "No se pudo completar la operacion"); }
  finally { busy.value = false; }
}
</script>

<template>
  <AdminLayout title="Recepciones de mercadería">
    <div class="mx-auto max-w-[1440px] space-y-6">
    <PurchasesNav />
    <PurchaseSectionHeader title="Recepciones" description="Revisa los productos recibidos y continúa con su ubicación y costo final.">
      <template #actions>
      <AppButton variant="outline" :disabled="loading || busy || editing" @click="load(meta.page)"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" />Actualizar</AppButton>
      </template>
    </PurchaseSectionHeader>
    <p v-if="error" role="alert" class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="success" role="status" class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{{ success }}</p>
    <div class="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
        <form class="space-y-3 border-b border-border p-4" @submit.prevent="filterReceipts()">
          <div class="flex items-center justify-between text-sm"><strong>Recepciones</strong><span class="text-xs text-muted-fg">{{ meta.total }} registros</span></div>
          <PurchaseTabs :model-value="ageTab" :items="[{ value: 'recent', label: 'Esta semana' }, { value: 'older', label: 'Anteriores' }]" label="Período de recepciones" :disabled="loading || busy || editing" @update:model-value="changeTab($event as 'recent' | 'older')" />
          <div class="flex gap-2"><input v-model="search" aria-label="Buscar recepción" placeholder="Código, orden o proveedor" type="search" maxlength="100" :disabled="editing || busy" class="field-control min-w-0 flex-1" /><AppButton type="submit" variant="outline" :disabled="loading || busy || editing" title="Buscar" aria-label="Buscar"><Search class="h-4 w-4" /></AppButton></div>
          <details><summary class="cursor-pointer text-xs text-muted-fg">Filtros{{ filterCount ? ' (' + filterCount + ')' : '' }}</summary>
            <div class="mt-3 space-y-3">
              <label class="flex items-center gap-2 text-sm"><input v-model="pendingOnly" :disabled="editing || busy" type="checkbox" />Solo pendientes</label>
              <label class="block text-sm">Estado<select v-model="status" :disabled="editing || busy" class="field-control"><option value="">Todos los estados</option><option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option></select></label>
              <div v-if="ageTab === 'older'" class="grid grid-cols-2 gap-2"><AppInput v-model="historyFrom" label="Desde" type="date" :disabled="editing || busy" :max="historyTo || undefined" /><AppInput v-model="historyTo" label="Hasta" type="date" :disabled="editing || busy" :min="historyFrom || undefined" /></div>
              <div class="flex gap-2"><AppButton size="sm" type="submit" :disabled="loading || busy || editing">Aplicar</AppButton><button type="button" class="text-xs text-accent" :disabled="loading || busy || editing" @click="clearFilters">Limpiar</button></div>
            </div>
          </details>
        </form>
        <p v-if="loading" role="status" class="px-4 py-8 text-sm text-muted-fg">Cargando recepciones…</p>
        <div v-else class="scrollbar-thin max-h-[260px] overflow-y-auto p-2 lg:max-h-[580px]">
          <button v-for="row in rows" :key="row.id" type="button" :disabled="busy || editing" :aria-pressed="selected?.id === row.id" class="mb-1 w-full rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" :class="selected?.id === row.id ? 'bg-accent-soft' : 'hover:bg-surface-secondary'" @click="selectReceipt(row)">
            <span class="flex justify-between gap-2"><strong class="text-fg">{{ row.documentNumber }}</strong><span class="text-xs text-muted-fg">{{ labels[row.status] }}</span></span>
            <span class="mt-1 block truncate text-xs text-muted-fg">{{ row.supplier.name }}</span>
            <span class="mt-2 flex justify-between gap-2 text-xs"><span class="text-muted-fg">{{ row.purchaseOrder?.code || 'Compra histórica' }}</span><strong>{{ money(row.total, row.currency) }}</strong></span>
          </button>
          <p v-if="!rows.length" class="px-3 py-10 text-center text-sm text-muted-fg">{{ search || filterCount ? 'No hay recepciones para estos filtros.' : ageTab === 'recent' ? 'Sin recepciones esta semana.' : 'Sin recepciones registradas.' }}</p>
        </div>
        <div v-if="meta.totalPages > 1" class="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-fg"><button class="icon-button" aria-label="Página anterior" :disabled="loading || busy || editing || meta.page <= 1" @click="filterReceipts(meta.page - 1)"><ChevronLeft class="h-4 w-4" /></button><span>{{ meta.page }} / {{ meta.totalPages }}</span><button class="icon-button" aria-label="Página siguiente" :disabled="loading || busy || editing || meta.page >= meta.totalPages" @click="filterReceipts(meta.page + 1)"><ChevronRight class="h-4 w-4" /></button></div>
      </aside>
      <section aria-label="Detalle de recepción" v-if="selected && !loading" class="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
        <header class="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
          <div><div class="flex flex-wrap items-center gap-3"><h2 class="text-xl font-semibold">{{ selected.documentNumber }}</h2><span class="rounded-full bg-surface-secondary px-2.5 py-1 text-xs text-muted-fg">{{ labels[selected.status] }}</span></div><p class="mt-1 text-sm text-muted-fg">{{ selected.supplier.name }}</p><p class="mt-2 text-sm font-medium" :class="nextStep?.step === 'complete' ? 'text-success' : 'text-accent'">{{ nextStep?.label }}</p></div>
          <fieldset :disabled="busy || editing" class="flex flex-wrap items-center gap-2">
            <RouterLink v-if="nextStep?.step === 'placement' && can('inventory.view') && !editing" :to="placementPath" class="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Viñetear y ubicar</RouterLink>
            <AppButton v-else-if="nextStep?.step === 'verify' && can('purchases.update')" @click="action = 'verify'; error = ''">Verificar recepción</AppButton>
            <RouterLink v-else-if="nextStep?.step === 'cost' && can('retaceos.view') && !editing" :to="'/purchases/retaceos?purchaseId=' + selected.id" class="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">{{ activeRetaceo ? 'Continuar retaceo' : 'Preparar retaceo' }}</RouterLink>
            <AppButton v-else-if="nextStep?.step === 'close' && can('purchases.close')" @click="action = 'close'; error = ''">Cerrar recepción</AppButton>
            <RouterLink v-else-if="nextStep?.step === 'complete' && can('inventory.view') && can('purchase_requests.view')" :to="distributionPath" class="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Distribuir a sucursales</RouterLink>
            <RouterLink v-else-if="nextStep?.step === 'restore' && can('trash.view')" to="/administration/trash" class="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Recuperar retaceo</RouterLink>
            <details :key="'actions-' + selected.id" class="relative"><summary class="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-muted-fg">Más acciones</summary>
              <div class="absolute right-0 z-30 mt-2 flex min-w-52 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-subtle">
                <AppButton v-if="selected.status === 'RECEIVED' && !selected.hasActiveRetaceo && can('purchases.update')" variant="outline" @click="edit"><Pencil class="h-4 w-4" />Datos de factura</AppButton>
                <RouterLink v-if="['RECEIVED','VERIFIED'].includes(selected.status) && !selected.hasActiveRetaceo && can('purchase_expenses.create') && can('inventory.view')" :to="{ path: '/inventory/warehouse', query: { purchaseId: selected.id, tab: 'expenses' } }" class="rounded-lg border border-border px-3 py-2 text-center text-sm">Registrar gastos reales</RouterLink>
                <AppButton v-if="nextStep?.step === 'verify' && can('purchases.update')" @click="action = 'verify'; error = ''"><Check class="h-4 w-4" />Verificar recepción</AppButton>
                <AppButton v-if="nextStep?.step === 'close' && can('purchases.close')" @click="action = 'close'; error = ''"><LockKeyhole class="h-4 w-4" />Cerrar recepción</AppButton>
                <AppButton v-if="['RECEIVED','VERIFIED'].includes(selected.status) && !selected.hasActiveRetaceo && can('purchases.cancel')" variant="outline" @click="action = 'cancel'; error = ''"><X class="h-4 w-4" />Cancelar recepción</AppButton>
                <TrashButton entity="purchases" :record-id="selected.id" :label="selected.documentNumber" :disabled="busy || editing" @deleted="load" />
              </div>
            </details>
          </fieldset>
        </header>
        <div class="border-b border-border px-5 py-3"><PurchaseTabs v-model="detailView" :items="[{ value: 'products', label: 'Productos' }, { value: 'costs', label: 'Importes' }, { value: 'documents', label: 'Datos y documentos' }]" label="Detalle de recepción" :disabled="busy || editing" /></div>
        <div class="p-5 sm:p-6">
          <p v-if="nextStep?.step === 'verify' && !editing" class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface-secondary px-4 py-3 text-sm"><span><span class="text-muted-fg">Factura: </span>{{ selected.supplierInvoiceNumber || 'Sin factura' }}</span><span><span class="text-muted-fg">Fecha: </span>{{ selected.supplierInvoiceDate ? new Date(selected.supplierInvoiceDate.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-SV') : 'Sin fecha' }}</span><button v-if="can('purchases.update')" type="button" class="font-medium text-accent" :disabled="busy" @click="edit">Editar factura</button></p>
          <p v-if="nextStep?.step === 'restore'" class="mb-5 text-sm text-muted-fg">Recupera el retaceo para continuar con los costos de esta recepción.</p>
          <form v-if="editing" class="mb-6 max-w-2xl space-y-4" @submit.prevent="mutate()"><fieldset :disabled="busy" class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.supplierInvoiceNumber" label="Factura del proveedor" maxlength="100" /><AppInput v-model="form.supplierInvoiceDate" label="Fecha de factura" type="date" /><label class="text-sm sm:col-span-2">Observaciones<textarea v-model="form.notes" class="field-control min-h-24" maxlength="2000" /></label><div class="flex gap-2"><AppButton type="submit">Guardar</AppButton><AppButton type="button" variant="outline" @click="cancelEdit">Volver</AppButton></div></fieldset></form>
          <section v-if="detailView === 'products'">
          <div class="mb-4 flex items-center justify-between gap-3"><h3 class="font-semibold">Productos recibidos</h3><span class="text-xs text-muted-fg">{{ selected.items.length }} líneas</span></div>
          <div class="overflow-x-auto rounded-lg border border-border"><table class="w-full min-w-[460px] text-left text-sm">
            <thead class="border-b border-border bg-surface-secondary text-xs text-muted-fg"><tr><th class="px-4 py-3">Producto</th><th class="px-4 py-3 text-right">Recibido</th><th class="px-4 py-3">Ubicación confirmada</th></tr></thead>
            <tbody class="divide-y divide-border"><tr v-for="line in selected.items" :key="line.id"><td class="px-4 py-3"><p class="font-medium">{{ line.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ line.product.sku }} · {{ line.unit.name }}</p></td><td class="px-4 py-3 text-right font-medium">{{ Number(line.quantity) }}</td><td class="px-4 py-3"><template v-if="line.location"><strong class="block">{{ line.location.code }}</strong><span class="mt-1 block text-xs text-muted-fg">{{ line.location.aisle }} / {{ line.location.rack }} / {{ line.location.level }} / {{ line.location.position }}</span></template><RouterLink v-else-if="selected.status !== 'CANCELLED' && can('inventory.view')" :to="placementPath" class="text-accent">Ubicar producto</RouterLink><span v-else class="text-muted-fg">Sin ubicación confirmada</span></td></tr></tbody>
          </table></div>
          <details :key="'quantities-' + selected.id" class="mt-5 border-t border-border pt-4"><summary class="cursor-pointer text-sm text-muted-fg">Cantidades de la orden</summary><div class="mt-4 overflow-x-auto"><table class="w-full min-w-[600px] text-left text-sm"><thead class="border-b border-border text-xs text-muted-fg"><tr><th class="p-3">Producto</th><th class="p-3 text-right">Comprado</th><th class="p-3 text-right">Recibido antes</th><th class="p-3 text-right">Esta recepción</th><th class="p-3 text-right">Pendiente de recibir</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="line in selected.items" :key="line.id"><td class="p-3">{{ line.product.name }}<span class="block text-xs text-muted-fg">{{ line.unit.name }}</span></td><td class="p-3 text-right">{{ Number(line.quantityOrdered) }}</td><td class="p-3 text-right">{{ line.receivedBefore !== null ? Number(line.receivedBefore) : 'Sin registro' }}</td><td class="p-3 text-right">{{ Number(line.quantity) }}</td><td class="p-3 text-right">{{ line.purchaseOrderDetail ? Math.max(0, Number(line.purchaseOrderDetail.quantity) - Number(line.purchaseOrderDetail.receivedQuantity)).toFixed(2) : '—' }}</td></tr></tbody></table></div></details>
          </section>
          <section v-if="detailView === 'documents'" class="space-y-6">
          <section v-if="!editing" :key="'invoice-' + selected.id"><h3 class="font-semibold">Factura y datos de recepción</h3><dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt class="text-xs text-muted-fg">Factura</dt><dd class="mt-1 font-medium">{{ selected.supplierInvoiceNumber || 'Sin factura' }}</dd></div><div><dt class="text-xs text-muted-fg">Fecha de factura</dt><dd class="mt-1 font-medium">{{ selected.supplierInvoiceDate ? new Date(selected.supplierInvoiceDate.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-SV') : 'Sin fecha' }}</dd></div><div><dt class="text-xs text-muted-fg">Almacén</dt><dd class="mt-1 font-medium">{{ selected.warehouse?.name || selected.branch.name }}</dd></div><div><dt class="text-xs text-muted-fg">Fecha de recepción</dt><dd class="mt-1 font-medium">{{ new Date(selected.purchaseDate).toLocaleDateString('es-SV', { timeZone: 'America/El_Salvador' }) }}</dd></div></dl><p v-if="selected.notes" class="mt-4 whitespace-pre-wrap text-sm text-muted-fg">{{ selected.notes }}</p></section>
          <section :key="'origin-' + selected.id" class="border-t border-border pt-5"><h3 class="font-semibold">Documentos relacionados</h3><nav class="mt-4 flex flex-wrap gap-4 text-sm text-accent" aria-label="Trazabilidad de compra"><RouterLink v-if="selected.purchaseOrder && can('purchase_orders.view')" :to="'/purchases/orders?id=' + selected.purchaseOrder.id">{{ selected.purchaseOrder.code }}</RouterLink><RouterLink v-if="selected.purchaseOrder?.quotation && can('purchase_quotations.view')" :to="'/purchases/quotations?id=' + selected.purchaseOrder.quotation.id">{{ selected.purchaseOrder.quotation.code }}</RouterLink><template v-if="can('purchase_requests.view')"><RouterLink v-for="request in originRequests" :key="request.id" :to="'/purchases/requests?id=' + request.id">{{ request.code }}</RouterLink></template><RouterLink v-if="can('retaceos.view') && selected.status !== 'CANCELLED' && !selected.retaceoArchived && (selected.hasActiveRetaceo || ['VERIFIED','COSTED'].includes(selected.status))" :to="'/purchases/retaceos?purchaseId=' + selected.id">{{ selected.hasActiveRetaceo ? (retaceoPending ? 'Continuar retaceo' : 'Ver retaceo') : 'Preparar retaceo' }}</RouterLink></nav></section>
          </section>
          <section v-if="detailView === 'costs'">
          <section :key="'amounts-' + selected.id"><h3 class="font-semibold">Importes de la recepción</h3><div class="mt-4 overflow-x-auto"><table class="w-full min-w-[560px] text-left text-sm"><thead class="border-b border-border text-xs text-muted-fg"><tr><th class="p-3">Producto</th><th class="p-3 text-right">Precio unitario</th><th class="p-3 text-right">Descuento</th><th class="p-3 text-right">Impuesto</th><th class="p-3 text-right">Total</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="line in selected.items" :key="line.id"><td class="p-3">{{ line.product.name }}</td><td class="p-3 text-right">{{ Number(line.unitPrice).toFixed(4) }} {{ selected.currency }}</td><td class="p-3 text-right">{{ money(line.discount, selected.currency) }}</td><td class="p-3 text-right">{{ money(line.taxAmount, selected.currency) }}</td><td class="p-3 text-right font-medium">{{ money(line.total, selected.currency) }}</td></tr></tbody></table></div></section>
          <div class="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm"><span class="text-muted-fg">Total de la recepción</span><strong class="text-lg">{{ money(selected.total, selected.currency) }}</strong></div>
          </section>
        </div>
      </section>
      <section aria-label="Detalle de recepción" v-else class="flex min-h-[420px] min-w-0 items-center justify-center rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-fg">{{ loading ? 'Cargando…' : rows.length ? 'Selecciona una recepción.' : 'Las recepciones se registran desde una orden de compra.' }}</section>
    </div>
    </div>
    <PurchaseActionDialog v-if="action && selected" :title="action === 'cancel' ? 'Cancelar recepción' : action === 'verify' ? 'Verificar recepción' : 'Cerrar recepción'" :description="actionDescription" :require-reason="action === 'cancel'" :busy="busy" :error="error" @close="action = null" @confirm="mutate" />
    <PurchaseActionDialog v-if="discardInvoice" title="Descartar cambios de factura" description="Los cambios de factura no se han guardado." @confirm="editing = false; discardInvoice = false" @close="discardInvoice = false" />
    <PurchaseActionDialog v-if="leaving" title="Salir sin guardar" description="Los cambios de factura no se han guardado." @confirm="resolveLeave(true)" @close="resolveLeave(false)" />
  </AdminLayout>
</template>
