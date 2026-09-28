<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Check, RefreshCw } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppButton from "../components/base/AppButton.vue";
import PurchaseActionDialog from "../components/base/PurchaseActionDialog.vue";
import { http } from "../services/http.service";
import { activeCompanyId } from "../services/company-context";
import { usePermissions } from "../composables/usePermissions";
import { getApiErrorMessage } from "../utils/api-error";
import { comparisonRequestId } from "../utils/purchase-workflow";
type Request = { id: number; code: string; details: { productId: number; quantity: string; product: { name: string } }[] };
type Quote = { id: number; code: string; status: string; currency: string; total: string; additionalExpenses: string; deliveryDays: number; paymentTerms: string | null; validUntil: string; isExpired: boolean; supplier: { name: string }; requestLinks: { request: { code: string } }[]; details: { productId: number; quantity: string; unitPrice: string; availableQuantity: string; discount: string; taxAmount: string }[] };
const { can } = usePermissions();
const route = useRoute();
const router = useRouter();
const requests = ref<Request[]>([]);
const requestId = ref(0);
const comparison = ref<{ request: Request; quotations: Quote[] } | null>(null);
const pending = ref<Quote | null>(null);
const error = ref("");
const loading = ref(false);
const busy = ref(false);
let version = 0;
onBeforeUnmount(() => { version++; });
const money = (value: string, currency: string) => new Intl.NumberFormat("es-SV", { style: "currency", currency }).format(Number(value));
async function load() {
  const current = ++version;
  const config = { headers: { "X-Company-Id": String(activeCompanyId.value) } };
  loading.value = true; error.value = "";
  comparison.value = null;
  pending.value = null;
  try {
    const list = await http.get("/purchase-requests/comparison-options", config);
    if (current !== version) return;
    requests.value = list.data.data;
    requestId.value = comparisonRequestId(requests.value, route.query.requestId, requestId.value);
    if (!requestId.value) {
      if (route.query.requestId !== undefined) error.value = 'La solicitud del enlace no está disponible para comparar. Seleccione una solicitud.';
      return;
    }
    const response = await http.get(`/purchase-requests/${requestId.value}/quotation-comparison`, config);
    if (current === version) comparison.value = response.data.data;
  } catch (caught) { if (current === version) error.value = getApiErrorMessage(caught, "No se pudo cargar la comparacion"); }
  finally { if (current === version) loading.value = false; }
}
watch(activeCompanyId, () => { requestId.value = 0; requests.value = []; comparison.value = null; pending.value = null; if (activeCompanyId.value) void load(); }, { immediate: true });
watch(() => route.query.requestId, () => { requestId.value = Number(route.query.requestId) || 0; comparison.value = null; pending.value = null; void load(); });
function changeRequest() {
  void router.replace({ query: { ...route.query, requestId: String(requestId.value) } });
}
async function select() {
  if (!pending.value || busy.value) return;
  const company = activeCompanyId.value;
  busy.value = true;
  try {
    await http.post(`/purchase-quotations/${pending.value.id}/select`, {}, { headers: { "X-Company-Id": String(company) } });
    if (company !== activeCompanyId.value) return;
    pending.value = null;
    await load();
  } catch (caught) { if (company === activeCompanyId.value) error.value = getApiErrorMessage(caught, "No se pudo seleccionar la oferta"); }
  finally { busy.value = false; }
}
</script>
<template>
  <AdminLayout title="Comparación de ofertas">
    <div class="flex flex-wrap items-center justify-between gap-3"><h1 class="page-title">Comparación de ofertas</h1><AppButton variant="outline" :disabled="loading || busy" @click="load"><RefreshCw class="h-4 w-4" />Actualizar</AppButton></div>
    <label class="my-6 block max-w-sm text-sm">Solicitud<select v-model.number="requestId" class="field-control" :disabled="loading || busy" @change="changeRequest"><option disabled :value="0">Seleccionar solicitud</option><option v-for="request in requests" :key="request.id" :value="request.id">{{ request.code }}</option></select></label>
    <p v-if="error" role="alert" class="my-4 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" role="status" class="py-6 text-muted-fg">Cargando ofertas...</p>
    <div v-else-if="comparison?.quotations.length" class="overflow-x-auto border-y border-border"><table class="w-full min-w-[700px] text-left text-sm"><thead class="bg-surface-secondary"><tr><th class="p-4">{{ comparison.request.code }}</th><th v-for="quote in comparison.quotations" :key="quote.id" class="min-w-56 p-4"><span class="block">{{ quote.supplier.name }}</span><RouterLink class="text-accent" :to="`/purchases/quotations?id=${quote.id}`">{{ quote.code }}</RouterLink></th></tr></thead><tbody class="divide-y divide-border">
      <tr v-for="line in comparison.request.details" :key="line.productId"><th class="p-4">{{ line.product.name }}<span class="block text-xs font-normal text-muted-fg">Solicitado: {{ line.quantity }}</span></th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4"><template v-if="quote.details.find(d => d.productId === line.productId)"><p>{{ money(quote.details.find(d => d.productId === line.productId)!.unitPrice, quote.currency) }}</p><p class="text-xs text-muted-fg">Cotizado: {{ quote.details.find(d => d.productId === line.productId)!.quantity }}</p><p class="text-xs text-muted-fg">Disponible: {{ quote.details.find(d => d.productId === line.productId)!.availableQuantity }}</p><p class="text-xs text-muted-fg">Descuento: {{ money(quote.details.find(d => d.productId === line.productId)!.discount, quote.currency) }}</p><p class="text-xs text-muted-fg">Impuesto: {{ money(quote.details.find(d => d.productId === line.productId)!.taxAmount, quote.currency) }}</p></template><span v-else class="text-muted-fg">No ofertado</span></td></tr>
      <tr><th class="p-4">Solicitudes incluidas</th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4">{{ quote.requestLinks.map(link => link.request.code).join(', ') }}</td></tr>
      <tr><th class="p-4">Entrega</th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4">{{ quote.deliveryDays }} días</td></tr>
      <tr><th class="p-4">Condiciones</th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4">{{ quote.paymentTerms || '-' }}</td></tr>
      <tr><th class="p-4">Vigencia</th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4" :class="quote.isExpired ? 'text-danger' : ''">{{ quote.validUntil.slice(0,10) }} {{ quote.isExpired ? '(Vencida)' : '' }}</td></tr>
      <tr><th class="p-4">Gastos</th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4">{{ money(quote.additionalExpenses, quote.currency) }}</td></tr>
      <tr><th class="p-4">Total de la oferta completa</th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4 font-semibold">{{ money(quote.total, quote.currency) }}</td></tr>
      <tr><th class="p-4">Decision</th><td v-for="quote in comparison.quotations" :key="quote.id" class="p-4"><div v-if="quote.status === 'selected'"><span class="block text-success">Seleccionada</span><RouterLink :to="`/purchases/quotations?id=${quote.id}`" class="mt-2 inline-block font-medium text-accent">Ver oferta y órdenes</RouterLink></div><AppButton v-else-if="['received','under_review'].includes(quote.status) && !quote.isExpired && can('purchase_quotations.select')" :disabled="busy" @click="pending = quote; error = ''"><Check class="h-4 w-4" />Seleccionar</AppButton><span v-else class="text-muted-fg">{{ quote.status === 'draft' ? 'Oferta en borrador' : 'No disponible' }}</span></td></tr>
    </tbody></table></div>
    <p v-else class="py-10 text-center text-muted-fg">No hay ofertas para comparar.</p>
    <PurchaseActionDialog v-if="pending" title="Seleccionar cotizacion" :description="`Confirmar ${pending.code} de ${pending.supplier.name} como base para generar una orden de compra.`" :busy="busy" :error="error" @close="pending = null" @confirm="select" />
  </AdminLayout>
</template>
