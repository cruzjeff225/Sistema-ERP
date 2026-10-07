<script setup lang="ts">
import BrandLogo from '../base/BrandLogo.vue';
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronDown, LogOut, Settings2, X } from "lucide-vue-next";
import { navigationGroups } from "../../config/navigation.config";
import { usePermissions } from "../../composables/usePermissions";
import { useAuthStore } from "../../stores/auth.store";
import { activeCompanyId } from "../../services/company-context";
import type { NavigationItem } from "../../config/navigation.config";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { can, canAny, currentUser } = usePermissions();

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const expanded = ref<Record<string, boolean>>({});
const company = computed(() => authStore.user?.companies?.find(item => item.id === activeCompanyId.value)?.commercialName ?? "Apex Roofing");
const isActive = (item: NavigationItem) => item.route === route.path || Boolean(item.activeRoutes?.includes(route.path)) || Boolean(item.sections?.some(section => section.route === route.path));
const isExpanded = (item: NavigationItem) => expanded.value[item.route] ?? isActive(item);
watch(() => route.path, () => { expanded.value = {}; });

const visibleGroups = computed(() =>
  navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.map(item => ({ ...item, sections: item.sections?.filter(section => can(section.permission)) }))
        .filter(item => item.permissionsAny ? canAny([...item.permissionsAny]) : item.permission === null || can(item.permission) || item.sections?.length)
        .map(item => ({ ...item, route: item.sections?.[0]?.route ?? item.route })),
    }))
    .filter((group) => group.items.length > 0),
);

const initials = computed(() => {
  const name = currentUser.value?.username ?? "";
  return name.slice(0, 1).toUpperCase() || "?";
});

async function handleLogout() {
  await authStore.logout();
  router.push({ name: "login" });
}
</script>

<template>
  <aside
    aria-label="Barra lateral"
    class="sidebar fixed inset-y-0 left-0 z-40 flex w-[280px] max-w-[calc(100vw-32px)] shrink-0 flex-col border-r border-border/70 bg-sidebar shadow-2xl transition-transform duration-200 ease-out lg:visible lg:static lg:z-auto lg:w-[272px] lg:translate-x-0 lg:shadow-none"
    :class="open ? 'visible translate-x-0' : 'invisible -translate-x-full'"
    @keydown.esc="emit('close')"
  >
    <div class="flex h-[68px] shrink-0 items-center gap-3 border-b border-border/70 px-5">
        <BrandLogo compact />
        <div class="min-w-0 flex-1">
          <p v-if="authStore.user?.companies && authStore.user.companies.length > 1" class="truncate text-sm font-semibold leading-tight text-fg" :title="company">{{ company }}</p>
          <p class="mt-0.5 text-xs text-muted-fg">Gestión empresarial</p>
        </div>
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg lg:hidden"
          title="Cerrar menú"
          aria-label="Cerrar menú"
          @click="emit('close')"
        >
          <X class="h-5 w-5" />
        </button>
    </div>

    <nav aria-label="Navegación principal" class="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4">
      <div v-for="group in visibleGroups" :key="group.label">
        <p v-if="group.items.length > 1 || group.label !== group.items[0]?.label" class="px-3 pb-1.5 text-[11px] font-semibold uppercase text-muted-fg">
          {{ group.label }}
        </p>
        <div class="space-y-0.5">
         <div v-for="item in group.items" :key="item.route">
          <div class="flex items-center rounded-lg transition-colors" :class="isActive(item) ? 'bg-sidebar-active text-sidebar-active-fg' : 'text-muted-fg hover:bg-surface-secondary hover:text-fg'">
           <RouterLink
            :to="item.route"
            class="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            @click="emit('close')"
          >
            <component :is="item.icon" class="h-[18px] w-[18px] shrink-0" />
            <span class="min-w-0 leading-5">{{ item.label }}</span>
          </RouterLink>
          <button v-if="item.sections?.length" type="button" class="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-surface/60" :aria-expanded="isExpanded(item)" :aria-controls="`sections-${item.route.split('/').pop()}`" :aria-label="`${isExpanded(item) ? 'Contraer' : 'Expandir'} ${item.label}`" :title="`${isExpanded(item) ? 'Contraer' : 'Expandir'} ${item.label}`" @click="expanded[item.route] = !isExpanded(item)">
            <ChevronDown class="h-4 w-4 transition-transform" :class="isExpanded(item) ? 'rotate-180' : ''" />
          </button>
          </div>
          <div v-if="item.sections?.length" v-show="isExpanded(item)" :id="`sections-${item.route.split('/').pop()}`" class="mb-2 ml-[21px] mt-1 space-y-0.5 border-l border-border pl-3">
            <RouterLink v-for="section in item.sections" :key="section.route" :to="section.route" class="flex min-h-9 items-center rounded-md px-2.5 py-1.5 text-xs leading-5 text-muted-fg transition-colors hover:bg-surface-secondary hover:text-fg" exact-active-class="!text-sidebar-active-fg !bg-sidebar-active font-semibold" @click="emit('close')">{{ section.label }}</RouterLink>
          </div>
         </div>
        </div>
      </div>
    </nav>

    <div class="shrink-0 border-t border-border/70 bg-sidebar p-3">
      <div class="flex items-center gap-2.5 px-2 py-2">
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {{ initials }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-fg">{{ currentUser?.username }}</p>
          <p class="truncate text-xs text-muted-fg">{{ currentUser?.email }}</p>
        </div>
        <RouterLink to="/account/security" class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg" title="Seguridad de mi cuenta" aria-label="Seguridad de mi cuenta" @click="emit('close')"><Settings2 class="h-4 w-4" /></RouterLink>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-fg transition-colors hover:bg-surface hover:text-fg"
          title="Cerrar sesion"
          aria-label="Cerrar sesión"
          @click="handleLogout"
        >
          <LogOut class="h-4 w-4" />
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar :is(a, button):focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  .sidebar, .sidebar * { transition: none; }
}
</style>
