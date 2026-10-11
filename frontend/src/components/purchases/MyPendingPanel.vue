<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowRight, CircleCheck, ListChecks } from 'lucide-vue-next';
import { http } from '../../services/http.service';
import { activeCompanyId } from '../../services/company-context';
import { usePermissions } from '../../composables/usePermissions';
import { myOwners, pendingFor, waitingOnOthers } from '../../utils/my-pending';
import { processSummary, relativeTime, stepLocation, type ProcessRow } from '../../utils/purchase-tracking';

const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 4 });
const { can } = usePermissions();

const rows = ref<ProcessRow[]>([]);
const loading = ref(false);
const failed = ref(false);
let version = 0;

const visible = computed(() => can('purchases.view'));
const owners = computed(() => myOwners(can));
const items = computed(() => pendingFor(rows.value, owners.value, can));
const shown = computed(() => items.value.slice(0, props.limit));
const waiting = computed(() => waitingOnOthers(rows.value, items.value));
// Only name the team on each row when the user acts for several (e.g. an administrator).
const manyTeams = computed(() => owners.value.length > 1);
const firstCode = (item: { row: ProcessRow }) => processSummary(item.row.documents).split(' · ')[0] ?? '';

async function load() {
  const companyId = activeCompanyId.value;
  if (!companyId || !visible.value) return;
  const current = ++version;
  loading.value = true; failed.value = false;
  try {
    const response = await http.get('/purchases/tracking/processes', { params: { scope: 'open', limit: 50 }, headers: { 'X-Company-Id': String(companyId) } });
    if (current !== version || companyId !== activeCompanyId.value) return;
    rows.value = response.data.data.items;
  } catch {
    if (current === version) { rows.value = []; failed.value = true; }
  } finally { if (current === version) loading.value = false; }
}

onMounted(() => void load());
onBeforeUnmount(() => { version++; });
watch(activeCompanyId, () => void load());
</script>

<template>
  <section v-if="visible" aria-labelledby="my-pending-title" class="rounded-2xl border border-border/70 bg-surface px-5 py-4 sm:px-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><ListChecks class="h-4 w-4" aria-hidden="true" /></span>
        <div>
          <h2 id="my-pending-title" class="text-base font-semibold text-fg">Mis pendientes<span v-if="items.length" class="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{{ items.length }}</span></h2>
          <p class="text-sm text-muted-fg">Lo que necesita tu acción ahora.</p>
        </div>
      </div>
      <RouterLink to="/purchases/tracking" class="text-sm font-medium text-muted-fg transition-colors hover:text-fg">Ver todas las compras</RouterLink>
    </header>

    <div v-if="loading && !rows.length" class="mt-4 space-y-2" aria-busy="true" aria-label="Cargando pendientes">
      <div v-for="n in 3" :key="n" class="h-14 animate-pulse rounded-xl bg-surface-secondary" />
    </div>

    <p v-else-if="failed" role="alert" class="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">No se pudieron cargar tus pendientes. Intenta de nuevo en un momento.</p>

    <div v-else-if="!items.length" class="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-fg">
      <CircleCheck class="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
      <p><span class="font-medium text-fg">Estás al día.</span> Cuando una compra necesite tu acción aparecerá aquí.<span v-if="waiting > 0"> Hay {{ waiting }} {{ waiting === 1 ? 'compra en curso a cargo de otros equipos' : 'compras en curso a cargo de otros equipos' }}.</span></p>
    </div>

    <template v-else>
      <ul class="mt-3 divide-y divide-border/60">
        <li v-for="(item, index) in shown" :key="item.row.anchor.type + item.row.anchor.id" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 last:pb-0">
          <div class="min-w-0">
            <p class="font-medium text-fg">{{ item.step.label }}</p>
            <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-fg">
              <span v-if="manyTeams" class="rounded-full bg-surface-secondary px-2 py-0.5 font-medium text-fg">{{ item.step.owner }}</span>
              <span v-if="!item.step.label.includes(firstCode(item))" class="font-medium text-fg/80">{{ firstCode(item) }}</span>
              <span v-if="item.row.currentStage">Etapa {{ item.row.currentStage.label }}</span>
              <span>{{ relativeTime(item.row.updatedAt) }}</span>
              <span v-if="item.parallel" class="rounded-full border border-border px-2 py-0.5">En paralelo</span>
            </p>
          </div>
          <RouterLink :to="stepLocation(item.step)" class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors" :class="index === 0 && !item.parallel ? 'bg-accent text-accent-foreground hover:opacity-90' : 'border border-border text-fg hover:bg-surface-secondary'">Ir a hacerlo<ArrowRight class="h-4 w-4" aria-hidden="true" /></RouterLink>
        </li>
      </ul>
      <p v-if="items.length > shown.length || waiting > 0" class="mt-3 text-sm text-muted-fg">
        <RouterLink v-if="items.length > shown.length" to="/purchases/tracking" class="font-medium text-accent">{{ items.length - shown.length }} {{ items.length - shown.length === 1 ? 'pendiente más' : 'pendientes más' }} en Seguimiento</RouterLink>
        <span v-if="items.length > shown.length && waiting > 0"> · </span>
        <span v-if="waiting > 0">{{ waiting }} {{ waiting === 1 ? 'compra más' : 'compras más' }} en curso a cargo de otros equipos</span>
      </p>
    </template>
  </section>
</template>
