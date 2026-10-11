<script setup lang="ts">
// Registers the goods that arrived for an order. It lives in Receipts because receiving is Warehouse's job;
// Orders stays with Purchasing and Management.
import { computed, onMounted, reactive, ref } from 'vue';
import { Check } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import AppInput from '../base/AppInput.vue';
import ConfirmDialog from '../base/ConfirmDialog.vue';
import { http } from '../../services/http.service';
import { activeCompanyId } from '../../services/company-context';
import { useFeedbackStore } from '../../stores/feedback.store';
import { getApiErrorMessage } from '../../utils/api-error';
import { receiptProgress } from '../../utils/purchase-workflow';

const props = defineProps<{ orderId: number }>();
const emit = defineEmits<{ close: []; received: [] }>();
const feedback = useFeedbackStore();

const order = ref<any>(null);
const locations = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const review = ref<{ payload: object; description: string } | null>(null);
const form = reactive({ requestId: '', supplierInvoiceNumber: '', supplierInvoiceDate: '', notes: '', items: [] as { orderDetailId: number; locationId: number; quantity: any }[] });

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const headers = () => ({ headers: { 'X-Company-Id': String(activeCompanyId.value) } });

const rows = computed(() => form.items.map(item => {
  const line = order.value?.details.find((detail: any) => detail.id === item.orderDetailId);
  const pending = line ? roundMoney(Number(line.quantity) - Number(line.receivedQuantity)) : 0;
  return { item, line, pending, remaining: Math.max(0, roundMoney(pending - Number(item.quantity || 0))) };
}));

