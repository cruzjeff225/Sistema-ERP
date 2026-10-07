<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-3xl font-semibold tracking-tight text-fg">{{ title }}</h1>
      <p v-if="description" class="mt-2 max-w-2xl text-sm leading-6 text-muted-fg">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
