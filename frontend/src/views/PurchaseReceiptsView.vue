<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Check, ChevronLeft, ChevronRight, LockKeyhole, Pencil, RefreshCw, Search, X } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import PurchaseActionDialog from "../components/base/PurchaseActionDialog.vue";
import { http } from "../services/http.service";
import { activeCompanyId } from "../services/company-context";
import { usePermissions } from "../composables/usePermissions";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { getApiErrorMessage } from "../utils/api-error";

type Receipt = {
  id: number; documentNumber: string; status: string; total: string; currency: string; purchaseDate: string;
  supplierInvoiceNumber: string | null; supplierInvoiceDate: string | null; notes: string | null;
  supplier: { name: string }; branch: { name: string }; warehouse: { name: string } | null;
  purchaseOrder: { id: number; code: string; quotation: { id: number; code: string; requestLinks: { request: { id: number; code: string; justification: string } }[] } | null } | null;
  items: { id: number; quantity: string; quantityOrdered: string; receivedBefore: string | null; unitPrice: string; discount: string; taxAmount: string; total: string; unit: { name: string }; lineTotal: string; product: { name: string; sku: string }; location: { code: string; aisle: string; rack: string; level: string; position: string }; purchaseOrderDetail: { quantity: string; receivedQuantity: string; unit: { name: string } } | null }[];
  retaceos: { id: number; code: string; status: string; totalCost: string }[];
};
const { can } = usePermissions();
const route = useRoute();
const router = useRouter();
const rows = ref<Receipt[]>([]);
const selected = ref<Receipt | null>(null);
const meta = ref({ page: 1, totalPages: 0, total: 0 });
const search = ref("");
const status = ref("");
const loading = ref(false);
const busy = ref(false);
const editing = ref(false);
const error = ref("");
const success = ref('');
const retaceoPending = computed(() => selected.value?.retaceos.some(item => !['cancelled', 'closed'].includes(item.status)) ?? false);
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
    const response = await http.get("/purchases", { ...config, params: { page, search: search.value || undefined, status: status.value || undefined } });
    if (current !== version) return;
    rows.value = response.data.data.items;
    meta.value = response.data.data.meta;
    const id = Number(route.query.id) || selected.value?.id;
    selected.value = rows.value.find((row) => row.id === id) ?? null;
    if (Number(route.query.id) && !selected.value) {
      const detail = await http.get(`/purchases/${Number(route.query.id)}`, config);
      if (current !== version) return;
      selected.value = detail.data.data;
    }
  } catch (caught) { if (current === version) error.value = getApiErrorMessage(caught, "No se pudieron cargar las recepciones"); }
  finally { if (current === version) loading.value = false; }
}
watch(activeCompanyId, () => { rows.value = []; selected.value = null; editing.value = false; action.value = null; void load(); }, { immediate: true });
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
function edit() {
  if (!selected.value) return;
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
    <div class="flex flex-wrap items-center justify-between gap-3"><h1 class="page-title">Recepciones de mercadería</h1><AppButton variant="outline" :disabled="loading || busy || editing" @click="load(meta.page)"><RefreshCw class="h-4 w-4" />Actualizar</AppButton></div>
    <form class="my-6 flex flex-wrap items-end gap-3" @submit.prevent="filterReceipts()">
      <AppInput v-model="search" label="Buscar recepción" placeholder="Orden, factura, proveedor o producto" :disabled="editing || busy" maxlength="100" type="search" />
      <label class="text-sm">Estado<select v-model="status" :disabled="editing || busy" class="field-control"><option value="">Todos</option><option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option></select></label>
      <AppButton type="submit" :disabled="loading || busy || editing"><Search class="h-4 w-4" />Buscar</AppButton>
    </form>
    <p v-if="error" role="alert" class="my-4 text-sm text-danger">{{ error }}</p>
    <p v-if="success" role="status" class="my-4 text-sm text-success">{{ success }}</p>
    <p v-if="loading" role="status" class="py-8 text-sm text-muted-fg">Cargando recepciones...</p>
    <div v-else class="overflow-x-auto border-y border-border">
      <table class="w-full min-w-[640px] text-left text-sm"><thead class="bg-surface-secondary text-muted-fg"><tr><th class="p-3">Recepción / Orden</th><th class="p-3">Proveedor</th><th class="p-3">Factura</th><th class="p-3">Estado</th><th class="p-3 text-right">Total</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="row in rows" :key="row.id" :class="selected?.id === row.id ? 'bg-accent-soft' : ''"><td class="p-3"><button class="font-semibold text-accent hover:underline" :disabled="busy || editing" @click="selectReceipt(row)">{{ row.documentNumber }}</button><span class="mt-1 block text-xs text-muted-fg">{{ row.purchaseOrder?.code }}</span></td><td class="p-3">{{ row.supplier.name }}</td><td class="p-3">{{ row.supplierInvoiceNumber || 'Sin factura' }}</td><td class="p-3">{{ labels[row.status] || row.status }}</td><td class="p-3 text-right">{{ money(row.total, row.currency) }}</td></tr><tr v-if="!rows.length"><td colspan="5" class="p-8 text-center text-muted-fg">No hay recepciones para estos filtros.</td></tr></tbody></table>
    </div>
    <div class="my-4 flex items-center justify-between text-sm text-muted-fg"><span>{{ meta.total }} recepciones</span><div class="flex items-center gap-3"><button class="icon-button" title="Pagina anterior" :disabled="loading || busy || editing || meta.page <= 1" @click="filterReceipts(meta.page - 1)"><ChevronLeft class="h-4 w-4" /></button><span>{{ meta.page }} / {{ Math.max(meta.totalPages, 1) }}</span><button class="icon-button" title="Pagina siguiente" :disabled="loading || busy || editing || meta.page >= meta.totalPages" @click="filterReceipts(meta.page + 1)"><ChevronRight class="h-4 w-4" /></button></div></div>
    <section v-if="selected && !loading" class="mt-8 border-t border-border pt-6">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="text-xl font-semibold">{{ selected.documentNumber }}</h2><p class="mt-1 text-sm text-muted-fg">{{ selected.branch.name }} · {{ selected.warehouse?.name }} · {{ labels[selected.status] }}</p></div><div class="flex flex-wrap gap-2">
        <AppButton v-if="selected.status === 'RECEIVED' && !selected.retaceos.some(r => r.status !== 'cancelled') && can('purchases.update')" variant="outline" :disabled="busy || editing" @click="edit"><Pencil class="h-4 w-4" />Datos de factura</AppButton>
        <AppButton v-if="selected.status === 'RECEIVED' && can('purchases.update')" :disabled="busy || editing" @click="action = 'verify'; error = ''"><Check class="h-4 w-4" />Verificar recepción</AppButton>
        <AppButton v-if="['VERIFIED','COSTED'].includes(selected.status) && can('purchases.close')" :disabled="busy || editing || retaceoPending" :title="retaceoPending ? 'Retaceo pendiente de cierre' : undefined" @click="action = 'close'; error = ''"><LockKeyhole class="h-4 w-4" />Cerrar recepción</AppButton>
        <AppButton v-if="['RECEIVED','VERIFIED'].includes(selected.status) && !selected.retaceos.some(r => r.status !== 'cancelled') && can('purchases.cancel')" variant="outline" :disabled="busy || editing" @click="action = 'cancel'; error = ''"><X class="h-4 w-4" />Cancelar recepción</AppButton>
      </div></div>
      <form v-if="editing" class="my-6 max-w-2xl space-y-4" @submit.prevent="mutate()"><fieldset :disabled="busy" class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.supplierInvoiceNumber" label="Factura del proveedor" maxlength="100" /><AppInput v-model="form.supplierInvoiceDate" label="Fecha de factura" type="date" /><label class="text-sm sm:col-span-2">Observaciones<textarea v-model="form.notes" class="field-control min-h-24" maxlength="2000" /></label><div class="flex gap-2"><AppButton type="submit">Guardar</AppButton><AppButton type="button" variant="outline" @click="cancelEdit">Volver</AppButton></div></fieldset></form>
      <dl class="my-5 grid gap-4 border-y border-border py-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div class="min-w-0"><dt class="text-xs text-muted-fg">Proveedor</dt><dd class="mt-1 break-words font-medium">{{ selected.supplier.name }}</dd></div>
        <div class="min-w-0"><dt class="text-xs text-muted-fg">Factura</dt><dd class="mt-1 break-words font-medium">{{ selected.supplierInvoiceNumber || 'Sin factura' }}</dd></div>
        <div><dt class="text-xs text-muted-fg">Fecha de factura</dt><dd class="mt-1 font-medium">{{ selected.supplierInvoiceDate ? new Date(selected.supplierInvoiceDate.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-SV') : 'Sin fecha' }}</dd></div>
        <div><dt class="text-xs text-muted-fg">Total recibido</dt><dd class="mt-1 font-semibold">{{ money(selected.total, selected.currency) }}</dd></div>
      </dl>
      <p v-if="retaceoPending && ['VERIFIED','COSTED'].includes(selected.status)" role="status" class="text-sm text-warning">Retaceo pendiente de cierre.</p>
      <nav class="my-5 flex flex-wrap gap-4 text-sm text-accent" aria-label="Trazabilidad de compra">
        <RouterLink v-if="selected.purchaseOrder && can('purchase_orders.view')" :to="`/purchases/orders?id=${selected.purchaseOrder.id}`">Orden {{ selected.purchaseOrder.code }}</RouterLink>
        <RouterLink v-if="selected.purchaseOrder?.quotation && can('purchase_quotations.view')" :to="`/purchases/quotations?id=${selected.purchaseOrder.quotation.id}`">Cotización {{ selected.purchaseOrder.quotation.code }}</RouterLink>
        <template v-if="can('purchase_requests.view')"><RouterLink v-for="link in selected.purchaseOrder?.quotation?.requestLinks" :key="link.request.id" :to="`/purchases/requests?id=${link.request.id}`">Solicitud {{ link.request.code }}</RouterLink></template>
        <RouterLink v-if="can('retaceos.view') && selected.status !== 'CANCELLED'" :to="`/purchases/retaceos?purchaseId=${selected.id}`">{{ retaceoPending ? 'Continuar retaceo' : 'Retaceo' }}</RouterLink>
      </nav>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[850px] text-left text-sm">
          <thead class="border-b border-border text-muted-fg"><tr><th class="p-3">Producto</th><th class="p-3">Ubicación</th><th class="p-3">Unidad</th><th class="p-3 text-right">Ordenado</th><th class="p-3 text-right">Recibido anteriormente</th><th class="p-3 text-right">Esta recepción</th><th class="p-3 text-right">Pendiente actual</th></tr></thead>
          <tbody class="divide-y divide-border"><tr v-for="line in selected.items" :key="line.id">
            <td class="p-3">{{ line.product.name }}<span class="block text-xs text-muted-fg">{{ line.product.sku }}</span></td>
            <td class="p-3"><strong class="block">{{ line.location.code }}</strong><span class="block text-xs text-muted-fg">Pasillo {{ line.location.aisle }} · Estante {{ line.location.rack }} · Nivel {{ line.location.level }} · Pos. {{ line.location.position }}</span></td>
            <td class="p-3">{{ line.unit.name }}</td><td class="p-3 text-right">{{ line.quantityOrdered }}</td>
            <td class="p-3 text-right"><span v-if="line.receivedBefore !== null">{{ line.receivedBefore }}</span><span v-else class="text-xs text-muted-fg">Sin registro histórico</span></td>
            <td class="p-3 text-right font-medium">{{ line.quantity }}</td>
            <td class="p-3 text-right">{{ line.purchaseOrderDetail ? Math.max(0, Number(line.purchaseOrderDetail.quantity) - Number(line.purchaseOrderDetail.receivedQuantity)).toFixed(2) : '-' }}</td>
          </tr></tbody>
        </table>
      </div>
      <details class="mt-6 border-y border-border py-4">
        <summary class="cursor-pointer text-sm font-medium">Importes de la recepción</summary>
        <div class="mt-3 overflow-x-auto"><table class="w-full min-w-[700px] text-left text-sm">
          <thead class="border-b border-border text-muted-fg"><tr><th class="p-3">Producto</th><th class="p-3 text-right">Precio unitario</th><th class="p-3 text-right">Descuento</th><th class="p-3 text-right">Subtotal neto</th><th class="p-3 text-right">Impuesto</th><th class="p-3 text-right">Total</th></tr></thead>
          <tbody class="divide-y divide-border"><tr v-for="line in selected.items" :key="line.id"><td class="p-3">{{ line.product.name }}</td><td class="p-3 text-right">{{ Number(line.unitPrice).toFixed(4) }} {{ selected.currency }}</td><td class="p-3 text-right">{{ money(line.discount, selected.currency) }}</td><td class="p-3 text-right">{{ money(line.lineTotal, selected.currency) }}</td><td class="p-3 text-right">{{ money(line.taxAmount, selected.currency) }}</td><td class="p-3 text-right font-medium">{{ money(line.total, selected.currency) }}</td></tr></tbody>
        </table></div>
      </details>
      <p v-if="selected.notes" class="mt-5 whitespace-pre-wrap text-sm text-muted-fg">{{ selected.notes }}</p>
    </section>
    <PurchaseActionDialog v-if="action && selected" :title="action === 'cancel' ? 'Cancelar recepción' : action === 'verify' ? 'Verificar recepción' : 'Cerrar recepción'" :description="actionDescription" :require-reason="action === 'cancel'" :busy="busy" :error="error" @close="action = null" @confirm="mutate" />
    <PurchaseActionDialog v-if="discardInvoice" title="Descartar cambios de factura" description="Los cambios de factura no se han guardado." @confirm="editing = false; discardInvoice = false" @close="discardInvoice = false" />
    <PurchaseActionDialog v-if="leaving" title="Salir sin guardar" description="Los cambios de factura no se han guardado." @confirm="resolveLeave(true)" @close="resolveLeave(false)" />
  </AdminLayout>
</template>
