<script setup lang="ts">
withDefaults(
    defineProps<{
        variant?: 'success' | 'danger' | 'warning' | 'neutral';
    }>(),
    { variant: 'neutral' },
);
</script>

<template>
    <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" :class="[
        variant === 'success' && 'bg-success/10 text-success',
        variant === 'danger' && 'bg-danger/10 text-danger',
        variant === 'warning' && 'bg-warning/10 text-warning',
        variant === 'neutral' && 'bg-surface-secondary text-muted-fg',
    ]">
        <slot />
    </span>
</template>