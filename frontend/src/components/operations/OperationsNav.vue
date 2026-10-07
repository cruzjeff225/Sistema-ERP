<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ModuleSectionNav from '../modules/ModuleSectionNav.vue';
import { operationsGroups, operationsRoute, operationsSectionQuery, visibleOperationsSections } from '../../config/operations.config';
import { usePermissions } from '../../composables/usePermissions';

const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const sections = computed(() => visibleOperationsSections(can));
const groups = computed(() => [
  ...operationsGroups.map(group => ({ label: group.label, sections: sections.value.filter(section => section.group === group.id) })),
  { label: 'Catálogos de apoyo', sections: sections.value.filter(section => section.group === 'support') },
].filter(group => group.sections.length));

async function navigate(destination: string) {
  if (destination !== route.path) {
    await router.push({ path: destination, query: operationsSectionQuery(route.path, destination, route.query) });
  }
}
</script>

<template>
  <ModuleSectionNav label="Operaciones" :home-route="operationsRoute" :selected-route="route.path" :groups="groups" :navigate="navigate" />
</template>
