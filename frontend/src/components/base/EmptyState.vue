<script setup lang="ts">
import type { Component } from "vue";

// One look for "nothing here yet", loading and failed states, so every list says it the same way.
withDefaults(defineProps<{
    title: string;
    description?: string;
    icon?: Component;
    tone?: "empty" | "error";
    /** Fills a panel when true; otherwise sits inline inside a list. */
    padded?: boolean;
}>(), { tone: "empty", padded: true });
</script>

<template>
    <div class="flex flex-col items-center text-center" :class="padded ? 'px-6 py-10' : 'px-4 py-6'" :role="tone === 'error' ? 'alert' : 'status'">
        <span v-if="icon" class="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-secondary" :class="tone === 'error' ? 'text-danger' : 'text-muted-fg'"><component :is="icon" class="h-5 w-5" aria-hidden="true" /></span>
        <p class="text-sm font-medium" :class="tone === 'error' ? 'text-danger' : 'text-fg'">{{ title }}</p>
        <p v-if="description" class="mt-1 max-w-sm text-sm text-muted-fg">{{ description }}</p>
        <div v-if="$slots.default" class="mt-4 flex flex-wrap justify-center gap-2"><slot /></div>
    </div>
</template>
