<script setup lang="ts">
import type { Component } from 'vue';

// `pill` (default) is the segmented control used for periods and short filters; `underline` is for the sections of a document.
withDefaults(defineProps<{
  modelValue: string;
  items: Array<{ value: string; label: string; count?: number; icon?: Component }>;
  label: string;
  disabled?: boolean;
  variant?: 'pill' | 'underline';
}>(), { variant: 'pill' });
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <nav :aria-label="label" class="flex max-w-full flex-wrap" :class="variant === 'underline' ? 'gap-x-1 gap-y-0 overflow-x-auto overflow-y-hidden' : 'w-fit gap-1 rounded-xl bg-surface-secondary p-1'">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :aria-pressed="modelValue === item.value"
      :disabled="disabled"
      class="inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      :class="variant === 'underline'
        ? ['-mb-px min-h-11 whitespace-nowrap border-b-2 px-3', modelValue === item.value ? 'border-accent text-accent' : 'border-transparent text-muted-fg hover:border-border hover:text-fg']
        : ['min-h-9 rounded-lg px-3 py-2', modelValue === item.value ? 'bg-surface text-fg shadow-sm ring-1 ring-border/60' : 'text-muted-fg hover:bg-surface/60 hover:text-fg']"
      @click="$emit('update:modelValue', item.value)"
    >
      <component :is="item.icon" v-if="item.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
      {{ item.label }}
      <span v-if="item.count !== undefined" class="rounded-md bg-surface-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-fg">{{ item.count }}</span>
    </button>
  </nav>
</template>