async function load() {
  const companyId = activeCompanyId.value;
  if (!companyId) return;
  loading.value = true; error.value = '';
  try {
    const [orderResponse, catalogs] = await Promise.all([http.get(`/purchase-orders/${props.orderId}`, headers()), http.get('/purchase-catalogs', headers())]);
    if (companyId !== activeCompanyId.value) return;
    const fresh = orderResponse.data.data;
    if (!['sent', 'partially_received'].includes(fresh.status)) { error.value = 'La orden debe estar enviada al proveedor para registrar la recepción. Actualice el listado.'; return; }
    order.value = fresh;
    locations.value = catalogs.data.data.branches.flatMap((branch: any) => branch.warehouses).find((warehouse: any) => warehouse.id === fresh.warehouseId)?.locations ?? [];
    Object.assign(form, { requestId: crypto.randomUUID(), supplierInvoiceNumber: '', supplierInvoiceDate: today(), notes: '',
      items: fresh.details.filter((line: any) => Number(line.quantity) > Number(line.receivedQuantity)).map((line: any) => ({ orderDetailId: line.id, locationId: 0, quantity: 0 })) });
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudieron consultar las cantidades pendientes'); }
  finally { loading.value = false; }
}

function fillPending() { for (const row of rows.value) row.item.quantity = row.pending; }

function reviewReceipt() {
  const items = form.items.filter(item => Number(item.quantity) > 0).map(item => ({ ...item, locationId: item.locationId || undefined, quantity: Number(item.quantity) }));
  if (!items.length) { error.value = 'Indique una cantidad recibida mayor que cero'; return; }
  for (const item of items) {
    const line = order.value.details.find((detail: any) => detail.id === item.orderDetailId);
    if (!Number.isSafeInteger(item.quantity)) { error.value = 'La cantidad recibida debe ser un número entero.'; return; }
    if (!line || item.quantity > roundMoney(Number(line.quantity) - Number(line.receivedQuantity))) { error.value = 'La cantidad recibida supera lo pendiente en la orden'; return; }
  }
  const description = items.map(item => { const line = order.value.details.find((detail: any) => detail.id === item.orderDetailId); return `${line.product.name}: ${item.quantity} ${line.unit.name}`; }).join('; ');
  const progress = receiptProgress(order.value.details, items);
  const outcome = progress.complete ? 'La orden quedará recibida completamente.' : `Recepción parcial: quedarán ${progress.pendingLines} productos con cantidades pendientes.`;
  error.value = '';
  review.value = {
    payload: { requestId: form.requestId, supplierInvoiceNumber: form.supplierInvoiceNumber.trim() || undefined, supplierInvoiceDate: form.supplierInvoiceDate || undefined, notes: form.notes.trim() || undefined, items },
    description: `${order.value.code}. ${description}. ${outcome} Estas cantidades quedarán recibidas y pendientes de viñeteo y confirmación física de ubicación.`,
  };
}

async function confirm() {
  if (!review.value || saving.value) return;
  saving.value = true; error.value = '';
  try {
    await http.post(`/purchase-orders/${props.orderId}/receive`, review.value.payload, headers());
    feedback.success('Recepción registrada; confirme el viñeteo y la ubicación en bodega');
    review.value = null;
    emit('received');
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo registrar la recepción'); }
  finally { saving.value = false; }
}

onMounted(() => void load());
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end bg-black/35" @click.self="!saving && emit('close')">
    <aside role="dialog" aria-modal="true" aria-label="Registrar recepción" class="h-full w-full max-w-3xl overflow-y-auto bg-surface p-4 shadow-[var(--shadow-float)] sm:p-6" @keydown.esc="!saving && emit('close')">
      <div><p class="section-eyebrow">Proceso de compras</p><h2 class="mt-1 text-xl font-semibold text-fg">Registrar recepción</h2></div>
      <p v-if="error" role="alert" class="sticky top-0 z-10 mt-4 rounded-lg border border-danger/30 bg-surface p-3 text-sm text-danger">{{ error }}</p>
      <p v-if="loading" role="status" class="mt-6 text-sm text-muted-fg">Consultando las cantidades pendientes…</p>
      <form v-else-if="order" class="mt-6 space-y-6" @submit.prevent="reviewReceipt">
        <fieldset :disabled="saving || !!review" class="min-w-0 space-y-6">
          <div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.supplierInvoiceNumber" label="Factura del proveedor" placeholder="Opcional" /><AppInput v-model="form.supplierInvoiceDate" type="date" label="Fecha de factura" /></div>
          <div>
            <p class="mb-4 text-sm text-muted-fg">{{ order.code }} · {{ order.supplier.name }} · {{ order.warehouse.name }}</p>
            <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold text-fg">Mercadería recibida</h3><AppButton type="button" variant="outline" size="sm" @click="fillPending"><Check class="h-4 w-4" />Completar pendientes</AppButton></div>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full min-w-[650px] text-left text-sm">
                <thead class="border-y border-border bg-surface-secondary text-xs text-muted-fg"><tr><th class="p-3">Producto / Ubicación</th><th class="p-3 text-right">Ordenado</th><th class="p-3 text-right">Recibido anteriormente</th><th class="w-32 p-3">Recibido ahora</th><th class="p-3 text-right">Pendiente</th></tr></thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="row in rows" :key="row.item.orderDetailId">
                    <td class="min-w-52 p-3"><p class="font-medium">{{ row.line?.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ row.line?.unit.name }}</p>
                      <select v-model.number="row.item.locationId" :aria-label="'Ubicación de ' + row.line?.product.name" :disabled="Number(row.item.quantity) <= 0" class="field-control mt-2"><option :value="0">Sugerir espacio (pendiente de confirmación)</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.code }} · {{ location.aisle }} / {{ location.rack }} / {{ location.level }}</option></select>
                    </td>
                    <td class="p-3 text-right tabular-nums">{{ Number(row.line?.quantity) }}</td>
                    <td class="p-3 text-right tabular-nums">{{ Number(row.line?.receivedQuantity) }}</td>
                    <td class="p-3"><input v-model="row.item.quantity" type="number" min="0" :max="row.pending" step="1" :aria-label="'Recibido ahora de ' + row.line?.product.name" required class="field-control w-28" /></td>
                    <td class="p-3 text-right font-medium tabular-nums">{{ row.remaining }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="!locations.length" class="mt-4 text-sm text-muted-fg">La recepción quedará pendiente de ubicación hasta registrar un espacio.</p>
          </div>
          <label class="block text-sm font-medium text-fg">Observaciones de recepción<textarea v-model="form.notes" class="field-control h-auto py-2 min-h-20" maxlength="2000" /></label>
          <div class="flex justify-end gap-2"><AppButton variant="outline" type="button" @click="emit('close')">Cancelar</AppButton><AppButton type="submit" :disabled="saving || !form.items.some(item => Number(item.quantity) > 0)">Revisar recepción</AppButton></div>
        </fieldset>
      </form>
      <div v-else-if="!loading" class="mt-6 flex justify-end"><AppButton variant="outline" @click="emit('close')">Cerrar</AppButton></div>
    </aside>
    <ConfirmDialog v-if="review" title="Confirmar recepción" :description="review.description" :busy="saving" :error="error" @confirm="confirm" @close="review = null" />
  </div>
</template>
