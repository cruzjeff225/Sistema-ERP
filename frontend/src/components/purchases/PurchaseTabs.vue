<script setup lang="ts">
defineProps<{
  modelValue: string;
  items: Array<{ value: string; label: string; count?: number }>;
  label: string;
  disabled?: boolean;
}>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <nav :aria-label="label" class="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-surface-secondary p-1">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :aria-pressed="modelValue === item.value"
      :disabled="disabled"
      class="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      :class="modelValue === item.value ? 'bg-surface text-fg shadow-sm ring-1 ring-border/60' : 'text-muted-fg hover:bg-surface/60 hover:text-fg'"
      @click="$emit('update:modelValue', item.value)"
    >
      {{ item.label }}
      <span v-if="item.count !== undefined" class="rounded-md bg-surface-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-fg">{{ item.count }}</span>
    </button>
  </nav>
</template>
