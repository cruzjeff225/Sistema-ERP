<script setup lang="ts">
withDefaults(
    defineProps<{
        variant?: 'primary' | 'outline' | 'ghost';
        size?: 'sm' | 'md';
        disabled?: boolean;
        type?: 'button' | 'submit';
    }>(),
    {
        variant: 'primary',
        size: 'md',
        disabled: false,
        type: 'button',
    },
);
</script>

<template>
    <button :type="type" :disabled="disabled"
        class="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
        :class="[
            size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
            variant === 'primary' &&
            'bg-accent text-accent-foreground hover:bg-accent/90',
            variant === 'outline' &&
            'border border-border bg-surface text-fg hover:bg-surface-secondary',
            variant === 'ghost' && 'text-fg hover:bg-surface-secondary',
        ]">
        <slot />
    </button>
</template>