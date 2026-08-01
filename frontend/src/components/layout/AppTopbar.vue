<script setup lang="ts">
import { Search, Sun, Moon, Bell } from 'lucide-vue-next';
import { useThemeStore } from '../../stores/theme.store';

defineProps<{ title: string }>();

const themeStore = useThemeStore();
</script>

<template>
    <header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
        <div class="flex items-center gap-2 text-sm text-muted-fg">
            <span>Dashboard</span>
            <span>/</span>
            <span class="font-medium text-fg">{{ title }}</span>
        </div>

        <div class="flex items-center gap-3">
            <div
                class="flex h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface-secondary px-3 text-sm text-muted-fg">
                <Search class="h-4 w-4" />
                <span class="flex-1">Buscar</span>
                <kbd class="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted-fg">
                    ⌘F
                </kbd>
            </div>

            <button type="button"
                class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-fg transition-colors hover:bg-surface-secondary"
                @click="themeStore.toggle">
                <Sun v-if="themeStore.theme === 'dark'" class="h-4 w-4" />
                <Moon v-else class="h-4 w-4" />
            </button>

            <button type="button"
                class="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-fg transition-colors hover:bg-surface-secondary">
                <Bell class="h-4 w-4" />
                <span class="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger" />
            </button>
        </div>
    </header>
</template>