<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ChevronRight, ClipboardList, FileSearch, FileText, Layers, ListChecks, PackageCheck, RefreshCw, Search, TriangleAlert } from 'lucide-vue-next';
import type { Component } from 'vue';
import AdminLayout from '../layouts/AdminLayout.vue';
import AppButton from '../components/base/AppButton.vue';
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

// The icon says at a glance which stage a purchase is in.
const STAGE_ICONS: Record<string, Component> = { requests: ClipboardList, quantities: Layers, quotation: FileSearch, order: FileText, reception: PackageCheck };
const stageIcon = (row: ProcessRow) => STAGE_ICONS[row.currentStage?.id ?? ''] ?? ListChecks;
const percent = (row: ProcessRow) => progressPercent({ done: row.stagesDone, total: row.stagesTotal });
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
    <div class="mx-auto max-w-[1440px] space-y-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight text-fg">Seguimiento de compras</h1>
          <p class="mt-1 text-sm text-muted-fg">Cada compra con su etapa actual y lo que sigue. Entra a una para ver el detalle.</p>
        </div>
        <AppButton variant="outline" :disabled="loading" @click="load()"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" aria-hidden="true" />Actualizar</AppButton>
      </header>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="inline-flex rounded-lg bg-surface-secondary p-0.5" role="tablist" aria-label="Estado de las compras">
          <button v-for="option in PROCESS_SCOPES" :key="option.id" type="button" role="tab" :aria-selected="scope === option.id"
            class="h-8 rounded-md px-3 text-sm font-medium transition-colors" :class="scope === option.id ? 'bg-surface text-fg ring-1 ring-border' : 'text-muted-fg hover:text-fg'" @click="scope = option.id">{{ option.label }}</button>
        </div>
        <label class="relative block w-full sm:w-80">
          <span class="sr-only">Buscar por código de solicitud, orden o recepción</span>
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" />
          <input v-model="search" type="search" maxlength="60" placeholder="Buscar por código (PR-, OC-, RC-…)" class="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-muted-fg" />
        </label>
      </div>

      <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>

      <div v-if="loading && !rows.length" class="overflow-hidden rounded-[12px] border border-border bg-surface" aria-busy="true" aria-label="Cargando compras">
        <div v-for="n in 4" :key="n" class="border-b border-border px-4 py-4 last:border-b-0"><div class="h-4 w-1/3 animate-pulse rounded bg-surface-secondary" /><div class="mt-2.5 h-3 w-1/5 animate-pulse rounded bg-surface-secondary" /></div>
      </div>

      <div v-else-if="!rows.length && !error" class="rounded-[12px] border border-border bg-surface py-10 text-center"><p class="text-sm text-muted-fg">{{ emptyMessage }}</p></div>

      <div v-else-if="rows.length" class="overflow-hidden rounded-[12px] border border-border bg-surface">
        <div class="hidden border-b border-border px-5 py-3 text-sm font-semibold text-fg lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_minmax(0,1.5fr)_20px] lg:gap-5" aria-hidden="true"><span>Documentos</span><span>Etapa</span><span>A cargo de</span><span>Siguiente acción</span><span /></div>
        <ul aria-label="Compras" class="divide-y divide-border">
          <li v-for="row in rows" :key="row.anchor.type + row.anchor.id">
            <RouterLink :to="target(row)" class="block px-4 py-3.5 transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-5">
              <div class="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_minmax(0,1.5fr)_20px] lg:items-center lg:gap-5">
                <div class="min-w-0">
                  <p class="font-semibold text-fg">{{ processSummary(row.documents) || 'Compra sin documentos' }}</p>
                  <p class="mt-0.5 text-xs text-muted-fg">Actualizada {{ relativeTime(row.updatedAt) }}</p>
                </div>
                <div class="flex min-w-0 items-center gap-3">
                  <component :is="stageIcon(row)" class="h-5 w-5 shrink-0 text-muted-fg" :stroke-width="1.5" aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium" :class="row.completed ? 'text-success' : 'text-fg'">{{ row.completed ? 'Completada' : row.currentStage?.label ?? 'En espera' }}</p>
                    <div class="mt-1 flex items-center gap-2">
                      <div class="h-1.5 w-full max-w-36 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" :aria-valuenow="percent(row)" aria-valuemin="0" aria-valuemax="100" aria-label="Etapas completadas">
                        <div class="h-full rounded-full" :class="row.completed ? 'bg-success' : 'bg-muted-fg'" :style="{ width: percent(row) + '%' }" />
                      </div>
                      <span class="text-xs tabular-nums text-muted-fg">{{ row.stagesDone }} de {{ row.stagesTotal }}</span>
                    </div>
                  </div>
                </div>
                <p class="text-sm text-fg"><span class="text-muted-fg lg:hidden">A cargo de </span>{{ row.nextStep?.owner ?? '—' }}</p>
                <div class="min-w-0 text-sm">
                  <p v-if="row.nextStep" class="text-fg">{{ row.nextStep.label }}</p>
                  <p v-else class="text-muted-fg">{{ row.completed ? 'Sin pasos pendientes' : 'Esperando que avance otra etapa' }}</p>
                  <p v-if="row.blockers" class="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-fg"><TriangleAlert class="h-3.5 w-3.5 text-warning" aria-hidden="true" />Bloqueada</p>
                </div>
                <ChevronRight class="hidden h-4 w-4 text-muted-fg lg:block" aria-hidden="true" />
              </div>
            </RouterLink>
          </li>
        </ul>
      </div>
      <p v-if="rows.length >= 50 || truncated" class="text-center text-xs text-muted-fg">Se muestran las {{ rows.length }} más recientes. Usa la búsqueda para encontrar una compra anterior.</p>
    </div>
  </AdminLayout>
</template>
