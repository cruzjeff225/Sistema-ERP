<script setup lang="ts">
withDefaults(defineProps<{ padded?: boolean }>(), { padded: true });
</script>

<template>
    <div class="rounded-lg border border-border/80 bg-surface shadow-subtle" :class="padded ? 'p-5' : ''">
        <slot />
    </div>
</template>
