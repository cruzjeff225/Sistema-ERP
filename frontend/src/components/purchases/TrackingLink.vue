<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Route } from 'lucide-vue-next';
import { usePermissions } from '../../composables/usePermissions';
import type { TrackingType } from '../../utils/purchase-tracking';

defineProps<{ type: TrackingType; id: number }>();
const { can } = usePermissions();
</script>

<template>
  <RouterLink v-if="can('purchases.view')" :to="`/purchases/tracking/${type}/${id}`" class="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-fg transition-colors hover:bg-surface-secondary hover:text-accent">
    <Route class="h-3.5 w-3.5" aria-hidden="true" />Ver seguimiento
  </RouterLink>
</template>
