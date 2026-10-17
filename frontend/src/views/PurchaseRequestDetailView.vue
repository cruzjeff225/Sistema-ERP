<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, CircleCheck, CircleX, EllipsisVertical, FileText, ListChecks, Pencil, PlusCircle, RefreshCw, Send } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import AppButton from '../components/base/AppButton.vue';
import ConfirmDialog from '../components/base/ConfirmDialog.vue';
import TrashButton from '../components/admin/TrashButton.vue';
import PurchaseTabs from '../components/purchases/PurchaseTabs.vue';
import TrackingLink from '../components/purchases/TrackingLink.vue';
import ReceiveTransferPanel from '../components/purchases/ReceiveTransferPanel.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { recordRecentDocument } from '../composables/useRecentDocuments';
import { useFeedbackStore } from '../stores/feedback.store';
import { getApiErrorMessage } from '../utils/api-error';
import { purchaseStage } from '../utils/purchase-inbox';
import { documentAction, needsProcessStep } from '../utils/purchase-next-action';
import { myOwners, stepForUser } from '../utils/my-pending';
import { purchasePurposeLabel } from '../utils/purchase-workflow';
import { canCancelRequest, deliveredQuantity, hasBranchDeliveries, isAwaitingPurchasing, isEditableRequest, processSnapshot, quotationEntryLocation, requestEditLocation, requestLifecycle, requestListLocation, requestNextStep } from '../utils/purchase-request';
import { documentStatusLabel, documentStatusVariant, formatQuantity, statusDotClass, type TrackingStep } from '../utils/purchase-tracking';

const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const feedback = useFeedbackStore();

const request = ref<any>(null);
const loading = ref(false);
const busy = ref(false);
const notFound = ref(false);
const error = ref('');
const tab = ref(route.query.tab === 'deliveries' ? 'deliveries' : 'products');
const processStep = ref<TrackingStep | null>(null);
const processInfo = ref<{ stage: string; done: number; total: number } | null>(null);
const processAlso = ref<TrackingStep[]>([]);
// The step that is the user's own: the main one, or one the user's team can already take in parallel (e.g. receiving at the branch).
const ownStep = computed(() => stepForUser(processStep.value, processAlso.value, myOwners(can), can));
const cancelling = ref(false);
let version = 0;

const id = computed(() => Number(route.params.id));
const editable = computed(() => !!request.value && isEditableRequest(request.value.status) && can('purchase_requests.update'));
const tabs = computed(() => [
  { value: 'products', label: 'Productos', count: request.value?.details?.length ?? 0 },
  { value: 'deliveries', label: 'Entregas' },
  { value: 'information', label: 'Información' },
]);

const shortDate = (value?: string | null) => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Por confirmar';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('es-SV', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

async function loadProcess() {
  const current = ++version;
  processStep.value = null; processInfo.value = null; processAlso.value = [];
  const companyId = activeCompanyId.value;
  if (!request.value || !companyId || !needsProcessStep('requests', request.value) || !can('purchases.view')) return;
  try {
    const response = await http.get(`/purchases/tracking/request/${request.value.id}`, { headers: { 'X-Company-Id': String(companyId) } });
    if (current !== version || companyId !== activeCompanyId.value) return;
    const snapshot = processSnapshot(response.data.data);
    processStep.value = snapshot.step; processInfo.value = snapshot.info; processAlso.value = snapshot.also;
  } catch { /* The request still works without the process summary. */ }
}

async function load() {
  const companyId = activeCompanyId.value;
  if (!companyId || !Number.isInteger(id.value) || id.value < 1) { notFound.value = true; return; }
  loading.value = true; error.value = ''; notFound.value = false;
  try {
    const response = await http.get(`/purchase-requests/${id.value}`, { headers: { 'X-Company-Id': String(companyId) } });
    if (companyId !== activeCompanyId.value) return;
    request.value = response.data.data;
    recordRecentDocument({ key: `request:${request.value.id}`, code: request.value.code, kind: 'Solicitud de compra', stage: documentStatusLabel(request.value.status), to: `/purchases/requests/${request.value.id}`, anchor: { type: 'request', id: request.value.id } });
    await loadProcess();
  } catch (caught: any) {
    request.value = null;
    if (caught?.response?.status === 404) notFound.value = true;
    else error.value = getApiErrorMessage(caught, 'No se pudo cargar la solicitud');
  } finally { loading.value = false; }
}

async function post(path: string, body: object, success: string) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    await http.post(path, body, { headers: { 'X-Company-Id': String(activeCompanyId.value) } });
    feedback.success(success);
    cancelling.value = false;
    await load();
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo completar la operación'); }
  finally { busy.value = false; }
}

