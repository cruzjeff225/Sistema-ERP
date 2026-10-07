<script setup lang="ts">
withDefaults(
    defineProps<{
        variant?: 'primary' | 'outline' | 'ghost' | 'danger';
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
        class="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
        :class="[
            size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
            variant === 'primary' &&
            'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 dark:bg-[#c92a2d] dark:text-white dark:hover:bg-[#df3639] active:scale-[0.98]',
            variant === 'outline' &&
            'border border-border bg-surface text-fg hover:bg-surface-secondary active:scale-[0.98]',
            variant === 'ghost' && 'text-fg hover:bg-surface-secondary active:scale-[0.98]',
            variant === 'danger' && 'bg-danger text-white hover:bg-danger/90 active:scale-[0.98]',
        ]">
        <slot />
    </button>
</template>
