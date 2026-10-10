<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleX, EllipsisVertical, FilePenLine, FileText, ListChecks, Package, Pencil, PlusCircle, RefreshCw, Send, StickyNote, Tag, Truck } from 'lucide-vue-next';
import type { Component } from 'vue';
import AdminLayout from '../layouts/AdminLayout.vue';
import AppBadge from '../components/base/AppBadge.vue';
import AppButton from '../components/base/AppButton.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import TrashButton from '../components/admin/TrashButton.vue';
import PurchaseTabs from '../components/purchases/PurchaseTabs.vue';
import TrackingLink from '../components/purchases/TrackingLink.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { useFeedbackStore } from '../stores/feedback.store';
import { getApiErrorMessage } from '../utils/api-error';
import { purchaseStage } from '../utils/purchase-inbox';
import { documentAction, needsProcessStep } from '../utils/purchase-next-action';
import { purchasePurposeLabel } from '../utils/purchase-workflow';
import { canCancelRequest, deliveredQuantity, hasBranchDeliveries, isEditableRequest, processSnapshot, quotationEntryLocation, requestEditLocation, requestListLocation, requestNextStep, requestStatusIcon, type RequestStatusIcon } from '../utils/purchase-request';
import { documentStatusLabel, documentStatusVariant, formatQuantity, type TrackingStep } from '../utils/purchase-tracking';

const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const feedback = useFeedbackStore();

const request = ref<any>(null);
const loading = ref(false);
const busy = ref(false);
const notFound = ref(false);
const error = ref('');
const tab = ref('products');
const processStep = ref<TrackingStep | null>(null);
const processInfo = ref<{ stage: string; done: number; total: number } | null>(null);
const cancelling = ref(false);
let version = 0;

const id = computed(() => Number(route.params.id));
const editable = computed(() => !!request.value && isEditableRequest(request.value.status) && can('purchase_requests.update'));
const tabs = computed(() => [
  { value: 'products', label: 'Productos', count: request.value?.details?.length ?? 0, icon: Package },
  { value: 'deliveries', label: 'Entregas', icon: Truck },
  { value: 'information', label: 'Información', icon: FileText },
]);

const shortDate = (value?: string | null) => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Por confirmar';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('es-SV', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

async function loadProcess() {
  const current = ++version;
  processStep.value = null; processInfo.value = null;
  const companyId = activeCompanyId.value;
  if (!request.value || !companyId || !needsProcessStep('requests', request.value) || !can('purchases.view')) return;
  try {
    const response = await http.get(`/purchases/tracking/request/${request.value.id}`, { headers: { 'X-Company-Id': String(companyId) } });
    if (current !== version || companyId !== activeCompanyId.value) return;
    const snapshot = processSnapshot(response.data.data);
    processStep.value = snapshot.step; processInfo.value = snapshot.info;
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
  const chosen = documentAction('requests', request.value, { can, quoteExpired: false, hasPendingOrderLines: false, processStep: processStep.value });
  if (!chosen) return null;
  const record = request.value;
  const run = () => {
    switch (chosen.kind) {
      case 'edit-request': return void router.push(requestEditLocation(record.id));
      case 'workflow': return void post(chosen.path, {}, chosen.message);
      case 'new-quotation': return void router.push(quotationEntryLocation(record));
      case 'navigate': return void router.push({ path: chosen.path, query: chosen.query ?? {} });
    }
  };
  return { label: chosen.label, kind: chosen.kind, run };
});
const canCancel = computed(() => !!request.value && canCancelRequest(request.value.status) && can('purchase_requests.cancel'));
const showDeliveriesLink = computed(() => !!request.value && hasBranchDeliveries(request.value.status) && can('inventory.view'));
// Deleting is infrequent and destructive, so it lives in the menu rather than next to the main action.
const hasMenu = computed(() => showDeliveriesLink.value || canCancel.value || can('trash.delete'));
const STATUS_ICONS: Record<RequestStatusIcon, Component> = { draft: FilePenLine, sent: Send, progress: Truck, delivered: CircleCheck, cancelled: CircleX, attention: CircleAlert };
const statusIcon = computed(() => STATUS_ICONS[requestStatusIcon(request.value?.status ?? '')]);
// The next step is the most important thing on the page: it gets its own block with who does it and the button for it.
const callout = computed(() => {
  const record = request.value;
  if (!record) return null;
  const progress = processInfo.value ? `Etapa ${processInfo.value.stage} · ${processInfo.value.done} de ${processInfo.value.total} completas.` : '';
  if (processStep.value) return { tone: 'action' as const, title: processStep.value.label, description: `A cargo de ${processStep.value.owner}. ${progress}`.trim(), icon: ArrowRight };
  const own = requestNextStep(record.status);
  if (own) return { tone: 'action' as const, title: own.label, description: own.hint, icon: ArrowRight };
  if (record.status === 'fulfilled') return { tone: 'success' as const, title: 'Solicitud completada', description: 'Todos los productos fueron entregados a la sucursal.', icon: CircleCheck };
  if (record.status === 'cancelled') return { tone: 'neutral' as const, title: 'Solicitud cancelada', description: 'Esta solicitud ya no sigue en el proceso de compra.', icon: CircleX };
  return { tone: 'neutral' as const, title: stageText.value, description: progress, icon: ListChecks };
});
const stageText = computed(() => request.value ? purchaseStage('requests', request.value.status) : '');

