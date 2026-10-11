<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Building2, ChevronDown, ChevronRight, LogOut, Menu, Moon, ShieldCheck, Sun } from "lucide-vue-next";
import { breadcrumbsFor } from "../../config/navigation.config";
import { usePermissions } from "../../composables/usePermissions";
import { useThemeStore } from "../../stores/theme.store";
import { useAuthStore } from "../../stores/auth.store";
import { activeCompanyId } from "../../services/company-context";

const props = defineProps<{ title: string }>();
defineEmits<{ "toggle-sidebar": [] }>();

const route = useRoute();
const router = useRouter();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const { currentUser } = usePermissions();
const companies = computed(() => authStore.user?.companies ?? []);
const activeCompany = computed(() => companies.value.find((company) => company.id === activeCompanyId.value) ?? companies.value[0] ?? null);
const crumbs = computed(() => breadcrumbsFor(route.path, props.title));
const displayName = computed(() => currentUser.value?.employee?.fullName || currentUser.value?.username || "");
const initial = computed(() => displayName.value.slice(0, 1).toUpperCase() || "?");

const menuOpen = ref(false);
const menu = ref<HTMLElement | null>(null);
const closeOnOutside = (event: MouseEvent) => { if (menuOpen.value && !menu.value?.contains(event.target as Node)) menuOpen.value = false; };
// Opening the menu puts the keyboard on its first entry; Esc closes it (see the template) and arrows move between entries.
async function openMenu() {
  menuOpen.value = true;
  await nextTick();
  menu.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}
function toggleMenu() { if (menuOpen.value) menuOpen.value = false; else void openMenu(); }
function moveInMenu(step: 1 | -1) {
  const items = Array.from(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  items[(index + step + items.length) % items.length].focus();
}
onMounted(() => document.addEventListener("click", closeOnOutside));
onBeforeUnmount(() => document.removeEventListener("click", closeOnOutside));

async function handleLogout() {
  menuOpen.value = false;
  await authStore.logout();
  router.push({ name: "login" });
}
</script>

<template>
  <header class="relative z-20 flex h-[68px] shrink-0 items-center justify-between border-b border-border/70 bg-surface/95 px-4 backdrop-blur sm:px-6">
    <div class="flex min-w-0 items-center gap-3">
      <button
        type="button"
        class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg lg:hidden"
        title="Abrir menu"
        aria-label="Abrir menú"
        @click="$emit('toggle-sidebar')"
      >
        <Menu class="h-5 w-5" />
      </button>
      <nav aria-label="Ruta de navegación" class="min-w-0">
        <ol class="flex min-w-0 items-center gap-1.5 text-sm">
          <li v-for="(crumb, index) in crumbs" :key="index" class="flex min-w-0 items-center gap-1.5" :class="index < crumbs.length - 1 ? 'max-sm:hidden' : ''">
            <ChevronRight v-if="index > 0" class="h-3.5 w-3.5 shrink-0 text-muted-fg" aria-hidden="true" />
            <RouterLink v-if="crumb.route" :to="crumb.route" class="truncate text-muted-fg transition-colors hover:text-fg">{{ crumb.label }}</RouterLink>
            <span v-else class="truncate font-semibold text-fg" aria-current="page">{{ crumb.label }}</span>
          </li>
        </ol>
      </nav>
    </div>

    <div class="flex items-center gap-1.5">
      <div v-if="activeCompany" class="flex min-w-0 items-center gap-2 px-2.5 py-1.5" aria-label="Empresa del ERP">
          <Building2 class="h-4 w-4 shrink-0 text-accent" />
          <span class="max-w-28 truncate text-sm font-medium text-fg sm:max-w-44">{{ activeCompany?.commercialName }}</span>
      </div>
      <button type="button" class="icon-button" title="Cambiar tema" aria-label="Cambiar tema" @click="themeStore.toggle">
        <Sun v-if="themeStore.theme === 'dark'" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </button>
      <div ref="menu" class="relative" @keydown.esc="menuOpen = false" @keydown.down.prevent="menuOpen && moveInMenu(1)" @keydown.up.prevent="menuOpen && moveInMenu(-1)">
        <button type="button" class="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 transition-colors hover:bg-surface-secondary" aria-haspopup="menu" :aria-expanded="menuOpen" aria-label="Menú de usuario" @click="toggleMenu" @keydown.down.prevent="openMenu">
          <span class="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{{ initial }}</span>
          <span class="hidden max-w-32 truncate text-sm font-medium text-fg md:block">{{ currentUser?.username }}</span>
          <ChevronDown class="h-3.5 w-3.5 text-muted-fg" aria-hidden="true" />
        </button>
        <div v-if="menuOpen" role="menu" class="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-float)]">
          <div class="px-3 py-2">
            <p class="truncate text-sm font-medium text-fg">{{ displayName }}</p>
            <p class="truncate text-xs text-muted-fg">{{ currentUser?.email }}</p>
          </div>
          <div class="my-1 border-t border-border/70" />
          <RouterLink to="/account/security" role="menuitem" class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-fg hover:bg-surface-secondary" @click="menuOpen = false"><ShieldCheck class="h-4 w-4 text-muted-fg" aria-hidden="true" />Seguridad de mi cuenta</RouterLink>
          <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface-secondary" @click="handleLogout"><LogOut class="h-4 w-4 text-muted-fg" aria-hidden="true" />Cerrar sesión</button>
        </div>
      </div>
    </div>
  </header>
</template>
