<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { CircleCheck, RefreshCw } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import AppButton from '../components/base/AppButton.vue';
import { useMyPending } from '../composables/useMyPending';
import { processSummary, relativeTime, stepLocation, type ProcessRow } from '../utils/purchase-tracking';

type Filter = 'all' | 'mine' | 'parallel';

const { rows, loading, failed, visible, owners, items, waiting, load } = useMyPending();
const filter = ref<Filter>('all');

// "A cargo mío" and "En paralelo" come straight from the existing classification: the main step of a purchase vs. a step that runs beside it.
const filters = computed<{ id: Filter; label: string; count: number }[]>(() => [
  { id: 'all', label: 'Todos', count: items.value.length },
  { id: 'mine', label: 'A cargo mío', count: items.value.filter(item => !item.parallel).length },
  { id: 'parallel', label: 'En paralelo', count: items.value.filter(item => item.parallel).length },
]);
const shown = computed(() => items.value.filter(item => filter.value === 'all' || (filter.value === 'parallel') === item.parallel));
// The first available task keeps the emphasis (the list already comes ordered by priority).
const first = computed(() => items.value[0] ?? null);
// Only name the team on each row when the user acts for several (e.g. an administrator).
const manyTeams = computed(() => owners.value.length > 1);
const firstCode = (item: { row: ProcessRow }) => processSummary(item.row.documents).split(' · ')[0] ?? '';
const isFirst = (item: { row: ProcessRow }) => first.value?.row === item.row;
const waitingText = computed(() => `${waiting.value} ${waiting.value === 1 ? 'compra más en curso a cargo de otros equipos' : 'compras más en curso a cargo de otros equipos'}`);
const filterLabel = computed(() => filters.value.find(item => item.id === filter.value)?.label ?? '');
</script>

<template>
  <AdminLayout title="Mis pendientes">
    <div class="mx-auto w-full max-w-4xl">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-fg">Mis pendientes</h1>
          <p class="mt-1 text-sm text-muted-fg">Lo que necesita tu acción ahora.</p>
        </div>
        <div v-if="visible" class="flex flex-wrap gap-2">
          <AppButton variant="outline" :disabled="loading" @click="load"><RefreshCw class="h-4 w-4" :class="loading && 'animate-spin'" aria-hidden="true" />Actualizar</AppButton>
          <RouterLink to="/purchases/tracking" class="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary">Ver todas las compras</RouterLink>
        </div>
      </header>

      <p v-if="!visible" role="status" class="mt-6 rounded-[12px] border border-border bg-surface px-4 py-6 text-sm text-muted-fg">Tu cuenta no tiene acceso al seguimiento de compras.</p>

      <template v-else>
        <div role="group" aria-label="Filtrar pendientes" class="mt-5 inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface-secondary p-0.5">
          <button v-for="option in filters" :key="option.id" type="button" :aria-pressed="filter === option.id" :disabled="loading && !rows.length" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50" :class="filter === option.id ? 'bg-surface text-fg' : 'text-muted-fg hover:text-fg'" @click="filter = option.id">
            {{ option.label }}<span v-if="(!loading || rows.length) && !failed" class="text-xs tabular-nums text-muted-fg">{{ option.count }}</span>
          </button>
        </div>

        <p class="sr-only" aria-live="polite">{{ loading ? 'Cargando pendientes' : failed ? '' : `${shown.length} ${shown.length === 1 ? 'pendiente' : 'pendientes'} en ${filterLabel}` }}</p>

        <div v-if="loading && !rows.length" class="mt-4 overflow-hidden rounded-[12px] border border-border bg-surface" aria-busy="true" aria-label="Cargando pendientes">
          <div v-for="n in 4" :key="n" class="border-b border-border px-4 py-4 last:border-b-0 sm:px-5"><div class="h-4 w-2/3 animate-pulse rounded bg-surface-secondary" /><div class="mt-2.5 h-3 w-1/3 animate-pulse rounded bg-surface-secondary" /></div>
        </div>

        <div v-else-if="failed" role="alert" class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <p>No se pudieron cargar tus pendientes. Intenta de nuevo en un momento.</p>
          <AppButton variant="outline" :disabled="loading" @click="load">Reintentar</AppButton>
        </div>

        <div v-else-if="!items.length" class="mt-4 flex items-start gap-3 rounded-[12px] border border-dashed border-border bg-surface px-4 py-5 text-sm text-muted-fg">
          <CircleCheck class="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <p><span class="font-medium text-fg">Estás al día.</span> Cuando una compra necesite tu acción aparecerá aquí.</p>
        </div>

        <p v-else-if="!shown.length" class="mt-4 rounded-[12px] border border-dashed border-border bg-surface px-4 py-5 text-sm text-muted-fg">No tienes pendientes {{ filter === 'parallel' ? 'en paralelo' : 'a cargo tuyo' }} por ahora.</p>

        <ul v-else class="mt-4 overflow-hidden rounded-[12px] border border-border bg-surface">
          <li v-for="item in shown" :key="item.row.anchor.type + item.row.anchor.id" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5" :class="isFirst(item) && 'bg-accent-soft'">
            <div class="min-w-0 flex-1 basis-60">
              <p class="text-sm font-semibold text-fg">{{ item.step.label }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-fg">
                <span v-if="manyTeams" class="font-medium text-fg">{{ item.step.owner }}</span>
                <span v-if="!item.step.label.includes(firstCode(item))" class="font-medium text-fg/80">{{ firstCode(item) }}</span>
                <span v-if="item.row.currentStage">Etapa {{ item.row.currentStage.label }}</span>
                <span>{{ relativeTime(item.row.updatedAt) }}</span>
                <span v-if="item.parallel">En paralelo</span>
              </p>
            </div>
            <RouterLink :to="stepLocation(item.step)" class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors" :class="isFirst(item) ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'border border-border bg-surface text-fg hover:bg-surface-secondary'" :aria-label="`Ir a hacerlo: ${item.step.label}`">Ir a hacerlo</RouterLink>
          </li>
        </ul>

        <p v-if="waiting > 0 && !loading && !failed" class="mt-3 px-1 text-sm text-muted-fg">{{ waitingText }}</p>
      </template>
    </div>
  </AdminLayout>
</template>
