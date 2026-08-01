<script setup lang="ts">
withDefaults(defineProps<{ padded?: boolean }>(), { padded: true });
</script>

<template>
    <div class="rounded-xl border border-border bg-surface shadow-subtle" :class="padded ? 'p-5' : ''">
        <slot />
    </div>
</template>