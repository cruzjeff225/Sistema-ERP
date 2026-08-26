<script setup lang="ts">
import { computed } from "vue";
import { Building2, Menu, Moon, Sun } from "lucide-vue-next";
import { useThemeStore } from "../../stores/theme.store";
import { useAuthStore } from "../../stores/auth.store";
import { activeCompanyId, setActiveCompanyId } from "../../services/company-context";

defineProps<{ title: string }>();
defineEmits<{ "toggle-sidebar": [] }>();

const themeStore = useThemeStore();
const authStore = useAuthStore();
const companies = computed(() => authStore.user?.companies ?? []);

function changeCompany(event: Event) {
  const companyId = Number((event.target as HTMLSelectElement).value);
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
      <label v-if="companies.length" class="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 shadow-sm">
        <Building2 class="h-4 w-4 shrink-0 text-accent" />
        <span class="hidden text-xs text-muted-fg lg:inline">Empresa</span>
        <select :value="activeCompanyId ?? ''" class="h-6 min-w-0 max-w-32 bg-transparent text-sm font-medium text-fg outline-none sm:max-w-44" aria-label="Empresa activa" @change="changeCompany">
          <option v-for="company in companies" :key="company.id" :value="company.id">{{ company.commercialName }}</option>
        </select>
      </label>
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
