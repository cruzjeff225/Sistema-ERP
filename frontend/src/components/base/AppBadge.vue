<script setup lang="ts">
withDefaults(
    defineProps<{
        variant?: 'success' | 'danger' | 'warning' | 'neutral';
    }>(),
    { variant: 'neutral' },
);
</script>

<template>
    <span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium" :class="[
        variant === 'success' && 'border-success/20 bg-success/10 text-success',
        variant === 'danger' && 'border-danger/20 bg-danger/10 text-danger',
        variant === 'warning' && 'border-warning/20 bg-warning/10 text-warning',
        variant === 'neutral' && 'border-border bg-surface-secondary text-muted-fg',
    ]">
        <slot />
    </span>
</template>
