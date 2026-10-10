<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Route } from 'lucide-vue-next';
import { usePermissions } from '../../composables/usePermissions';
import type { TrackingType } from '../../utils/purchase-tracking';

defineProps<{ type: TrackingType; id: number }>();
const { can } = usePermissions();
</script>

<template>
  <RouterLink v-if="can('purchases.view')" :to="`/purchases/tracking/${type}/${id}`" class="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-surface-secondary">
    <Route class="h-3.5 w-3.5" aria-hidden="true" />Ver seguimiento
  </RouterLink>
</template>
