<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>
<template>
  <div class="brand-logo" :class="compact ? 'brand-logo-compact' : ''">
    <img src="/brand/apex-roofing.jpg" alt="Apex Roofing" width="1080" height="1080" />
  </div>
</template>
<style scoped>
.brand-logo { position: relative; overflow: hidden; width: 240px; max-width: 100%; aspect-ratio: 1.7; background: white; border-radius: 12px; }
.brand-logo img { position: absolute; width: 100%; height: auto; max-width: none; top: -36%; left: 0; }
.brand-logo-compact { width: 82px; flex-shrink: 0; border-radius: 8px; }
</style>
