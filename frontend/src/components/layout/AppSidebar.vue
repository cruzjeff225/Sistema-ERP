<script setup lang="ts">
import { navigationGroups } from '../../config/navigation.config';
</script>

<template>
    <aside class="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar">
        <div class="flex items-center gap-3 px-5 py-5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-fg text-bg">
                <span class="text-sm font-bold">E</span>
            </div>
            <div>
                <p class="text-sm font-semibold leading-none text-fg">ERP Software</p>
                <p class="mt-0.5 text-xs text-muted-fg">v1.0</p>
            </div>
        </div>

        <nav class="flex-1 space-y-6 overflow-y-auto px-3 py-2">
            <div v-for="group in navigationGroups" :key="group.label">
                <p class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
                    {{ group.label }}
                </p>
                <div class="space-y-0.5">
                    <RouterLink v-for="item in group.items" :key="item.route" :to="item.route"
                        class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary"
                        active-class="!bg-sidebar-active !text-sidebar-active-fg">
                        <component :is="item.icon" class="h-4 w-4" />
                        {{ item.label }}
                    </RouterLink>
                </div>
            </div>
        </nav>

        <div class="border-t border-border p-3">
            <div class="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-secondary">
                <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                    A
                </div>
                <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-fg">Administrador</p>
                    <p class="truncate text-xs text-muted-fg">admin@erp.local</p>
                </div>
            </div>
        </div>
    </aside>
</template>