// The single red button is the next step of the process; what it does is decided in utils/purchase-next-action.
const mainAction = computed(() => {
  const chosen = documentAction('requests', request.value, { can, quoteExpired: false, hasPendingOrderLines: false, processStep: ownStep.value });
  if (!chosen) return null;
  const record = request.value;
  const run = () => {
    switch (chosen.kind) {
      case 'edit-request': return void router.push(requestEditLocation(record.id));
      case 'workflow': return void post(chosen.path, {}, chosen.message);
      case 'new-quotation': return void router.push(quotationEntryLocation(record));
      // Receiving at the branch happens inside this same request, in its Deliveries tab.
      case 'navigate': if (ownStep.value?.stage === 'delivery') { tab.value = 'deliveries'; return; } return void router.push({ path: chosen.path, query: chosen.query ?? {} });
    }
  };
  return { label: chosen.label, kind: chosen.kind, run };
});
const canCancel = computed(() => !!request.value && canCancelRequest(request.value.status) && can('purchase_requests.cancel'));
const showDeliveriesLink = computed(() => !!request.value && hasBranchDeliveries(request.value.status) && can('inventory.view'));
// Deleting is infrequent and destructive, so it lives in the menu rather than next to the main action.
const hasMenu = computed(() => showDeliveriesLink.value || canCancel.value || can('trash.delete'));
// The next step is the most important thing on the page: it gets its own block with who does it and the button for it.
const callout = computed(() => {
  const record = request.value;
  if (!record) return null;
  const progress = processInfo.value ? `Etapa ${processInfo.value.stage} · ${processInfo.value.done} de ${processInfo.value.total} completas.` : '';
  if (ownStep.value) return { tone: 'action' as const, title: ownStep.value.label, description: `A cargo de ${ownStep.value.owner}. ${progress}`.trim(), icon: ArrowRight };
  const own = requestNextStep(record.status);
  if (own) return { tone: 'action' as const, title: own.label, description: own.hint, icon: ArrowRight };
  if (record.status === 'fulfilled') return { tone: 'success' as const, title: 'Solicitud completada', description: 'Todos los productos fueron entregados a la sucursal.', icon: CircleCheck };
  if (record.status === 'cancelled') return { tone: 'neutral' as const, title: 'Solicitud cancelada', description: 'Esta solicitud ya no sigue en el proceso de compra.', icon: CircleX };
  return { tone: 'neutral' as const, title: stageText.value, description: progress, icon: ListChecks };
});
// One summary line (stage, progress, who acts) and, under it, what comes next.
const summary = computed(() => {
  const current = callout.value;
  if (!current) return null;
  if (ownStep.value && processInfo.value) return { primary: `${processInfo.value.stage} · ${processInfo.value.done} de ${processInfo.value.total} completas · A cargo de ${ownStep.value.owner}`, secondary: ownStep.value.label, next: true, tone: current.tone };
  return { primary: current.title, secondary: current.description, next: false, tone: current.tone };
});
const lifecycle = computed(() => request.value ? requestLifecycle(request.value.status) : null);
// The only real date we hold for the steps is when the draft was created.
const stepDate = (key: string) => key === 'draft' && request.value?.createdAt ? shortDate(request.value.createdAt.slice(0, 10)) : '';
// A request that already left the branch says so, and Purchasing gets the way in to its quotation.
const awaitingPurchasing = computed(() => !!request.value && isAwaitingPurchasing(request.value.status));
const bannerAction = computed(() => awaitingPurchasing.value ? mainAction.value : null);
// Receiving at the branch happens in the Deliveries tab; once the user is there, a header button that only leads there is redundant.
const onOwnDeliveryStep = computed(() => tab.value === 'deliveries' && ownStep.value?.stage === 'delivery');
const headerAction = computed(() => bannerAction.value || onOwnDeliveryStep.value ? null : mainAction.value);
const stageText = computed(() => request.value ? purchaseStage('requests', request.value.status) : '');

const goEdit = (options: { addLine?: boolean } = {}) => void router.push(requestEditLocation(request.value.id, options));
function afterRemoved() { feedback.success('Solicitud enviada a la papelera'); void router.push(requestListLocation()); }

onMounted(() => void load());
onBeforeUnmount(() => { version++; });
watch([() => route.params.id, activeCompanyId], () => { tab.value = route.query.tab === 'deliveries' ? 'deliveries' : 'products'; void load(); });
</script>

