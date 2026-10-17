<script setup lang="ts">
// The branch confirms what arrived from the warehouse inside its own request: quantities received and where they were placed.
import { computed, onMounted, ref, watch } from 'vue';
import { Check } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import ConfirmDialog from '../base/ConfirmDialog.vue';
import { http } from '../../services/http.service';
import { activeCompanyId } from '../../services/company-context';
import { useFeedbackStore } from '../../stores/feedback.store';
import { getApiErrorMessage } from '../../utils/api-error';
import { documentStatusLabel, documentStatusVariant, statusDotClass } from '../../utils/purchase-tracking';

const props = defineProps<{ requestId: number }>();
const emit = defineEmits<{ received: [] }>();
const feedback = useFeedbackStore();

type Line = { itemId: number; productName: string; unit: string; quantity: number; pending: number; locationId: number };
const transfers = ref<any[]>([]);
const warehouses = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const receiving = ref<any>(null);
const lines = ref<Line[]>([]);
const requestUuid = ref('');
const confirming = ref(false);
let version = 0;

const headers = () => ({ headers: { 'X-Company-Id': String(activeCompanyId.value) } });
const belongsHere = (transfer: any) => transfer.items.some((item: any) => item.requestDetail?.request?.id === props.requestId);
const mine = computed(() => transfers.value.filter(belongsHere));
const pendingOf = (item: any) => Math.max(0, Number(item.quantity) - Number(item.receivedQuantity));
const canReceive = (transfer: any) => ['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(transfer.status) && transfer.items.some((item: any) => pendingOf(item) > 0);
const locations = computed(() => warehouses.value.find((warehouse: any) => warehouse.id === receiving.value?.toWarehouseId)?.locations ?? []);
const itemsOf = (transfer: any) => transfer.items.filter((item: any) => item.requestDetail?.request?.id === props.requestId);

async function load() {
  const companyId = activeCompanyId.value, current = ++version;
  if (!companyId) return;
  loading.value = true; error.value = '';
  try {
    const [transferResponse, catalogs] = await Promise.all([http.get('/supply/transfers', headers()), http.get('/inventory/catalogs', headers())]);
    if (current !== version || companyId !== activeCompanyId.value) return;
    transfers.value = transferResponse.data.data; warehouses.value = catalogs.data.data.warehouses;
  } catch (caught) { if (current === version) error.value = getApiErrorMessage(caught, 'No se pudieron consultar los despachos'); }
  finally { if (current === version) loading.value = false; }
}

function start(transfer: any) {
  receiving.value = transfer; requestUuid.value = crypto.randomUUID(); error.value = '';
  lines.value = itemsOf(transfer).filter((item: any) => pendingOf(item) > 0).map((item: any) => ({ itemId: item.id, productName: item.product.name, unit: item.product.purchaseUnit?.name ?? '', quantity: 0, pending: pendingOf(item), locationId: item.toLocationId ?? 0 }));
}
const fillPending = () => { for (const line of lines.value) line.quantity = line.pending; };
function review() {
  const chosen = lines.value.filter(line => line.quantity > 0);
  if (!chosen.length) { error.value = 'Indique una cantidad recibida mayor que cero'; return; }
  if (chosen.some(line => !Number.isSafeInteger(line.quantity) || line.quantity > line.pending)) { error.value = 'La cantidad recibida debe ser un número entero y no superar lo pendiente'; return; }
  if (chosen.some(line => !line.locationId)) { error.value = 'Confirme el espacio donde quedó cada producto'; return; }
  error.value = ''; confirming.value = true;
}
async function confirm() {
  if (saving.value || !receiving.value) return;
  saving.value = true; error.value = '';
  try {
    await http.post(`/supply/transfers/${receiving.value.id}/receive`, { requestId: requestUuid.value, items: lines.value.filter(line => line.quantity > 0).map(({ itemId, quantity, locationId }) => ({ itemId, quantity, locationId })) }, headers());
    feedback.success('Recepción confirmada. Se actualizó lo entregado a la sucursal.');
    confirming.value = false; receiving.value = null; lines.value = [];
    await load(); emit('received');
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo confirmar la recepción'); confirming.value = false; }
  finally { saving.value = false; }
}

onMounted(() => void load());
watch([() => props.requestId, activeCompanyId], () => { receiving.value = null; void load(); });
</script>

<template>
  <section v-if="mine.length" aria-labelledby="receive-transfers-title" class="rounded-[12px] border border-border bg-surface p-5 sm:p-6">
    <h2 id="receive-transfers-title" class="text-xl font-semibold tracking-tight text-fg">Despachos del almacén</h2>
    <p v-if="error && !receiving" role="alert" class="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <div class="relative mt-4 overflow-x-auto rounded-[12px] border border-border">
      <table class="w-full min-w-[620px] text-left text-sm">
        <caption class="sr-only">Despachos del almacén para esta solicitud</caption>
        <thead class="border-b border-border bg-surface-secondary text-sm text-muted-fg"><tr><th scope="col" class="px-4 py-3 font-medium">Traslado</th><th scope="col" class="px-4 py-3 font-medium">Detalle</th><th scope="col" class="px-4 py-3 font-medium">Estado</th><th scope="col" class="px-4 py-3"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody class="divide-y divide-border">
          <template v-for="transfer in mine" :key="transfer.id">
            <tr>
              <th scope="row" class="whitespace-nowrap px-4 py-3.5 text-left align-top font-semibold text-fg">{{ transfer.documentNumber }}</th>
              <td class="px-4 py-3.5 align-top"><div v-for="item in itemsOf(transfer)" :key="item.id" class="mb-1 last:mb-0"><p class="font-medium text-fg">{{ item.product.name }}</p><p class="mt-0.5 text-muted-fg">Despachado {{ Number(item.quantity) }} · Recibido {{ Number(item.receivedQuantity) }}<span v-if="pendingOf(item) > 0"> · En tránsito {{ pendingOf(item) }}</span></p></div></td>
              <td class="px-4 py-3.5 align-top"><span class="inline-flex items-center gap-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="statusDotClass(documentStatusVariant(transfer.status))" aria-hidden="true" />{{ documentStatusLabel(transfer.status) }}</span></td>
              <td class="px-4 py-3 text-right align-top"><AppButton v-if="canReceive(transfer) && receiving?.id !== transfer.id" variant="outline" :disabled="loading || saving" @click="start(transfer)">Recibir en sucursal</AppButton></td>
            </tr>
            <tr v-if="receiving?.id === transfer.id">
              <td colspan="4" class="p-4">
                <form class="space-y-4" aria-labelledby="receive-form-title" @submit.prevent="review">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 id="receive-form-title" class="text-lg font-semibold tracking-tight text-fg">Recepción en sucursal</h3>
                    <div class="flex items-center gap-2"><AppButton type="button" variant="ghost" :disabled="saving" @click="receiving = null">Cancelar</AppButton><AppButton type="submit" :disabled="saving || !lines.some(line => line.quantity > 0)">Revisar recepción</AppButton></div>
                  </div>
                  <p class="text-sm text-muted-fg">Registre solamente lo que recibió y confirme dónde quedó en la sucursal.</p>
                  <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
                  <div class="space-y-3">
                    <div class="hidden gap-4 text-sm text-muted-fg sm:grid sm:grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1fr)_minmax(0,1.2fr)]" aria-hidden="true"><span>Producto</span><span>Pendiente</span><span>Cantidad recibida</span><span>Ubicación confirmada</span></div>
                    <div v-for="line in lines" :key="line.itemId" class="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-4">
                      <p class="text-base font-medium text-fg">{{ line.productName }}</p>
                      <p class="text-base tabular-nums text-fg"><span class="text-sm text-muted-fg sm:sr-only">Pendiente: </span>{{ line.pending }}<span class="sr-only"> {{ line.unit }}</span></p>
                      <label class="text-sm text-muted-fg"><span class="sm:sr-only">Cantidad recibida</span><input v-model.number="line.quantity" type="number" min="0" :max="line.pending" step="1" required :aria-label="'Cantidad recibida de ' + line.productName" class="field-control !mt-1.5 sm:!mt-0" /></label>
                      <label class="text-sm text-muted-fg"><span class="sm:sr-only">Ubicación confirmada</span><select v-model.number="line.locationId" required :aria-label="'Ubicación confirmada de ' + line.productName" class="field-control !mt-1.5 sm:!mt-0"><option :value="0" disabled>Seleccione espacio</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.code }}</option></select></label>
                    </div>
                  </div>
                  <AppButton type="button" variant="outline" :disabled="saving" @click="fillPending"><Check class="h-4 w-4" aria-hidden="true" />Recibir todo lo pendiente</AppButton>
                </form>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <ConfirmDialog v-if="confirming" title="Confirmar recepción de sucursal" description="Confirma las cantidades recibidas y los espacios donde quedaron físicamente los productos." :busy="saving" :error="error" @confirm="confirm" @close="confirming = false" />
  </section>
</template>
