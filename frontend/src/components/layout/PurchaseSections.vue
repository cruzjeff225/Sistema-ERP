<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { navigationGroups } from '../../config/navigation.config';
import { usePermissions } from '../../composables/usePermissions';
const route = useRoute();
const { can } = usePermissions();
const sections = computed(() => navigationGroups.flatMap(group => group.items).find(item => item.sections?.some(section => section.route === route.path))?.sections?.filter(section => can(section.permission)) ?? []);
</script>
<template>
  <nav v-if="sections.length" aria-label="Secciones del modulo de compras" class="mb-6 flex gap-5 overflow-x-auto border-b border-border">
    <RouterLink v-for="section in sections" :key="section.route" :to="section.route" class="shrink-0 border-b-2 border-transparent pb-3 text-sm font-medium text-muted-fg" active-class="!border-accent !text-accent">{{ section.label }}</RouterLink>
  </nav>
</template>