const goEdit = (options: { addLine?: boolean } = {}) => void router.push(requestEditLocation(request.value.id, options));
function afterRemoved() { feedback.success('Solicitud enviada a la papelera'); void router.push(requestListLocation()); }

onMounted(() => void load());
onBeforeUnmount(() => { version++; });
watch([() => route.params.id, activeCompanyId], () => { tab.value = 'products'; void load(); });
</script>

<template>
  <AdminLayout :title="request ? 'Solicitud ' + request.code : 'Solicitud de compra'">
    <div class="mx-auto max-w-[1200px] space-y-5">
      <nav aria-label="Ruta de navegación">
        <RouterLink :to="requestListLocation(id)" class="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-medium text-muted-fg transition-colors hover:text-fg"><ArrowLeft class="h-4 w-4" aria-hidden="true" />Volver a solicitudes</RouterLink>
      </nav>

      <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>

      <div v-if="notFound" class="rounded-xl border border-border/70 bg-surface p-8 text-center">
        <h1 class="text-lg font-semibold text-fg">No encontramos esta solicitud</h1>
        <p class="mt-2 text-sm text-muted-fg">No existe o pertenece a otra empresa.</p>
        <div class="mt-4 flex justify-center"><AppButton variant="outline" @click="router.push(requestListLocation())">Ver solicitudes</AppButton></div>
      </div>

      <div v-else-if="loading && !request" class="space-y-4" aria-busy="true" aria-label="Cargando solicitud">
        <div class="h-24 animate-pulse rounded-xl bg-surface-secondary" /><div class="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>

      <template v-else-if="request">
        <!-- Header: the document on the left; its state, the main action and the menu on the right -->
        <header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="text-3xl font-semibold tracking-tight text-fg">{{ request.code }}</h1>
              <button v-if="editable" type="button" class="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-fg transition-colors hover:bg-surface-secondary hover:text-fg" title="Editar solicitud" aria-label="Editar solicitud" :disabled="busy" @click="goEdit()"><Pencil class="h-4 w-4" aria-hidden="true" /></button>
              <TrackingLink type="request" :id="request.id" />
            </div>
            <p class="mt-1.5 text-muted-fg">{{ request.branch?.name }}</p>
          </div>
          <fieldset :disabled="busy" class="flex flex-wrap items-center gap-2">
            <AppBadge :variant="documentStatusVariant(request.status)">{{ documentStatusLabel(request.status) }}</AppBadge>
            <AppButton v-if="mainAction" @click="mainAction.run()"><Send v-if="mainAction.kind === 'workflow'" class="h-4 w-4" aria-hidden="true" />{{ mainAction.label }}<ChevronRight v-if="mainAction.kind !== 'workflow'" class="h-4 w-4" aria-hidden="true" /></AppButton>
            <details v-if="hasMenu" class="relative">
              <summary class="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary [&::-webkit-details-marker]:hidden"><EllipsisVertical class="h-4 w-4 text-muted-fg" aria-hidden="true" />Más acciones<ChevronDown class="h-4 w-4 text-muted-fg" aria-hidden="true" /></summary>
              <div class="absolute right-0 z-30 mt-2 flex min-w-56 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-subtle">
                <RouterLink v-if="showDeliveriesLink" :to="{ path: '/inventory/warehouse', query: { requestId: String(request.id) } }" class="rounded-lg border border-border px-3 py-2 text-center text-sm hover:bg-surface-secondary">Ver entregas a sucursal</RouterLink>
                <AppButton v-if="canCancel" variant="outline" @click="cancelling = true">Cancelar solicitud</AppButton>
                <TrashButton v-if="can('trash.delete')" entity="purchase_requests" :record-id="request.id" :label="request.code" :disabled="busy" @deleted="afterRemoved" />
              </div>
            </details>
            <AppButton variant="ghost" :disabled="loading" title="Actualizar" aria-label="Actualizar" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" aria-hidden="true" /></AppButton>
          </fieldset>
        </header>

        <!-- Next step: what comes next and why, in a soft block that is hard to miss -->
        <section v-if="callout" aria-labelledby="next-step-title" class="flex flex-col gap-4 rounded-xl border px-6 py-4 sm:flex-row sm:items-center sm:gap-6" :class="callout.tone === 'action' ? 'border-accent/15 bg-accent-soft' : callout.tone === 'success' ? 'border-success/30 bg-success/10' : 'border-border/70 bg-surface'">
          <div class="flex min-w-0 items-center gap-5">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2" :class="callout.tone === 'action' ? 'border-accent text-accent' : callout.tone === 'success' ? 'border-success text-success' : 'border-border text-muted-fg'"><component :is="callout.icon" class="h-6 w-6" aria-hidden="true" /></span>
            <div class="min-w-0">
              <p class="text-sm text-fg/80">{{ callout.tone === 'action' ? 'Siguiente paso' : 'Estado de la solicitud' }}</p>
              <h2 id="next-step-title" class="mt-0.5 text-xl font-semibold leading-snug" :class="callout.tone === 'action' ? 'text-accent' : callout.tone === 'success' ? 'text-success' : 'text-fg'">{{ callout.title }}</h2>
            </div>
          </div>
          <p v-if="callout.description" class="max-w-2xl text-sm leading-6 text-muted-fg sm:border-l sm:py-1 sm:pl-6" :class="callout.tone === 'action' ? 'sm:border-accent/40' : 'sm:border-border'">{{ callout.description }}</p>
        </section>

        <div class="border-b border-border/70"><PurchaseTabs variant="underline" :model-value="tab" :items="tabs" label="Secciones de la solicitud" @update:model-value="tab = $event" /></div>

        <!-- Productos: one container, sections separated by lines -->
        <div v-if="tab === 'products'" class="divide-y divide-border/70 rounded-xl border border-border/70 bg-surface">
          <section aria-labelledby="detail-general" class="p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 id="detail-general" class="flex items-center gap-3 text-base font-semibold text-fg"><span class="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent"><FileText class="h-4 w-4" aria-hidden="true" /></span>Información general</h2>
              <AppButton v-if="editable" variant="outline" size="sm" :disabled="busy" @click="goEdit()"><Pencil class="h-4 w-4" aria-hidden="true" />Editar información</AppButton>
            </div>
            <dl class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Sucursal</dt><dd class="mt-1.5 flex items-center gap-2 text-sm font-medium text-fg"><Building2 class="h-4 w-4 shrink-0 text-muted-fg" aria-hidden="true" /><span class="min-w-0">{{ request.branch?.name }}</span></dd></div>
              <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Estado</dt><dd class="mt-1.5 flex items-center gap-2"><component :is="statusIcon" class="h-4 w-4 shrink-0 text-muted-fg" aria-hidden="true" /><AppBadge :variant="documentStatusVariant(request.status)">{{ documentStatusLabel(request.status) }}</AppBadge></dd></div>
              <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Fecha requerida</dt><dd class="mt-1.5 flex items-center gap-2 text-sm font-medium text-fg"><CalendarDays class="h-4 w-4 shrink-0 text-muted-fg" aria-hidden="true" />{{ shortDate(request.requiredDate) }}</dd></div>
              <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Finalidad de la compra</dt><dd class="mt-1.5 flex items-center gap-2 text-sm font-medium text-fg"><Tag class="h-4 w-4 shrink-0 text-muted-fg" aria-hidden="true" /><span class="min-w-0">{{ purchasePurposeLabel(request.purpose) }}</span></dd></div>
            </dl>
            <div class="mt-5">
              <p class="text-xs text-muted-fg">Motivo de la compra</p>
              <p class="mt-1 max-w-3xl text-base font-medium leading-7 text-fg">{{ request.justification }}</p>
            </div>
          </section>

          <section aria-labelledby="detail-products" class="p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 id="detail-products" class="flex items-center gap-3 text-base font-semibold text-fg"><span class="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent"><Package class="h-4 w-4" aria-hidden="true" /></span>Productos e insumos<span class="text-sm font-normal tabular-nums text-muted-fg">({{ request.details.length }})</span></h2>
              <AppButton v-if="editable" variant="outline" size="sm" :disabled="busy" @click="goEdit()"><Pencil class="h-4 w-4" aria-hidden="true" />Editar productos</AppButton>
            </div>
            <div class="mt-4 overflow-x-auto rounded-lg border border-border">
              <table class="w-full min-w-[560px] text-left text-sm">
                <thead class="border-b border-border bg-surface-secondary text-xs text-muted-fg"><tr><th scope="col" class="w-12 px-4 py-3 font-medium">#</th><th scope="col" class="px-4 py-3 font-medium">Producto</th><th scope="col" class="px-4 py-3 font-medium">Código</th><th scope="col" class="px-4 py-3 font-medium">Unidad</th><th scope="col" class="px-4 py-3 text-right font-medium">Cantidad solicitada</th><th v-if="editable" scope="col" class="w-20 px-4 py-3 text-right font-medium">Acciones</th></tr></thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="(line, index) in request.details" :key="line.id"><td class="px-4 py-3 tabular-nums text-muted-fg">{{ Number(index) + 1 }}</td><td class="px-4 py-3 font-medium text-fg">{{ line.product.name }}</td><td class="px-4 py-3 text-muted-fg">{{ line.product.internalCode }}</td><td class="px-4 py-3 text-muted-fg">{{ line.unit.name }}</td><td class="px-4 py-3 text-right font-medium tabular-nums text-fg">{{ formatQuantity(Number(line.quantity)) }}</td>
                    <td v-if="editable" class="px-4 py-2 text-right"><button type="button" class="inline-grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-fg transition-colors hover:bg-surface-secondary hover:text-fg" :title="'Editar ' + line.product.name" :aria-label="'Editar ' + line.product.name" :disabled="busy" @click="goEdit()"><Pencil class="h-3.5 w-3.5" aria-hidden="true" /></button></td></tr>
                </tbody>
              </table>
            </div>
            <button v-if="editable" type="button" class="mt-3 flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-fg transition-colors hover:border-accent hover:text-accent" :disabled="busy" @click="goEdit({ addLine: true })"><span class="inline-flex items-center gap-2"><PlusCircle class="h-4 w-4" aria-hidden="true" />Agregar otro producto</span><span class="text-xs font-normal">Puedes agregar todos los productos o insumos necesarios para esta solicitud.</span></button>
          </section>

          <section aria-labelledby="detail-notes" class="p-5">
            <h2 id="detail-notes" class="flex items-center gap-2 text-sm font-semibold text-fg"><StickyNote class="h-4 w-4 text-muted-fg" aria-hidden="true" />Observaciones <span class="font-normal text-muted-fg">(opcional)</span></h2>
            <div class="mt-2 min-h-14 whitespace-pre-wrap rounded-lg border border-border bg-surface px-3 py-2.5 text-sm leading-6" :class="request.notes ? 'text-fg' : 'text-muted-fg'">{{ request.notes || 'Sin observaciones' }}</div>
          </section>
        </div>

        <!-- Entregas -->
        <section v-else-if="tab === 'deliveries'" aria-labelledby="detail-deliveries" class="rounded-xl border border-border/70 bg-surface p-5">
          <h2 id="detail-deliveries" class="flex items-center gap-3 text-base font-semibold text-fg"><span class="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent"><Truck class="h-4 w-4" aria-hidden="true" /></span>Entrega a la sucursal solicitante</h2>
          <div class="mt-4 overflow-x-auto rounded-lg border border-border">
            <table class="w-full min-w-[560px] text-left text-sm">
              <thead class="border-b border-border bg-surface-secondary text-xs text-muted-fg"><tr><th scope="col" class="px-4 py-3 font-medium">Producto</th><th scope="col" class="px-4 py-3 text-right font-medium">Solicitado</th><th scope="col" class="px-4 py-3 text-right font-medium">Despachado</th><th scope="col" class="px-4 py-3 text-right font-medium">Recibido en sucursal</th><th scope="col" class="px-4 py-3 text-right font-medium">Pendiente</th></tr></thead>
              <tbody class="divide-y divide-border">
                <tr v-for="line in request.details" :key="line.id"><td class="px-4 py-3"><p class="font-medium text-fg">{{ line.product.name }}</p><p class="mt-1 text-xs text-muted-fg">{{ line.unit.name }}</p></td><td class="px-4 py-3 text-right tabular-nums">{{ formatQuantity(Number(line.quantity)) }}</td><td class="px-4 py-3 text-right tabular-nums">{{ formatQuantity(deliveredQuantity(line, 'quantity')) }}</td><td class="px-4 py-3 text-right tabular-nums">{{ formatQuantity(deliveredQuantity(line, 'receivedQuantity')) }}</td><td class="px-4 py-3 text-right font-medium tabular-nums text-fg">{{ formatQuantity(Math.max(0, Number(line.quantity) - deliveredQuantity(line, 'receivedQuantity'))) }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Información -->
        <section v-else aria-labelledby="detail-data" class="rounded-xl border border-border/70 bg-surface p-5">
          <h2 id="detail-data" class="flex items-center gap-3 text-base font-semibold text-fg"><span class="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent"><FileText class="h-4 w-4" aria-hidden="true" /></span>Datos del documento</h2>
          <dl class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Fecha requerida</dt><dd class="mt-1.5 text-sm font-medium text-fg">{{ shortDate(request.requiredDate) }}</dd></div>
            <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Creada</dt><dd class="mt-1.5 text-sm font-medium text-fg">{{ dateTime(request.requestDate) }}</dd></div>
            <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Solicitante</dt><dd class="mt-1.5 text-sm font-medium text-fg">{{ request.user?.username }}</dd></div>
            <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Centro de almacenaje</dt><dd class="mt-1.5 text-sm font-medium text-fg">{{ request.warehouse?.name || 'Por confirmar' }}</dd></div>
            <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Productos</dt><dd class="mt-1.5 text-sm font-medium text-fg">{{ request.details.length }} líneas</dd></div>
            <div class="rounded-lg border border-border/80 px-4 py-3"><dt class="text-xs text-muted-fg">Origen</dt><dd class="mt-1.5 text-sm font-medium text-fg">{{ request.quotationLinks?.length ?? 0 }} cotizaciones</dd></div>
          </dl>
        </section>

      </template>
    </div>

    <PurchaseActionDialog v-if="cancelling && request" title="Cancelar solicitud" :description="`Solicitud ${request.code}. El motivo quedará registrado en su historial.`" require-reason destructive confirm-label="Cancelar solicitud" :busy="busy" :error="error" @confirm="(reason: string) => post(`/purchase-requests/${request.id}/cancel`, { reason }, 'Solicitud cancelada')" @close="cancelling = false" />
  </AdminLayout>
</template>
