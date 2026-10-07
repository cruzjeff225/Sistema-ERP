<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowUpRight, ClipboardCheck, Package, Building2, Sun, Moon } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import { usePermissions } from '../composables/usePermissions';
import { purchasingPermissions, purchasingRoute } from '../config/purchasing.config';
const { currentUser, can, canAny } = usePermissions();
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => now.value = new Date(), 60000); });
onBeforeUnmount(() => clearInterval(timer));
const displayName = computed(() => (currentUser.value?.employee?.fullName || currentUser.value?.username || '').split(' ')[0]);
const hour = computed(() => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(now.value)));
const greeting = computed(() => hour.value < 12 ? 'Buenos días' : hour.value < 18 ? 'Buenas tardes' : 'Buenas noches');
const date = computed(() => new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/El_Salvador' }).format(now.value));
const time = computed(() => new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' }).format(now.value));
const destinations = computed(() => [
 { name: 'Gestionar compras', detail: 'Solicitudes, cotizaciones y órdenes.', icon: ClipboardCheck, route: canAny(purchasingPermissions) ? purchasingRoute : null },
 { name: 'Inventario', detail: 'Cada recurso, en su lugar.', icon: Package, route: can('inventory.view') ? '/inventory' : null },
 { name: 'Organización', detail: 'El equipo y sus espacios.', icon: Building2, route: can('companies.view') ? '/organization' : can('branches.view') ? '/organization/branches' : null },
].filter(d => d.route));
</script>
<template>
 <AdminLayout title="Inicio">
  <div class="welcome">
   <div class="welcome-meta"><span class="welcome-company">Inicio</span><span class="welcome-date">{{ date }}</span></div>
   <section class="welcome-hero" aria-labelledby="welcome-title">
    <div class="welcome-copy">
     <p class="welcome-eyebrow"><span></span>SU ESPACIO DE GESTIÓN</p>
     <h1 id="welcome-title">{{ greeting }}<span v-if="displayName">,<br />{{ displayName }}.</span><span v-else>.</span></h1>
     <p class="welcome-description">Una nueva perspectiva<br />para cada decisión.</p>
     <div class="welcome-clock"><Sun v-if="hour >= 6 && hour < 18" :size="18" :stroke-width="1.3" /><Moon v-else :size="18" :stroke-width="1.3" /><span>{{ time }}</span><span class="clock-divider"></span><span>El Salvador</span></div>
    </div>
    <div class="welcome-art" aria-hidden="true">
     <svg viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <path d="M32 470H96M330 31V73M560 476H591" class="art-grid"/>
     </svg>
    </div>
    <div class="hero-footer"><span class="hero-edition">DIRECCIÓN & OPERACIONES</span></div>
   </section>
   <section v-if="destinations.length" class="welcome-destinations" aria-label="Accesos principales">
    <RouterLink v-for="(destination, index) in destinations" :key="destination.name" :to="destination.route!" class="destination" :class="{ 'destination-purchases': destination.name === 'Gestionar compras' }">
     <div class="destination-top"><component :is="destination.icon" :size="22" :stroke-width="1.4"/><ArrowUpRight :size="18" :stroke-width="1.5" class="destination-arrow"/></div>
     <div class="destination-bottom"><div><h2>{{ destination.name }}</h2><p>{{ destination.detail }}</p></div><span v-if="destination.name !== 'Gestionar compras'" class="destination-number">0{{ index + 1 }}</span></div>
    </RouterLink>
   </section>

  </div>
 </AdminLayout>
</template>
<style scoped>
.welcome { max-width: 1240px; margin: 0 auto; padding: 8px 0; }
.welcome-meta { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:0 4px 22px; font-size:12px; color:hsl(var(--muted-fg)); }
.welcome-company { font-weight:600; letter-spacing:.03em; }
.welcome-date { text-transform:capitalize; }
.welcome-hero { position:relative; overflow:hidden; display:grid; grid-template-columns:1fr 1fr; min-height:480px; border:1px solid hsl(var(--border) / .65); border-radius:24px; background:linear-gradient(125deg,#fff 0%,#f4f3f0 100%); color:#101f2b; }
.welcome-copy { position:relative; z-index:1; padding:58px 0 90px 52px; }
.welcome-eyebrow { display:flex; align-items:center; gap:10px; font-size:10px; font-weight:600; letter-spacing:.2em; color:#59616b; }
.welcome-eyebrow span { width:6px; height:6px; border-radius:50%; background:#d3292c; }
h1 { margin:32px 0 22px; font-size:clamp(36px,4vw,60px); line-height:1.09; letter-spacing:-.055em; font-weight:500; overflow-wrap:anywhere; }
.welcome-description { font-size:17px; line-height:1.7; color:#606772; font-weight:400; letter-spacing:-.01em; }
.welcome-clock { display:flex; align-items:center; gap:10px; margin-top:36px; font-size:12px; color:#646b73; font-variant-numeric:tabular-nums; }
.clock-divider { height:12px; width:1px; margin:0 4px; background:currentColor; opacity:.3; }
.welcome-art { position:relative; align-self:center; padding:10px 24px 52px 0; color:#142532; }
.welcome-art svg { display:block; width:100%; max-height:470px; }
.art-orbit { stroke:currentColor; stroke-opacity:.09; stroke-width:.7; }
.art-orbit-inner { stroke-dasharray:2 8; }
.art-grid { stroke:currentColor; stroke-opacity:.13; stroke-width:.75; }
.art-building { stroke:currentColor; stroke-opacity:.12; stroke-width:.8; }
.art-outline { stroke:currentColor; stroke-opacity:.28; stroke-width:1; }
.art-caption { display:flex; justify-content:flex-end; align-items:center; gap:10px; padding-right:28px; font-size:10px; letter-spacing:.22em; color:#636c75; }
.art-caption span:first-child { font-weight:700; color:#142532; font-size:14px; letter-spacing:.12em; }
.hero-footer { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; gap:16px; margin:0 32px; padding:20px 0; border-top:1px solid rgb(16 31 43 / .1); font-size:11px; color:#626a74; }
.hero-edition { font-size:9px; letter-spacing:.15em; }
.welcome-destinations { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:22px; }
.destination { display:block; border:1px solid hsl(var(--border) / .65); border-radius:18px; background:hsl(var(--surface)); padding:24px; transition:border-color .2s,transform .2s; }
.destination:hover { border-color:hsl(var(--accent) / .6); transform:translateY(-3px); }
.destination-purchases { border-color:hsl(var(--accent) / .25); background:linear-gradient(140deg,hsl(var(--surface)),hsl(var(--accent-soft) / .55)); }
.destination-purchases .destination-top > svg:first-child { box-sizing:content-box; padding:10px; border-radius:12px; background:hsl(var(--accent-soft)); color:hsl(var(--accent)); }
.destination-purchases .destination-bottom { margin-top:16px; }
.destination-top { display:flex; align-items:center; justify-content:space-between; color:hsl(var(--muted-fg)); }
.destination-arrow { opacity:.65; }
.destination:hover .destination-arrow { color:hsl(var(--accent)); opacity:1; }
.destination-bottom { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-top:26px; }
.destination h2 { font-size:16px; font-weight:500; letter-spacing:-.02em; }
.destination p { font-size:12px; color:hsl(var(--muted-fg)); margin-top:6px; line-height:1.5; }
.destination-number { font-size:11px; color:hsl(var(--muted-fg)); opacity:.6; font-variant-numeric:tabular-nums; }
.welcome-footer { display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:26px 4px 8px; font-size:10px; color:hsl(var(--muted-fg)); }
.welcome-footer span:first-child { letter-spacing:.18em; font-weight:600; }
:global(.dark) .welcome-hero { background:linear-gradient(125deg,#112131 0%,#0a141f 100%); border-color:#526476; color:#ffffff; box-shadow:0 16px 48px rgb(0 0 0 / .2); }
:global(.dark) .welcome-eyebrow, :global(.dark) .welcome-description, :global(.dark) .welcome-clock, :global(.dark) .hero-footer, :global(.dark) .art-caption { color:#d1d9e4; }
:global(.dark) .welcome-art, :global(.dark) .art-caption span:first-child { color:#ffffff; }
:global(.dark) .hero-footer { border-color:rgb(255 255 255 / .24); }
:global(.dark) .art-orbit { stroke-opacity:.26; }
:global(.dark) .art-grid { stroke-opacity:.36; }
:global(.dark) #apex-wall stop:first-child { stop-color:#ffffff; stop-opacity:.35; }
:global(.dark) #apex-wall stop:last-child { stop-color:#ffffff; stop-opacity:.08; }
:global(.dark) .art-building { stroke-opacity:.55; }
:global(.dark) .welcome-art path[opacity=".24"], :global(.dark) .welcome-art path[opacity=".17"] { opacity:.55; }
:global(.dark) .art-outline { stroke-opacity:.6; }
:global(.dark) #apex-roof stop:first-child { stop-color:#f04d50; }
:global(.dark) #apex-roof stop:last-child { stop-color:#cc3037; }
:global(.dark) .welcome-eyebrow span { background:#ff8285; }
:global(.dark) .destination { background:#222b37; border-color:#4c596b; }
:global(.dark) .destination-purchases { background:linear-gradient(140deg,#222b37,#30282f); border-color:#72545b; }
:global(.dark) .destination:hover { background:#293443; border-color:#ff8b8e; }
:global(.dark) .destination h2 { color:#f8fafc; }
:global(.dark) .destination p, :global(.dark) .destination-top, :global(.dark) .welcome-meta, :global(.dark) .welcome-footer { color:#cbd5e1; }
:global(.dark) .destination-number, :global(.dark) .destination-arrow { opacity:1; }
@media (max-width:900px) { .welcome-copy { padding:40px 0 85px 32px; } .welcome-hero { min-height:430px; } .welcome-art { padding-right:8px; } }
@media (max-width:600px) { .welcome-meta { align-items:flex-start; font-size:11px; } .welcome-date { text-align:right; } .welcome-hero { grid-template-columns:1fr; } .welcome-copy { padding:32px 28px 0; } h1 { margin:24px 0 18px; font-size:40px; } .welcome-description { font-size:15px; } .welcome-clock { margin-top:24px; } .welcome-art { width:85%; max-width:360px; justify-self:center; margin-top:0; padding:0 0 85px; } .art-caption { display:none; } .hero-footer { margin:0 24px; padding:18px 0; } .hero-edition { display:none; } .welcome-destinations { grid-template-columns:1fr; gap:10px; } .destination { padding:20px; } .destination-bottom { margin-top:16px; } .welcome-footer { font-size:9px; } }
@media (prefers-reduced-motion:reduce) { .destination { transition:none; } .destination:hover { transform:none; } }
</style>
