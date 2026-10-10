<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowRight, Check, Lock, Minus, RefreshCw, TriangleAlert } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import PurchasesNav from '../components/purchases/PurchasesNav.vue';
import PurchaseSectionHeader from '../components/purchases/PurchaseSectionHeader.vue';
import AppBadge from '../components/base/AppBadge.vue';
import AppButton from '../components/base/AppButton.vue';
import AppCard from '../components/base/AppCard.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { getApiErrorMessage } from '../utils/api-error';
import {
  canOpenRoute, currentStageId, DOCUMENT_GROUPS, documentLocation, documentStatusLabel, documentStatusVariant, formatQuantity, isTrackingType,
  processSummary, progressPercent, stateLabel, stateVariant, stepLocation, type Tracking, type TrackingStep,
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
const hasDecided = computed(() => data.value?.lines.some(line => line.decided !== null) ?? false);

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
    <div class="mx-auto max-w-[1440px] space-y-6">
      <PurchasesNav />
      <PurchaseSectionHeader title="Seguimiento de la compra" :description="data ? processSummary(data.documents) || 'Proceso de compra' : 'Revisa en qué etapa va la compra y qué sigue.'">
        <template #actions>
          <AppButton variant="outline" :disabled="loading" @click="load()"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" aria-hidden="true" />Actualizar</AppButton>
        </template>
      </PurchaseSectionHeader>

      <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>

      <AppCard v-if="notFound || !validAnchor" class="text-center">
        <h2 class="text-lg font-semibold text-fg">No encontramos esta compra</h2>
        <p class="mt-2 text-sm text-muted-fg">El documento no existe o pertenece a otra empresa. Abre el seguimiento desde una solicitud, orden o recepción.</p>
        <div class="mt-4 flex justify-center"><AppButton variant="outline" @click="router.push('/purchases')">Volver a Compras</AppButton></div>
      </AppCard>

      <div v-else-if="loading && !data" class="space-y-4" aria-busy="true" aria-label="Cargando seguimiento">
        <div class="h-32 animate-pulse rounded-lg bg-surface-secondary" />
        <div class="h-28 animate-pulse rounded-lg bg-surface-secondary" />
        <div class="h-48 animate-pulse rounded-lg bg-surface-secondary" />
      </div>

      <template v-else-if="data">
        <!-- Blockers: something outside the purchase prevents it from moving forward. -->
        <div v-for="blocker in data.blockers" :key="blocker.label" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <span class="inline-flex items-center gap-2 font-medium"><TriangleAlert class="h-4 w-4 shrink-0" aria-hidden="true" />{{ blocker.label }}</span>
          <RouterLink v-if="canOpen(blocker)" :to="blocker.route" class="font-medium underline underline-offset-2">Resolver</RouterLink>
          <span v-else class="text-xs">Le corresponde a {{ blocker.owner }}</span>
        </div>

        <!-- Next step: the one thing to do now. -->
        <AppCard :class="data.completed ? 'border-success/40' : 'border-accent/30'" aria-labelledby="next-step-title">
          <template v-if="data.completed">
            <div class="flex items-center gap-3">
              <span class="grid h-10 w-10 place-items-center rounded-full bg-success/15 text-success"><Check class="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="next-step-title" class="text-lg font-semibold text-fg">Compra completada</h2>
                <p class="text-sm text-muted-fg">Todos los productos fueron recibidos, costeados y entregados a las sucursales.</p>
              </div>
            </div>
          </template>
          <template v-else-if="data.nextStep">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-fg">Siguiente paso</p>
                <h2 id="next-step-title" class="mt-1 text-xl font-semibold text-fg">{{ data.nextStep.label }}</h2>
                <p class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-fg">Le corresponde a <AppBadge variant="info">{{ data.nextStep.owner }}</AppBadge></p>
              </div>
              <div class="flex flex-col items-stretch gap-1 sm:items-end">
                <AppButton :disabled="!canOpen(data.nextStep)" @click="open(data.nextStep)">Ir a hacerlo<ArrowRight class="h-4 w-4" aria-hidden="true" /></AppButton>
                <p v-if="!canOpen(data.nextStep)" class="flex items-center gap-1 text-xs text-muted-fg"><Lock class="h-3 w-3" aria-hidden="true" />No tienes acceso a esa pantalla; avisa a {{ data.nextStep.owner }}.</p>
              </div>
            </div>
            <div v-if="data.alsoAvailable.length" class="mt-4 border-t border-border/70 pt-3">
              <p class="text-xs font-medium text-muted-fg">También se puede avanzar en paralelo</p>
              <ul class="mt-2 flex flex-wrap gap-2">
                <li v-for="step in data.alsoAvailable" :key="step.label + step.route">
                  <button type="button" :disabled="!canOpen(step)" class="inline-flex min-h-8 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1 text-left text-sm text-fg transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50" @click="open(step)">
                    <span>{{ step.label }}</span><span class="whitespace-nowrap text-xs text-muted-fg">· {{ step.owner }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </template>
          <template v-else>
            <h2 id="next-step-title" class="text-lg font-semibold text-fg">Sin acciones pendientes</h2>
            <p class="mt-1 text-sm text-muted-fg">Esta compra está esperando que avance otra etapa.</p>
          </template>
        </AppCard>

        <!-- Timeline -->
        <AppCard :padded="false">
          <h2 class="px-5 pt-5 text-sm font-semibold text-fg">Etapas</h2>
          <ol class="grid grid-cols-1 gap-x-2 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="Etapas de la compra">
            <li v-for="(stage, index) in data.stages" :key="stage.id" :aria-current="stage.id === activeStage && !data.completed ? 'step' : undefined" class="relative flex gap-3 xl:flex-col xl:gap-2">
              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold"
                :class="[
                  stage.state === 'complete' && 'border-success bg-success text-white',
                  stage.state === 'in_progress' && 'border-accent bg-accent/10 text-accent',
                  stage.state === 'pending' && 'border-border bg-surface text-muted-fg',
                  stage.state === 'skipped' && 'border-dashed border-border bg-surface text-muted-fg',
                  stage.id === activeStage && !data.completed && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                ]">
                <Check v-if="stage.state === 'complete'" class="h-4 w-4" aria-hidden="true" />
                <Minus v-else-if="stage.state === 'skipped'" class="h-4 w-4" aria-hidden="true" />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium" :class="stage.state === 'pending' || stage.state === 'skipped' ? 'text-muted-fg' : 'text-fg'">{{ stage.label }}</p>
                <p class="text-xs text-muted-fg">{{ stage.owner }}</p>
                <AppBadge class="mt-1" :variant="stateVariant(stage.state)">{{ stateLabel(stage.state) }}</AppBadge>
                <div v-if="stage.progress && stage.state !== 'skipped'" class="mt-2">
                  <div class="h-1.5 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" :aria-valuenow="progressPercent(stage.progress)" aria-valuemin="0" aria-valuemax="100" :aria-label="`Avance de ${stage.label}`">
                    <div class="h-full rounded-full" :class="stage.state === 'complete' ? 'bg-success' : 'bg-accent'" :style="{ width: progressPercent(stage.progress) + '%' }" />
                  </div>
                  <p class="mt-1 text-xs tabular-nums text-muted-fg">{{ formatQuantity(stage.progress.done) }} de {{ formatQuantity(stage.progress.total) }}</p>
                </div>
              </div>
            </li>
          </ol>
        </AppCard>

        <div class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <!-- Quantities per product -->
          <AppCard :padded="false" class="min-w-0">
            <h2 class="px-5 pt-5 text-sm font-semibold text-fg">Productos</h2>
            <div v-if="!data.lines.length" class="px-5 pb-5 pt-3 text-sm text-muted-fg">Todavía no hay productos en esta compra.</div>
            <div v-else class="overflow-x-auto">
              <table class="mt-3 w-full min-w-[640px] text-left text-sm">
                <thead class="border-y border-border/70 bg-surface-secondary text-xs text-muted-fg">
                  <tr>
                    <th scope="col" class="px-5 py-2 font-medium">Producto</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Solicitado</th>
                    <th v-if="hasDecided" scope="col" class="px-3 py-2 text-right font-medium">A comprar</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Comprado</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Recibido</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Despachado</th>
                    <th scope="col" class="px-5 py-2 text-right font-medium">Entregado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in data.lines" :key="line.productId" class="border-b border-border/50 last:border-0">
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
          </AppCard>

          <!-- Related documents -->
          <AppCard class="min-w-0">
            <h2 class="text-sm font-semibold text-fg">Documentos de esta compra</h2>
            <p v-if="!visibleGroups.length" class="mt-3 text-sm text-muted-fg">Aún no hay documentos.</p>
            <div v-for="group in visibleGroups" :key="group.key" class="mt-4 first:mt-3">
              <h3 class="text-xs font-medium text-muted-fg">{{ group.label }}</h3>
              <ul class="mt-1 divide-y divide-border/50">
                <li v-for="doc in group.docs" :key="group.key + doc.id" class="flex items-center justify-between gap-3 py-2">
                  <RouterLink :to="documentLocation(group.key, doc, data.documents)" class="min-w-0 truncate text-sm font-medium text-accent hover:underline">{{ doc.code }}</RouterLink>
                  <AppBadge :variant="documentStatusVariant(doc.status)">{{ documentStatusLabel(doc.status) }}</AppBadge>
                </li>
              </ul>
            </div>
          </AppCard>
        </div>
      </template>
    </div>
  </AdminLayout>
</template>
