<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { RefreshCw, Search, TriangleAlert } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import PurchasesNav from '../components/purchases/PurchasesNav.vue';
import PurchaseSectionHeader from '../components/purchases/PurchaseSectionHeader.vue';
import AppBadge from '../components/base/AppBadge.vue';
import AppButton from '../components/base/AppButton.vue';
import AppCard from '../components/base/AppCard.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { getApiErrorMessage } from '../utils/api-error';
import { PROCESS_SCOPES, processSummary, progressPercent, relativeTime, type ProcessRow, type ProcessScope } from '../utils/purchase-tracking';

const scope = ref<ProcessScope>('open');
const search = ref('');
const rows = ref<ProcessRow[]>([]);
const total = ref(0);
const truncated = ref(false);
const loading = ref(false);
const error = ref('');
let version = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const hasFilters = computed(() => !!search.value.trim());

async function load() {
  const companyId = activeCompanyId.value;
  if (!companyId) return;
  const current = ++version;
  loading.value = true; error.value = '';
  try {
    const response = await http.get('/purchases/tracking/processes', { params: { scope: scope.value, search: search.value.trim() || undefined, limit: 50 }, headers: { 'X-Company-Id': String(companyId) } });
    if (current !== version || companyId !== activeCompanyId.value) return;
    rows.value = response.data.data.items; total.value = response.data.data.total; truncated.value = response.data.data.truncated;
  } catch (caught) {
    if (current === version) error.value = getApiErrorMessage(caught, 'No se pudo cargar el seguimiento de compras');
  } finally { if (current === version) loading.value = false; }
}

const target = (row: ProcessRow) => `/purchases/tracking/${row.anchor.type}/${row.anchor.id}`;
const emptyMessage = computed(() => hasFilters.value ? 'Ninguna compra coincide con la búsqueda.' : scope.value === 'open' ? 'No hay compras en curso.' : scope.value === 'done' ? 'Todavía no hay compras completadas.' : 'Aún no hay compras registradas.');

onMounted(() => void load());
onBeforeUnmount(() => { version++; clearTimeout(timer); });
watch([scope, activeCompanyId], () => void load());
// Search while typing, but wait for a pause so each keystroke does not hit the server.
watch(search, () => { clearTimeout(timer); timer = setTimeout(() => void load(), 300); });
</script>

<template>
  <AdminLayout title="Seguimiento de compras">
    <div class="mx-auto max-w-[1440px] space-y-6">
      <PurchasesNav />
      <PurchaseSectionHeader title="Seguimiento de compras" description="Cada compra con su etapa actual y lo que sigue. Entra a una para ver el detalle.">
        <template #actions>
          <AppButton variant="outline" :disabled="loading" @click="load()"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" aria-hidden="true" />Actualizar</AppButton>
        </template>
      </PurchaseSectionHeader>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="inline-flex rounded-lg bg-surface-secondary p-1" role="tablist" aria-label="Estado de las compras">
          <button v-for="option in PROCESS_SCOPES" :key="option.id" type="button" role="tab" :aria-selected="scope === option.id"
            class="min-h-8 rounded-md px-3 text-sm font-medium transition-colors" :class="scope === option.id ? 'bg-surface text-fg shadow-sm' : 'text-muted-fg hover:text-fg'" @click="scope = option.id">{{ option.label }}</button>
        </div>
        <label class="relative block w-full sm:w-80">
          <span class="sr-only">Buscar por código de solicitud, orden o recepción</span>
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" />
          <input v-model="search" type="search" maxlength="60" placeholder="Buscar por código (PR-, OC-, RC-…)" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-muted-fg" />
        </label>
      </div>

      <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>

      <div v-if="loading && !rows.length" class="space-y-3" aria-busy="true" aria-label="Cargando compras">
        <div v-for="n in 4" :key="n" class="h-20 animate-pulse rounded-lg bg-surface-secondary" />
      </div>

      <AppCard v-else-if="!rows.length && !error" class="py-10 text-center"><p class="text-sm text-muted-fg">{{ emptyMessage }}</p></AppCard>

      <ul v-else class="space-y-3" aria-label="Compras">
        <li v-for="row in rows" :key="row.anchor.type + row.anchor.id">
          <RouterLink :to="target(row)" class="block rounded-lg border border-border/80 bg-surface p-4 shadow-subtle transition-colors hover:border-accent/40 hover:bg-surface-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <div class="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
              <div class="min-w-0">
                <p class="truncate font-semibold text-fg">{{ processSummary(row.documents) || 'Compra sin documentos' }}</p>
                <p class="mt-0.5 text-xs text-muted-fg">Actualizada {{ relativeTime(row.updatedAt) }}</p>
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium" :class="row.completed ? 'text-success' : 'text-fg'">{{ row.completed ? 'Completada' : row.currentStage?.label ?? 'En espera' }}</p>
                <div class="mt-1.5 flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" :aria-valuenow="progressPercent({ done: row.stagesDone, total: row.stagesTotal })" aria-valuemin="0" aria-valuemax="100" aria-label="Etapas completadas">
                    <div class="h-full rounded-full" :class="row.completed ? 'bg-success' : 'bg-accent'" :style="{ width: progressPercent({ done: row.stagesDone, total: row.stagesTotal }) + '%' }" />
                  </div>
                  <span class="text-xs tabular-nums text-muted-fg">{{ row.stagesDone }} de {{ row.stagesTotal }}</span>
                </div>
              </div>
              <div class="min-w-0 text-sm">
                <template v-if="row.nextStep">
                  <p class="flex flex-wrap items-center gap-2"><AppBadge variant="info">{{ row.nextStep.owner }}</AppBadge><span v-if="row.blockers" class="inline-flex items-center gap-1 text-xs text-warning"><TriangleAlert class="h-3.5 w-3.5" aria-hidden="true" />Bloqueada</span></p>
                  <p class="mt-1 text-fg">{{ row.nextStep.label }}</p>
                </template>
                <p v-else class="text-muted-fg">{{ row.completed ? 'Sin pasos pendientes' : 'Esperando que avance otra etapa' }}</p>
              </div>
            </div>
          </RouterLink>
        </li>
      </ul>
      <p v-if="rows.length >= 50 || truncated" class="text-center text-xs text-muted-fg">Se muestran las {{ rows.length }} más recientes. Usa la búsqueda para encontrar una compra anterior.</p>
    </div>
  </AdminLayout>
</template>
