<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Check, ClipboardList, Coins, FileSearch, FileText, Layers, ListChecks, Lock, Package, PackageCheck, RefreshCw, Truck, TriangleAlert } from 'lucide-vue-next';
import type { Component } from 'vue';
import AdminLayout from '../layouts/AdminLayout.vue';
import AppButton from '../components/base/AppButton.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { recordRecentDocument } from '../composables/useRecentDocuments';
import { getApiErrorMessage } from '../utils/api-error';
import {
  canOpenRoute, currentStageId, DOCUMENT_GROUPS, documentLocation, documentStatusLabel, documentStatusVariant, formatQuantity, isTrackingType,
  processSummary, progressPercent, stateLabel, statusDotClass, stepLocation, type Tracking, type TrackingStep,
} from '../utils/purchase-tracking';

const route = useRoute();
const router = useRouter();
const { can } = usePermissions();

const data = ref<Tracking | null>(null);
const loading = ref(false);
const error = ref('');
const notFound = ref(false);
let requestVersion = 0;

const anchor = computed(() => ({ type: String(route.params.type ?? ''), id: Number(route.params.id) }));
const validAnchor = computed(() => isTrackingType(anchor.value.type) && Number.isInteger(anchor.value.id) && anchor.value.id > 0);
const activeStage = computed(() => data.value ? currentStageId(data.value.stages, data.value.nextStep) : null);
const visibleGroups = computed(() => DOCUMENT_GROUPS.map(group => ({ ...group, docs: data.value?.documents[group.key] ?? [] })).filter(group => group.docs.length));
// The icon of each stage, so the eight steps can be told apart at a glance.
const STAGE_ICONS: Record<string, Component> = { requests: ClipboardList, quantities: Layers, quotation: FileSearch, order: FileText, reception: Package, costs: Coins, distribution: Truck, delivery: PackageCheck };
const stageIcon = (id: string) => STAGE_ICONS[id] ?? ListChecks;
const hasDecided = computed(() => data.value?.lines.some(line => line.decided !== null) ?? false);

const KIND_LABEL: Record<string, string> = { request: 'Solicitud de compra', consolidation: 'Gestión de cotización', quotation: 'Oferta de proveedor', order: 'Orden de compra', receipt: 'Recepción', retaceo: 'Retaceo' };
// Keep this purchase in "Consultados recientemente" on Inicio.
function remember(tracking: Tracking) {
  const { type, id } = anchor.value;
  const code = tracking.documents[`${type}s` as keyof Tracking['documents']]?.find(doc => doc.id === id)?.code ?? processSummary(tracking.documents).split(' · ')[0];
  if (!code) return;
  const stageId = currentStageId(tracking.stages, tracking.nextStep);
  const stage = tracking.completed ? 'Completada' : tracking.stages.find(item => item.id === stageId)?.label ?? '';
  recordRecentDocument({ key: `tracking:${type}:${id}`, code, kind: KIND_LABEL[type] ?? 'Compra', stage, to: `/purchases/tracking/${type}/${id}`, anchor: { type, id } });
}

async function load(silent = false) {
  const companyId = activeCompanyId.value;
  if (!companyId || !validAnchor.value) { loading.value = false; notFound.value = !validAnchor.value; return; }
  const version = ++requestVersion;
  if (!silent) loading.value = true;
  error.value = ''; notFound.value = false;
  try {
    const response = await http.get(`/purchases/tracking/${anchor.value.type}/${anchor.value.id}`, { headers: { 'X-Company-Id': String(companyId) } });
    if (version !== requestVersion || companyId !== activeCompanyId.value) return;
    data.value = response.data.data;
    remember(response.data.data);
  } catch (caught: any) {
    if (version !== requestVersion) return;
    data.value = null;
    if (caught?.response?.status === 404) notFound.value = true;
    else error.value = getApiErrorMessage(caught, 'No se pudo cargar el seguimiento de la compra');
  } finally { if (version === requestVersion) loading.value = false; }
}

function open(step: TrackingStep) { void router.push(stepLocation(step)); }
const canOpen = (step: { route: string }) => canOpenRoute(step.route, can);

// Another person may have moved the purchase forward while this tab was in the background.
function refreshOnFocus() { if (document.visibilityState === 'visible' && data.value) void load(true); }
onMounted(() => { void load(); document.addEventListener('visibilitychange', refreshOnFocus); });
onBeforeUnmount(() => { requestVersion++; document.removeEventListener('visibilitychange', refreshOnFocus); });
watch(() => [route.params.type, route.params.id, activeCompanyId.value], () => { data.value = null; void load(); });
</script>