<template>
  <AdminLayout :title="request ? 'Solicitud ' + request.code : 'Solicitud de compra'">
    <div class="mx-auto max-w-[1200px] space-y-5">
      <nav aria-label="Volver al listado">
        <RouterLink :to="requestListLocation(id)" class="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-medium text-muted-fg transition-colors hover:text-fg"><ArrowLeft class="h-4 w-4" aria-hidden="true" />Volver a solicitudes</RouterLink>
      </nav>

      <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>

      <div v-if="notFound" class="rounded-[12px] border border-border bg-surface p-8 text-center">
        <h1 class="text-lg font-semibold text-fg">No encontramos esta solicitud</h1>
        <p class="mt-2 text-sm text-muted-fg">No existe o pertenece a otra empresa.</p>
        <div class="mt-4 flex justify-center"><AppButton variant="outline" @click="router.push(requestListLocation())">Ver solicitudes</AppButton></div>
      </div>

      <div v-else-if="loading && !request" class="space-y-4" aria-busy="true" aria-label="Cargando solicitud">
        <div class="h-24 animate-pulse rounded-[12px] bg-surface-secondary" /><div class="h-64 animate-pulse rounded-[12px] bg-surface-secondary" />
      </div>

      <template v-else-if="request">
        <!-- Header: the document and its state on the left; the main action, the menu and refresh on the right -->
        <header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ request.code }}</h1>
              <span class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-fg"><span class="h-2 w-2 rounded-full" :class="statusDotClass(documentStatusVariant(request.status))" aria-hidden="true" />{{ documentStatusLabel(request.status) }}</span>
              <button v-if="editable" type="button" class="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-fg transition-colors hover:bg-surface-secondary hover:text-fg" title="Editar solicitud" aria-label="Editar solicitud" :disabled="busy" @click="goEdit()"><Pencil class="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-fg"><span>{{ request.branch?.name }}</span><TrackingLink type="request" :id="request.id" /></div>
          </div>
          <fieldset :disabled="busy" class="flex flex-wrap items-center gap-2">
            <AppButton v-if="headerAction" @click="headerAction.run()"><Send v-if="headerAction.kind === 'workflow'" class="h-4 w-4" aria-hidden="true" />{{ headerAction.label }}<ChevronRight v-if="headerAction.kind !== 'workflow'" class="h-4 w-4" aria-hidden="true" /></AppButton>
            <details v-if="hasMenu" class="relative">
              <summary class="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary [&::-webkit-details-marker]:hidden"><EllipsisVertical class="h-4 w-4 text-muted-fg" aria-hidden="true" />Más acciones<ChevronDown class="h-4 w-4 text-muted-fg" aria-hidden="true" /></summary>
              <div class="absolute right-0 z-30 mt-2 flex min-w-56 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-subtle">
                <RouterLink v-if="showDeliveriesLink" :to="{ path: '/inventory/warehouse', query: { requestId: String(request.id) } }" class="rounded-lg border border-border px-3 py-2 text-center text-sm hover:bg-surface-secondary">Ver entregas a sucursal</RouterLink>
                <AppButton v-if="canCancel" variant="outline" @click="cancelling = true">Cancelar solicitud</AppButton>
                <TrashButton v-if="can('trash.delete')" entity="purchase_requests" :record-id="request.id" :label="request.code" :disabled="busy" @deleted="afterRemoved" />
              </div>
            </details>
            <AppButton variant="outline" class="!w-9 !px-0" :disabled="loading" title="Actualizar" aria-label="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" aria-hidden="true" /></AppButton>
          </fieldset>
        </header>

        <!-- Where the request is and what comes next -->
        <section v-if="summary" aria-labelledby="next-step-title">
          <div class="min-w-0">
            <h2 id="next-step-title" class="text-base font-medium" :class="summary.tone === 'success' ? 'text-success' : 'text-fg'">{{ summary.primary }}</h2>
            <p v-if="summary.secondary" class="mt-0.5 text-sm text-muted-fg"><span v-if="summary.next" class="sr-only">Siguiente paso: </span>{{ summary.secondary }}</p>
          </div>
        </section>

        <div class="border-b border-border"><PurchaseTabs variant="underline" :model-value="tab" :items="tabs" label="Secciones de la solicitud" @update:model-value="tab = $event" /></div>

        <!-- Productos: the lines and notes on the left, the general data on the right -->
        <div v-if="tab === 'products'" class="space-y-5">
          <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div class="min-w-0 divide-y divide-border rounded-[12px] border border-border bg-surface">
              <section aria-labelledby="detail-products" class="p-5">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="detail-products" class="text-base font-semibold text-fg">Productos e insumos <span class="text-sm font-normal tabular-nums text-muted-fg">({{ request.details.length }})</span></h2>
                  <AppButton v-if="editable" variant="outline" size="sm" :disabled="busy" @click="goEdit()"><Pencil class="h-4 w-4" aria-hidden="true" />Editar productos</AppButton>
                </div>
                <div class="mt-4 overflow-x-auto rounded-lg border border-border">
                  <table class="w-full min-w-[480px] text-left text-sm">
                    <thead class="border-b border-border bg-surface-secondary text-xs text-muted-fg"><tr><th scope="col" class="w-12 px-4 py-2.5 font-medium">#</th><th scope="col" class="px-4 py-2.5 font-medium">Producto</th><th scope="col" class="px-4 py-2.5 font-medium">Unidad</th><th scope="col" class="px-4 py-2.5 text-right font-medium">Cantidad solicitada</th><th v-if="editable" scope="col" class="w-20 px-4 py-2.5 text-right font-medium">Acciones</th></tr></thead>
                    <tbody class="divide-y divide-border">
                      <tr v-for="(line, index) in request.details" :key="line.id"><td class="px-4 py-3 tabular-nums text-muted-fg">{{ Number(index) + 1 }}</td><td class="px-4 py-3"><p class="font-medium text-fg">{{ line.product.name }}</p><p class="mt-0.5 text-xs text-muted-fg">{{ line.product.internalCode }}</p></td><td class="px-4 py-3 text-muted-fg">{{ line.unit.name }}</td><td class="px-4 py-3 text-right font-medium tabular-nums text-fg">{{ formatQuantity(Number(line.quantity)) }}</td>
                        <td v-if="editable" class="px-4 py-2 text-right"><button type="button" class="inline-grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-fg transition-colors hover:bg-surface-secondary hover:text-fg" :title="'Editar ' + line.product.name" :aria-label="'Editar ' + line.product.name" :disabled="busy" @click="goEdit()"><Pencil class="h-3.5 w-3.5" aria-hidden="true" /></button></td></tr>
                    </tbody>
                  </table>
                </div>
                <button v-if="editable" type="button" class="mt-3 flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-fg transition-colors hover:border-accent hover:text-accent" :disabled="busy" @click="goEdit({ addLine: true })"><span class="inline-flex items-center gap-2"><PlusCircle class="h-4 w-4" aria-hidden="true" />Agregar otro producto</span><span class="text-xs font-normal">Puedes agregar todos los productos o insumos necesarios para esta solicitud.</span></button>
              </section>

              <section aria-labelledby="detail-notes" class="p-5">
                <h2 id="detail-notes" class="text-base font-semibold text-fg">Observaciones</h2>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-6" :class="request.notes ? 'text-fg' : 'text-muted-fg'">{{ request.notes || 'Sin observaciones' }}</p>
              </section>
            </div>

            <section aria-labelledby="detail-general" class="rounded-[12px] border border-border bg-surface p-5">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 id="detail-general" class="text-base font-semibold text-fg">Información general</h2>
                <AppButton v-if="editable" variant="outline" size="sm" :disabled="busy" @click="goEdit()"><Pencil class="h-4 w-4" aria-hidden="true" />Editar información</AppButton>
              </div>
              <dl class="mt-4 space-y-4 text-sm">
                <div><dt class="text-muted-fg">Sucursal</dt><dd class="mt-0.5 font-medium text-fg">{{ request.branch?.name }}</dd></div>
                <div><dt class="text-muted-fg">Fecha requerida</dt><dd class="mt-0.5 font-medium text-fg">{{ shortDate(request.requiredDate) }}</dd></div>
                <div><dt class="text-muted-fg">Finalidad de la compra</dt><dd class="mt-0.5 font-medium text-fg">{{ purchasePurposeLabel(request.purpose) }}</dd></div>
                <div><dt class="text-muted-fg">Motivo de la compra</dt><dd class="mt-0.5 font-medium text-fg">{{ request.justification }}</dd></div>
                <div v-if="request.createdAt"><dt class="text-muted-fg">Creada el</dt><dd class="mt-0.5 font-medium tabular-nums text-fg">{{ dateTime(request.createdAt) }}</dd></div>
              </dl>
              <ol v-if="lifecycle && lifecycle.some(step => stepDate(step.key))" class="mt-5 space-y-1 border-t border-border pt-4 text-sm text-muted-fg" aria-label="Fechas de la solicitud"><template v-for="step in lifecycle" :key="step.key"><li v-if="stepDate(step.key)">{{ step.label }} · {{ stepDate(step.key) }}</li></template></ol>
            </section>
          </div>

          <div v-if="awaitingPurchasing" class="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-success/40 bg-success/10 px-5 py-4">
            <div class="flex min-w-0 items-start gap-3">
              <CircleCheck class="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div><p class="font-semibold text-fg">Solicitud enviada a Compras</p><p class="mt-0.5 text-sm text-muted-fg">Esta solicitud ya fue enviada y está disponible para su revisión en el área de Compras.</p></div>
            </div>
            <AppButton v-if="bannerAction" variant="outline" :disabled="busy" @click="bannerAction.run()"><FileText class="h-4 w-4" aria-hidden="true" />Ver en gestión de cotización</AppButton>
          </div>
        </div>

        <!-- Entregas -->
        <div v-else-if="tab === 'deliveries'" class="space-y-5">
        <section aria-labelledby="detail-deliveries" class="rounded-[12px] border border-border bg-surface p-5 sm:p-6">
          <h2 id="detail-deliveries" class="text-xl font-semibold tracking-tight text-fg">Entrega a la sucursal solicitante</h2>
          <div class="mt-4 overflow-x-auto rounded-[12px] border border-border">
            <table class="w-full min-w-[560px] text-left text-sm">
              <thead class="border-b border-border bg-surface-secondary text-sm text-muted-fg"><tr><th scope="col" class="px-4 py-3 font-medium">Producto</th><th scope="col" class="px-4 py-3 text-right font-medium">Solicitado</th><th scope="col" class="px-4 py-3 text-right font-medium">Despachado</th><th scope="col" class="px-4 py-3 text-right font-medium">Recibido en sucursal</th><th scope="col" class="px-4 py-3 text-right font-medium">Pendiente</th></tr></thead>
              <tbody class="divide-y divide-border">
                <tr v-for="line in request.details" :key="line.id"><td class="px-4 py-3"><p class="font-medium text-fg">{{ line.product.name }}</p><p class="mt-0.5 text-sm text-muted-fg">{{ line.unit.name }}</p></td><td class="px-4 py-3 text-right tabular-nums">{{ formatQuantity(Number(line.quantity)) }}</td><td class="px-4 py-3 text-right tabular-nums">{{ formatQuantity(deliveredQuantity(line, 'quantity')) }}</td><td class="px-4 py-3 text-right tabular-nums">{{ formatQuantity(deliveredQuantity(line, 'receivedQuantity')) }}</td><td class="px-4 py-3 text-right font-medium tabular-nums text-fg">{{ formatQuantity(Math.max(0, Number(line.quantity) - deliveredQuantity(line, 'receivedQuantity'))) }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
          <ReceiveTransferPanel v-if="can('inventory.view') && can('inventory.adjust')" :request-id="request.id" @received="load" />
        </div>

        <!-- Información -->
        <section v-else aria-labelledby="detail-data" class="rounded-[12px] border border-border bg-surface p-5">
          <h2 id="detail-data" class="text-base font-semibold text-fg">Datos del documento</h2>
          <dl class="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt class="text-muted-fg">Fecha requerida</dt><dd class="mt-0.5 font-medium text-fg">{{ shortDate(request.requiredDate) }}</dd></div>
            <div><dt class="text-muted-fg">Creada</dt><dd class="mt-0.5 font-medium text-fg">{{ dateTime(request.requestDate) }}</dd></div>
            <div><dt class="text-muted-fg">Solicitante</dt><dd class="mt-0.5 font-medium text-fg">{{ request.user?.username }}</dd></div>
            <div><dt class="text-muted-fg">Centro de almacenaje</dt><dd class="mt-0.5 font-medium text-fg">{{ request.warehouse?.name || 'Por confirmar' }}</dd></div>
            <div><dt class="text-muted-fg">Productos</dt><dd class="mt-0.5 font-medium text-fg">{{ request.details.length }} líneas</dd></div>
            <div><dt class="text-muted-fg">Origen</dt><dd class="mt-0.5 font-medium text-fg">{{ request.quotationLinks?.length ?? 0 }} cotizaciones</dd></div>
          </dl>
        </section>

      </template>
    </div>

    <ConfirmDialog v-if="cancelling && request" title="Cancelar solicitud" :description="`Solicitud ${request.code}. El motivo quedará registrado en su historial.`" require-reason destructive confirm-label="Cancelar solicitud" :busy="busy" :error="error" @confirm="(reason: string) => post(`/purchase-requests/${request.id}/cancel`, { reason }, 'Solicitud cancelada')" @close="cancelling = false" />
  </AdminLayout>
</template>
