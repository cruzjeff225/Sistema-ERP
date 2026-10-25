<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Boxes, Building2, ClipboardCheck, ClipboardList, Clock, ListChecks, Moon, Package, PackageCheck, Sun, Tag, Users } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import { usePermissions } from '../composables/usePermissions';
import { useMyPending } from '../composables/useMyPending';
import { useRecentDocuments, type RecentDocument } from '../composables/useRecentDocuments';
import { relativeTime } from '../utils/purchase-tracking';
import { myPendingRoute } from '../config/my-pending.config';
import { purchasingPermissions, purchasingRoute, purchasingSections } from '../config/purchasing.config';
import { operationsSections } from '../config/operations.config';
import { salesSections } from '../config/sales.config';

const { currentUser, can, canAny } = usePermissions();
const { items: pending, rows: processes, loading: pendingLoading, failed: pendingFailed, visible: pendingVisible } = useMyPending();
const { items: recent } = useRecentDocuments(3);
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => now.value = new Date(), 60000); });
onBeforeUnmount(() => clearInterval(timer));
const displayName = computed(() => (currentUser.value?.employee?.fullName || currentUser.value?.username || '').split(' ')[0]);
const hour = computed(() => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(now.value)));
const greeting = computed(() => hour.value < 12 ? 'Buenos días' : hour.value < 18 ? 'Buenas tardes' : 'Buenas noches');
const isDay = computed(() => hour.value >= 6 && hour.value < 18);
const date = computed(() => { const text = new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/El_Salvador' }).format(now.value); return text.charAt(0).toUpperCase() + text.slice(1); });
const time = computed(() => new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' }).format(now.value));

// Routes and permissions come from each module's own config, so the shortcuts never drift from the menu.
const section = <T extends { id: string; route: string; permission: string }>(list: readonly T[], id: string) => list.find(item => item.id === id)!;
const shortcuts = computed(() => [
  { name: 'Solicitudes de compra', icon: ClipboardList, section: section(purchasingSections, 'requests') },
  { name: 'Seguimiento de compras', icon: ListChecks, section: section(purchasingSections, 'tracking') },
  { name: 'Recepciones de compra', icon: PackageCheck, section: section(purchasingSections, 'receipts') },
  { name: 'Bodega', icon: Boxes, section: section(operationsSections, 'warehouse') },
  { name: 'Productos', icon: Tag, section: section(operationsSections, 'products') },
  { name: 'Clientes', icon: Users, section: section(salesSections, 'customers') },
].filter(item => can(item.section.permission)).map(item => ({ name: item.name, icon: item.icon, route: item.section.route, detail: '' })));
const destinations = computed(() => [
  { name: 'Gestionar compras', detail: 'Solicitudes, cotizaciones y órdenes.', icon: ClipboardCheck, route: canAny(purchasingPermissions) ? purchasingRoute : null },
  { name: 'Inventario', detail: 'Cada recurso, en su lugar.', icon: Package, route: can('inventory.view') ? '/inventory' : null },
  { name: 'Organización', detail: 'El equipo y sus espacios.', icon: Building2, route: can('companies.view') ? '/organization' : can('branches.view') ? '/organization/branches' : null },
].filter(d => d.route) as { name: string; detail: string; icon: typeof Package; route: string }[]);
const quickAccess = computed(() => [...shortcuts.value, ...destinations.value]);

// The live stage of the purchase when it is still in progress; otherwise the one saved when it was opened.
const stageOf = (doc: RecentDocument) => processes.value.find(row => doc.anchor && row.anchor.type === doc.anchor.type && row.anchor.id === doc.anchor.id)?.currentStage?.label || doc.stage || '—';
const showRecent = computed(() => canAny(purchasingPermissions));

const pendingText = computed(() => pendingLoading.value || pendingFailed.value ? 'Mis pendientes' : `${pending.value.length} ${pending.value.length === 1 ? 'pendiente' : 'pendientes'}`);
const pendingLabel = computed(() => pendingLoading.value || pendingFailed.value ? 'Mis pendientes' : `Mis pendientes: ${pending.value.length}`);
</script>
<template>
 <AdminLayout title="Inicio">
  <div class="mx-auto w-full max-w-6xl">
   <section class="grid min-h-[220px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-[12px] border border-border bg-surface px-5 sm:px-8 lg:h-[240px]" aria-labelledby="welcome-title">
    <div class="min-w-0 py-6">
     <h1 id="welcome-title" class="text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-4xl">{{ greeting }}<span v-if="displayName">, {{ displayName }}.</span><span v-else>.</span></h1>
     <p class="mt-2 text-sm text-muted-fg sm:text-base">Una nueva perspectiva para cada decisión.</p>
     <p class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular-nums text-muted-fg">
      <span class="inline-flex items-center gap-2 whitespace-nowrap"><Sun v-if="isDay" class="h-4 w-4" :stroke-width="1.5" aria-label="Día" /><Moon v-else class="h-4 w-4" :stroke-width="1.5" aria-label="Noche" />{{ time }}<span class="h-3 w-px bg-border" aria-hidden="true"></span>El Salvador</span>
      <span class="hidden items-center gap-3 sm:inline-flex"><span class="h-3 w-px bg-border" aria-hidden="true"></span>{{ date }}</span>
     </p>
    </div>
    <div class="welcome-art h-[130px] self-center text-fg sm:h-[210px]" aria-hidden="true">
     <svg viewBox="30 70 565 500" class="h-full w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="apex-wall" x1="250" y1="220" x2="480" y2="530" gradientUnits="userSpaceOnUse"><stop stop-color="currentColor" stop-opacity=".16"/><stop offset="1" stop-color="currentColor" stop-opacity=".02"/></linearGradient><linearGradient id="apex-roof" x1="230" y1="130" x2="485" y2="400" gradientUnits="userSpaceOnUse"><stop stop-color="#db3437"/><stop offset="1" stop-color="#af252a"/></linearGradient></defs>
      <circle cx="330" cy="290" r="224" class="art-orbit"/><circle cx="330" cy="290" r="174" class="art-orbit art-orbit-inner"/>
      <path d="M45 471L301 323L565 475M96 501L350 354M151 533L401 387M200 563L452 419" class="art-grid"/>
      <path d="M140 371L320 267L477 358L297 462L140 371Z" fill="url(#apex-wall)"/>
      <path d="M140 371V465L297 556V462L140 371ZM297 462L477 358V451L297 556V462Z" fill="url(#apex-wall)" class="art-building"/>
      <path d="M110 363L280 139L505 363L463 388L281 206L153 388L110 363Z" fill="url(#apex-roof)"/>
      <path d="M280 139L373 86L586 310L505 363L280 139Z" fill="url(#apex-roof)" opacity=".9"/>
      <path d="M153 388L281 206L463 388" class="art-outline"/>
      <path d="M328 458V499L365 478V437L328 458ZM378 429V470L415 449V408L378 429Z" fill="currentColor" opacity=".24"/>
      <path d="M185 421V462L220 482V441L185 421Z" fill="currentColor" opacity=".17"/>
     </svg>
    </div>
   </section>

   <section v-if="quickAccess.length || pendingVisible" class="mt-6" aria-labelledby="quick-title">
    <div class="mb-3 flex items-center justify-between gap-3">
     <h2 id="quick-title" class="text-base font-semibold text-fg">Accesos rápidos</h2>
     <p v-if="pendingVisible" aria-live="polite" class="text-[13px]">
      <RouterLink v-if="myPendingRoute" :to="myPendingRoute" :aria-label="pendingLabel" class="font-medium text-accent underline-offset-4 hover:underline">{{ pendingText }}</RouterLink>
      <span v-else class="font-medium text-muted-fg">{{ pendingText }}</span>
     </p>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
     <RouterLink v-for="item in quickAccess" :key="item.name" :to="item.route" class="flex min-h-14 items-center gap-4 rounded-[12px] border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/50 hover:bg-surface-secondary">
      <component :is="item.icon" class="h-5 w-5 shrink-0 text-muted-fg" :stroke-width="1.5" aria-hidden="true" />
      <span class="min-w-0"><span class="block text-sm font-medium text-fg">{{ item.name }}</span><span v-if="item.detail" class="mt-0.5 block text-xs text-muted-fg">{{ item.detail }}</span></span>
     </RouterLink>
    </div>
    <p v-if="!quickAccess.length" class="rounded-[12px] border border-dashed border-border px-4 py-5 text-sm text-muted-fg">Tu cuenta no tiene accesos disponibles por ahora.</p>
   </section>

   <section v-if="showRecent" class="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface" aria-labelledby="recent-title">
    <div class="flex items-center gap-3 px-4 pt-4 sm:px-5">
     <Clock class="h-5 w-5 shrink-0 text-muted-fg" :stroke-width="1.5" aria-hidden="true" />
     <div><h2 id="recent-title" class="text-base font-semibold leading-tight text-fg">Consultados recientemente</h2><p class="mt-0.5 text-xs text-muted-fg">Los últimos documentos que abriste en este equipo.</p></div>
    </div>
    <p v-if="!recent.length" class="px-4 pb-5 pt-4 text-sm text-muted-fg sm:px-5">Aún no has consultado documentos. Los que abras aparecerán aquí.</p>
    <div v-else class="mt-3 overflow-x-auto">
     <table class="w-full text-left text-sm">
      <thead><tr class="border-y border-border text-[11px] font-semibold uppercase tracking-wide text-muted-fg"><th scope="col" class="px-4 py-2 sm:pl-5">Código</th><th scope="col" class="hidden px-3 py-2 sm:table-cell">Tipo de documento</th><th scope="col" class="px-3 py-2">Estado actual</th><th scope="col" class="px-4 py-2 text-right sm:pr-5">Acción</th></tr></thead>
      <tbody class="divide-y divide-border">
       <tr v-for="doc in recent" :key="doc.key">
        <td class="px-4 py-2.5 font-medium text-fg sm:pl-5">{{ doc.code }}<span class="block text-xs font-normal text-muted-fg sm:hidden">{{ doc.kind }}</span></td>
        <td class="hidden px-3 py-2.5 text-fg sm:table-cell">{{ doc.kind }}<span class="ml-2 text-xs text-muted-fg">{{ relativeTime(doc.at) }}</span></td>
        <td class="px-3 py-2.5 text-fg">{{ stageOf(doc) }}</td>
        <td class="px-4 py-2.5 text-right sm:pr-5"><RouterLink :to="doc.to" :aria-label="`Abrir ${doc.kind} ${doc.code}`" class="font-medium text-accent underline-offset-4 hover:underline">Abrir</RouterLink></td>
       </tr>
      </tbody>
     </table>
    </div>
   </section>
  </div>
 </AdminLayout>
</template>
<style scoped>
.art-orbit { stroke:currentColor; stroke-opacity:.1; stroke-width:1; }
.art-orbit-inner { stroke-dasharray:2 8; }
.art-grid { stroke:currentColor; stroke-opacity:.16; stroke-width:1; }
.art-building { stroke:currentColor; stroke-opacity:.14; stroke-width:1; }
.art-outline { stroke:currentColor; stroke-opacity:.3; stroke-width:1.2; }
:global(.dark) .art-orbit { stroke-opacity:.26; }
:global(.dark) .art-grid { stroke-opacity:.34; }
:global(.dark) #apex-wall stop:first-child { stop-color:#ffffff; stop-opacity:.3; }
:global(.dark) #apex-wall stop:last-child { stop-color:#ffffff; stop-opacity:.06; }
:global(.dark) .art-building { stroke-opacity:.5; }
:global(.dark) .art-outline { stroke-opacity:.55; }
:global(.dark) #apex-roof stop:first-child { stop-color:#f04d50; }
:global(.dark) #apex-roof stop:last-child { stop-color:#cc3037; }
</style>