<template>
  <AdminLayout title="Seguimiento de compra">
    <div class="mx-auto max-w-[1440px] space-y-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight text-fg">Seguimiento de la compra</h1>
          <p class="mt-1 text-sm text-muted-fg">{{ data ? processSummary(data.documents) || 'Proceso de compra' : 'Revisa en qué etapa va la compra y qué sigue.' }}</p>
        </div>
        <AppButton variant="outline" :disabled="loading" @click="load()"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" aria-hidden="true" />Actualizar</AppButton>
      </header>

      <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>

      <div v-if="notFound || !validAnchor" class="rounded-[12px] border border-border bg-surface p-8 text-center">
        <h2 class="text-lg font-semibold text-fg">No encontramos esta compra</h2>
        <p class="mt-2 text-sm text-muted-fg">El documento no existe o pertenece a otra empresa. Abre el seguimiento desde una solicitud, orden o recepción.</p>
        <div class="mt-4 flex justify-center"><AppButton variant="outline" @click="router.push('/purchases')">Volver a Compras</AppButton></div>
      </div>

      <div v-else-if="loading && !data" class="space-y-4" aria-busy="true" aria-label="Cargando seguimiento">
        <div class="h-16 animate-pulse rounded-[12px] bg-surface-secondary" />
        <div class="h-44 animate-pulse rounded-[12px] bg-surface-secondary" />
        <div class="h-48 animate-pulse rounded-[12px] bg-surface-secondary" />
      </div>

      <template v-else-if="data">
        <!-- Blockers: something outside the purchase prevents it from moving forward. -->
        <div v-for="blocker in data.blockers" :key="blocker.label" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-fg">
          <span class="inline-flex items-center gap-2 font-medium"><TriangleAlert class="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />{{ blocker.label }}</span>
          <RouterLink v-if="canOpen(blocker)" :to="blocker.route" class="font-medium text-accent underline underline-offset-2">Resolver</RouterLink>
          <span v-else class="text-xs text-muted-fg">Le corresponde a {{ blocker.owner }}</span>
        </div>

        <!-- Next step: the one thing to do now. -->
        <section aria-labelledby="next-step-title">
          <div v-if="data.completed" class="flex items-start gap-3">
            <span class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-white"><Check class="h-4 w-4" aria-hidden="true" /></span>
            <div>
              <h2 id="next-step-title" class="text-base font-semibold text-fg">Compra completada</h2>
              <p class="mt-0.5 text-sm text-muted-fg">Todos los productos fueron recibidos, costeados y entregados a las sucursales.</p>
            </div>
          </div>
          <div v-else-if="data.nextStep" class="rounded-[12px] border border-border bg-surface p-5">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm text-muted-fg">Siguiente paso</p>
                <h2 id="next-step-title" class="mt-1 text-xl font-semibold text-fg">{{ data.nextStep.label }}</h2>
                <p class="mt-1 text-sm text-muted-fg">Le corresponde a <span class="font-medium text-fg">{{ data.nextStep.owner }}</span></p>
              </div>
              <div class="flex flex-col items-stretch gap-1 sm:items-end">
                <AppButton :disabled="!canOpen(data.nextStep)" @click="open(data.nextStep)">Ir a hacerlo</AppButton>
                <p v-if="!canOpen(data.nextStep)" class="flex items-center gap-1 text-xs text-muted-fg"><Lock class="h-3 w-3" aria-hidden="true" />No tienes acceso a esa pantalla; avisa a {{ data.nextStep.owner }}.</p>
              </div>
            </div>
            <div v-if="data.alsoAvailable.length" class="mt-4 border-t border-border pt-3">
              <p class="text-xs font-medium text-muted-fg">También se puede avanzar en paralelo</p>
              <ul class="mt-2 flex flex-wrap gap-2">
                <li v-for="step in data.alsoAvailable" :key="step.label + step.route">
                  <button type="button" :disabled="!canOpen(step)" class="inline-flex min-h-8 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1 text-left text-sm text-fg transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50" @click="open(step)">
                    <span>{{ step.label }}</span><span class="whitespace-nowrap text-xs text-muted-fg">· {{ step.owner }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div v-else>
            <h2 id="next-step-title" class="text-base font-semibold text-fg">Sin acciones pendientes</h2>
            <p class="mt-0.5 text-sm text-muted-fg">Esta compra está esperando que avance otra etapa.</p>
          </div>
        </section>

        <!-- Stages -->
        <section aria-labelledby="stages-title" class="rounded-[12px] border border-border bg-surface p-5">
          <h2 id="stages-title" class="text-base font-semibold text-fg">Etapas</h2>
          <ol class="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4" aria-label="Etapas de la compra">
            <li v-for="stage in data.stages" :key="stage.id" :aria-current="stage.id === activeStage && !data.completed ? 'step' : undefined" class="min-w-0">
              <div class="flex items-center gap-3">
                <component :is="stageIcon(stage.id)" class="h-6 w-6 shrink-0" :class="stage.id === activeStage && !data.completed ? 'text-accent' : 'text-muted-fg'" :stroke-width="1.5" aria-hidden="true" />
                <div class="min-w-0">
                  <p class="text-sm font-semibold" :class="stage.state === 'pending' || stage.state === 'skipped' ? 'text-muted-fg' : 'text-fg'">{{ stage.label }}</p>
                  <p class="text-sm text-muted-fg">{{ stage.owner }}</p>
                </div>
              </div>
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" :aria-valuenow="stage.progress && stage.state !== 'skipped' ? progressPercent(stage.progress) : stage.state === 'complete' ? 100 : 0" aria-valuemin="0" aria-valuemax="100" :aria-label="`Avance de ${stage.label}`">
                <div class="h-full rounded-full" :class="stage.state === 'complete' ? 'bg-success' : 'bg-accent'" :style="{ width: (stage.progress && stage.state !== 'skipped' ? progressPercent(stage.progress) : stage.state === 'complete' ? 100 : 0) + '%' }" />
              </div>
              <p class="mt-1.5 flex items-center justify-between gap-2 text-sm text-muted-fg"><span class="tabular-nums">{{ stage.progress && stage.progress.total > 0 && stage.state !== 'skipped' ? `${formatQuantity(stage.progress.done)} de ${formatQuantity(stage.progress.total)}` : '' }}</span><span>{{ stateLabel(stage.state) }}</span></p>
            </li>
          </ol>
        </section>

        <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <!-- Quantities per product -->
          <section aria-labelledby="products-title" class="min-w-0 overflow-hidden rounded-[12px] border border-border bg-surface">
            <h2 id="products-title" class="px-5 pt-5 text-base font-semibold text-fg">Productos</h2>
            <div v-if="!data.lines.length" class="px-5 pb-5 pt-3 text-sm text-muted-fg">Todavía no hay productos en esta compra.</div>
            <div v-else class="mt-3 overflow-x-auto">
              <table class="w-full min-w-[640px] text-left text-sm">
                <thead class="border-y border-border bg-surface-secondary text-xs text-muted-fg">
                  <tr>
                    <th scope="col" class="px-5 py-2.5 font-medium">Producto</th>
                    <th scope="col" class="px-3 py-2.5 text-right font-medium">Solicitado</th>
                    <th v-if="hasDecided" scope="col" class="px-3 py-2.5 text-right font-medium">A comprar</th>
                    <th scope="col" class="px-3 py-2.5 text-right font-medium">Comprado</th>
                    <th scope="col" class="px-3 py-2.5 text-right font-medium">Recibido</th>
                    <th scope="col" class="px-3 py-2.5 text-right font-medium">Despachado</th>
                    <th scope="col" class="px-5 py-2.5 text-right font-medium">Entregado</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="line in data.lines" :key="line.productId">
                    <th scope="row" class="px-5 py-3 font-medium text-fg">{{ line.name }}<span class="block text-xs font-normal text-muted-fg">{{ line.unit }}</span></th>
                    <td class="px-3 py-3 text-right tabular-nums">{{ formatQuantity(line.requested) }}</td>
                    <td v-if="hasDecided" class="px-3 py-3 text-right tabular-nums">{{ formatQuantity(line.decided) }}</td>
                    <td class="px-3 py-3 text-right tabular-nums">{{ formatQuantity(line.purchased) }}</td>
                    <td class="px-3 py-3 text-right tabular-nums">{{ formatQuantity(line.received) }}</td>
                    <td class="px-3 py-3 text-right tabular-nums">{{ formatQuantity(line.dispatched) }}</td>
                    <td class="px-5 py-3 text-right tabular-nums">{{ formatQuantity(line.delivered) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Related documents -->
          <section aria-labelledby="documents-title" class="min-w-0 rounded-[12px] border border-border bg-surface p-5">
            <h2 id="documents-title" class="text-base font-semibold text-fg">Documentos de esta compra</h2>
            <p v-if="!visibleGroups.length" class="mt-3 text-sm text-muted-fg">Aún no hay documentos.</p>
            <div v-for="group in visibleGroups" :key="group.key" class="mt-3 border-b border-border pb-3 last:border-b-0 last:pb-0">
              <h3 class="text-sm text-muted-fg">{{ group.label }}</h3>
              <ul class="mt-1 space-y-1">
                <li v-for="doc in group.docs" :key="group.key + doc.id" class="flex items-center justify-between gap-3">
                  <RouterLink :to="documentLocation(group.key, doc, data.documents)" class="min-w-0 truncate text-sm font-medium text-accent underline-offset-2 hover:underline">{{ doc.code }}</RouterLink>
                  <span class="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-fg"><span class="h-2 w-2 rounded-full" :class="statusDotClass(documentStatusVariant(doc.status))" aria-hidden="true" />{{ documentStatusLabel(doc.status) }}</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </template>
    </div>
  </AdminLayout>
</template>
