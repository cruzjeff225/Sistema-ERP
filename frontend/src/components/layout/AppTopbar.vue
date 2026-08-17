<script setup lang="ts">
import { Menu, Moon, Sun } from "lucide-vue-next";
import { useThemeStore } from "../../stores/theme.store";

defineProps<{ title: string }>();
defineEmits<{ "toggle-sidebar": [] }>();

const themeStore = useThemeStore();
</script>

<template>
  <header class="relative z-20 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-surface/90 px-4 backdrop-blur sm:px-6">
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
        <p class="hidden text-[11px] font-semibold uppercase tracking-wide text-muted-fg sm:block">ERP Software</p>
        <p class="truncate text-sm font-semibold text-fg">{{ title }}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-fg transition-colors hover:bg-surface-secondary"
        title="Cambiar tema"
        @click="themeStore.toggle"
      >
        <Sun v-if="themeStore.theme === 'dark'" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>
