<script setup lang="ts">
import { computed, ref } from "vue";
import { Building2, Check, ChevronDown, Menu, Moon, Sun } from "lucide-vue-next";
import { useThemeStore } from "../../stores/theme.store";
import { useAuthStore } from "../../stores/auth.store";
import { activeCompanyId, setActiveCompanyId } from "../../services/company-context";

defineProps<{ title: string }>();
defineEmits<{ "toggle-sidebar": [] }>();

const themeStore = useThemeStore();
const authStore = useAuthStore();
const companies = computed(() => authStore.user?.companies ?? []);
const activeCompany = computed(() => companies.value.find((company) => company.id === activeCompanyId.value) ?? companies.value[0] ?? null);
const companyMenuOpen = ref(false);

function changeCompany(companyId: number) {
  companyMenuOpen.value = false;
  if (!companyId || companyId === activeCompanyId.value) return;
  setActiveCompanyId(companyId);
  window.location.reload();
}
</script>

<template>
  <header class="relative z-20 flex h-[68px] shrink-0 items-center justify-between border-b border-border/70 bg-surface/95 px-4 backdrop-blur sm:px-6">
    <div class="flex min-w-0 items-center gap-3">
      <button
        type="button"
        class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg lg:hidden"
        title="Abrir menu"
        @click="$emit('toggle-sidebar')"
      >
        <Menu class="h-5 w-5" />
      </button>
      <div class="min-w-0">
        <p class="hidden text-xs font-medium text-muted-fg sm:block">ERP Software</p>
        <p class="truncate text-base font-semibold text-fg">{{ title }}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <div v-if="companies.length" class="relative">
        <button
          type="button"
          class="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left shadow-sm transition-colors hover:bg-surface-secondary"
          aria-label="Cambiar empresa activa"
          :aria-expanded="companyMenuOpen"
          @click="companyMenuOpen = !companyMenuOpen"
        >
          <Building2 class="h-4 w-4 shrink-0 text-accent" />
          <span class="hidden text-xs text-muted-fg lg:inline">Empresa</span>
          <span class="max-w-28 truncate text-sm font-medium text-fg sm:max-w-44">{{ activeCompany?.commercialName }}</span>
          <ChevronDown class="h-4 w-4 shrink-0 text-muted-fg" :class="companyMenuOpen && 'rotate-180'" />
        </button>
        <div v-if="companyMenuOpen" class="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl">
          <p class="px-3 py-2 text-xs font-medium text-muted-fg">Cambiar empresa</p>
          <button
            v-for="company in companies"
            :key="company.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-secondary"
            :class="company.id === activeCompanyId ? 'bg-accent-soft text-accent' : 'text-fg'"
            @click="changeCompany(company.id)"
          >
            <span class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-secondary text-xs font-semibold text-muted-fg">{{ company.commercialName.slice(0, 1).toUpperCase() }}</span>
            <span class="min-w-0 flex-1 truncate font-medium">{{ company.commercialName }}</span>
            <Check v-if="company.id === activeCompanyId" class="h-4 w-4 shrink-0" />
          </button>
        </div>
      </div>
      <button
        type="button"
        class="icon-button"
        title="Cambiar tema"
        @click="themeStore.toggle"
      >
        <Sun v-if="themeStore.theme === 'dark'" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>
