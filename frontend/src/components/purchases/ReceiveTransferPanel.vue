<script setup lang="ts">
// The branch confirms what arrived from the warehouse inside its own request: quantities received and where they were placed.
import { computed, onMounted, ref, watch } from 'vue';
import { Check, PackageCheck } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import AppBadge from '../base/AppBadge.vue';
import PurchaseActionDialog from '../base/PurchaseActionDialog.vue';
import { http } from '../../services/http.service';
import { activeCompanyId } from '../../services/company-context';
import { useFeedbackStore } from '../../stores/feedback.store';
import { getApiErrorMessage } from '../../utils/api-error';
import { documentStatusLabel, documentStatusVariant } from '../../utils/purchase-tracking';

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
  <section v-if="mine.length" aria-labelledby="receive-transfers-title" class="mt-6 border-t border-border/70 pt-5">
    <h3 id="receive-transfers-title" class="flex items-center gap-2 text-sm font-semibold text-fg"><PackageCheck class="h-4 w-4 text-accent" aria-hidden="true" />Despachos del almacén</h3>
    <p v-if="error && !receiving" role="alert" class="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <ul class="mt-3 divide-y divide-border/70 rounded-xl border border-border/70">
      <li v-for="transfer in mine" :key="transfer.id" class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3"><strong class="text-sm">{{ transfer.documentNumber }}</strong><AppBadge :variant="documentStatusVariant(transfer.status)">{{ documentStatusLabel(transfer.status) }}</AppBadge></div>
          <AppButton v-if="canReceive(transfer) && receiving?.id !== transfer.id" size="sm" :disabled="loading || saving" @click="start(transfer)">Recibir en sucursal</AppButton>
        </div>
        <p v-for="item in itemsOf(transfer)" :key="item.id" class="mt-2 text-sm text-muted-fg">{{ item.product.name }}: despachado {{ Number(item.quantity) }}, recibido {{ Number(item.receivedQuantity) }}<span v-if="pendingOf(item) > 0">, en tránsito {{ pendingOf(item) }}</span>.</p>

        <form v-if="receiving?.id === transfer.id" class="mt-4 space-y-3 rounded-xl bg-surface-secondary p-4" @submit.prevent="review">
          <p class="text-sm text-muted-fg">Registre solamente lo que recibió y confirme dónde quedó en la sucursal.</p>
          <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">{{ error }}</p>
          <div v-for="line in lines" :key="line.itemId" class="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_1fr_1.2fr] sm:items-end">
            <p class="text-sm font-medium">{{ line.productName }}<span class="block text-xs font-normal text-muted-fg">Pendiente {{ line.pending }} {{ line.unit }}</span></p>
            <label class="text-sm">Cantidad recibida<input v-model.number="line.quantity" type="number" min="0" :max="line.pending" step="1" required class="field-control" /></label>
            <label class="text-sm">Ubicación confirmada<select v-model.number="line.locationId" required class="field-control"><option :value="0" disabled>Seleccione espacio</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.code }}</option></select></label>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <AppButton type="submit" :disabled="saving || !lines.some(line => line.quantity > 0)">Revisar recepción</AppButton>
            <AppButton type="button" variant="outline" :disabled="saving" @click="fillPending"><Check class="h-4 w-4" />Recibir todo lo pendiente</AppButton>
            <AppButton type="button" variant="ghost" :disabled="saving" @click="receiving = null">Cancelar</AppButton>
          </div>
        </form>
      </li>
    </ul>
    <PurchaseActionDialog v-if="confirming" title="Confirmar recepción de sucursal" description="Confirma las cantidades recibidas y los espacios donde quedaron físicamente los productos." :busy="saving" :error="error" @confirm="confirm" @close="confirming = false" />
  </section>
</template>
