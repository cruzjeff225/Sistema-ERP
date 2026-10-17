<script setup lang="ts">
// Registers the goods that arrived for an order. It lives in Receipts because receiving is Warehouse's job;
// Orders stays with Purchasing and Management. Where each product physically goes is NOT decided here:
// the receipt is saved without a space and its lines wait in Warehouse → "Ubicar productos".
import { computed, onMounted, reactive, ref } from 'vue';
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
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const review = ref<{ payload: object; description: string } | null>(null);
const form = reactive({ requestId: '', supplierInvoiceNumber: '', supplierInvoiceDate: '', notes: '', items: [] as { orderDetailId: number; quantity: any }[] });

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const headers = () => ({ headers: { 'X-Company-Id': String(activeCompanyId.value) } });

const rows = computed(() => form.items.map(item => {
  const line = order.value?.details.find((detail: any) => detail.id === item.orderDetailId);
  const pending = line ? roundMoney(Number(line.quantity) - Number(line.receivedQuantity)) : 0;
  return { item, line, pending, remaining: Math.max(0, roundMoney(pending - Number(item.quantity || 0))) };
}));
const canReview = computed(() => !saving.value && !review.value && form.items.some(item => Number(item.quantity) > 0));

async function load() {
  const companyId = activeCompanyId.value;
  if (!companyId) return;
  loading.value = true; error.value = '';
  try {
    const orderResponse = await http.get(`/purchase-orders/${props.orderId}`, headers());
    if (companyId !== activeCompanyId.value) return;
    const fresh = orderResponse.data.data;
    if (!['sent', 'partially_received'].includes(fresh.status)) { error.value = 'La orden debe estar enviada al proveedor para registrar la recepción. Actualice el listado.'; return; }
    order.value = fresh;
    Object.assign(form, { requestId: crypto.randomUUID(), supplierInvoiceNumber: '', supplierInvoiceDate: today(), notes: '',
      items: fresh.details.filter((line: any) => Number(line.quantity) > Number(line.receivedQuantity)).map((line: any) => ({ orderDetailId: line.id, quantity: 0 })) });
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudieron consultar las cantidades pendientes'); }
  finally { loading.value = false; }
}

// Only fills the quantities; nothing is saved until the receipt is reviewed and confirmed.
function fillPending() {
  for (const row of rows.value) row.item.quantity = row.pending;
  notice.value = 'Se llenó «Recibido ahora» con la cantidad pendiente de cada producto. Revise y registre la recepción.';
}

function reviewReceipt() {
  notice.value = '';
  const items = form.items.filter(item => Number(item.quantity) > 0).map(item => ({ orderDetailId: item.orderDetailId, quantity: Number(item.quantity) }));
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
    <aside role="dialog" aria-modal="true" aria-labelledby="receive-title" class="h-full w-full max-w-3xl overflow-y-auto bg-surface shadow-[var(--shadow-float)]" @keydown.esc="!saving && emit('close')">
      <header class="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
        <div class="min-w-0 flex-1 basis-72">
          <p class="text-sm text-muted-fg">Proceso de compras</p>
          <h2 id="receive-title" class="mt-0.5 text-2xl font-semibold tracking-tight text-fg">Registrar recepción</h2>
          <p v-if="order" class="mt-1 text-sm text-muted-fg">{{ order.code }} · {{ order.supplier.name }} · {{ order.warehouse.name }}</p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <AppButton type="button" variant="outline" :disabled="saving" @click="emit('close')">{{ order ? 'Cancelar' : 'Cerrar' }}</AppButton>
          <AppButton v-if="order" type="submit" form="receive-form" :disabled="!canReview">Revisar recepción</AppButton>
        </div>
      </header>
      <div class="p-4 sm:p-6">
      <p v-if="error" role="alert" class="mb-4 rounded-[12px] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{{ error }}</p>
      <p v-if="loading" role="status" class="mt-2 text-sm text-muted-fg">Consultando las cantidades pendientes…</p>
      <form v-else-if="order" id="receive-form" class="space-y-6" @submit.prevent="reviewReceipt">
        <fieldset :disabled="saving || !!review" class="min-w-0 space-y-6">
          <div class="grid gap-4 sm:grid-cols-2"><AppInput v-model="form.supplierInvoiceNumber" label="Factura del proveedor" placeholder="Opcional" /><AppInput v-model="form.supplierInvoiceDate" type="date" label="Fecha de factura" /></div>
          <div>
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div><h3 class="text-base font-semibold text-fg">Mercadería recibida</h3><p class="mt-0.5 text-sm text-muted-fg">La ubicación física se confirma después en Bodega.</p></div>
              <div>
                <AppButton type="button" variant="outline" aria-describedby="fill-pending-help" @click="fillPending">Recibir todo lo pendiente</AppButton>
                <span id="fill-pending-help" class="sr-only">Llena «Recibido ahora» con la cantidad pendiente de cada producto. No registra la recepción.</span>
              </div>
            </div>
            <p class="sr-only" role="status" aria-live="polite">{{ notice }}</p>
            <div class="mt-3 max-h-[55vh] overflow-auto rounded-[12px] border border-border">
              <table class="w-full min-w-[620px] text-left text-sm">
                <caption class="sr-only">Productos de la orden con su cantidad ordenada, recibida antes, recibida ahora y pendiente</caption>
                <thead class="sticky top-0 z-[1] border-b border-border bg-surface-secondary text-sm text-muted-fg"><tr><th scope="col" class="px-3 py-2.5 font-medium">Producto</th><th scope="col" class="px-3 py-2.5 text-right font-medium">Ordenado</th><th scope="col" class="px-3 py-2.5 text-right font-medium">Recibido anteriormente</th><th scope="col" class="w-32 px-3 py-2.5 text-right font-medium">Recibido ahora</th><th scope="col" class="px-3 py-2.5 text-right font-medium">Pendiente</th></tr></thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="row in rows" :key="row.item.orderDetailId">
                    <th scope="row" class="min-w-60 px-3 py-3 text-left font-normal"><p class="font-medium text-fg">{{ row.line?.product.name }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ row.line?.unit.name }}</p></th>
                    <td class="px-3 py-3 text-right tabular-nums">{{ Number(row.line?.quantity) }}</td>
                    <td class="px-3 py-3 text-right tabular-nums">{{ Number(row.line?.receivedQuantity) }}</td>
                    <td class="px-3 py-3"><input v-model="row.item.quantity" type="number" min="0" :max="row.pending" step="1" :aria-label="'Recibido ahora de ' + row.line?.product.name" required class="field-control !mt-0 !h-9 !w-24 ml-auto tabular-nums" /></td>
                    <td class="px-3 py-3 text-right font-medium tabular-nums">{{ row.remaining }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <label class="block text-base font-semibold text-fg">Observaciones de recepción<textarea v-model="form.notes" class="field-control mt-2 h-auto min-h-24 py-2 font-normal" maxlength="2000" /></label>
        </fieldset>
      </form>
      </div>
    </aside>
    <ConfirmDialog v-if="review" title="Confirmar recepción" :description="review.description" :busy="saving" :error="error" @confirm="confirm" @close="review = null" />
  </div>
</template>
