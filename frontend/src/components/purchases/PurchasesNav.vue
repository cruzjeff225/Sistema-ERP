<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ModuleSectionNav from '../modules/ModuleSectionNav.vue';
import { purchasingGroups, purchasingRoute, purchasingSectionRoute, visiblePurchasingSections } from '../../config/purchasing.config';
import { usePermissions } from '../../composables/usePermissions';

const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const sections = computed(() => visiblePurchasingSections(can));
const groups = computed(() => [
  ...purchasingGroups.map(group => ({ label: group.label, sections: sections.value.filter(section => section.group === group.id) })),
  { label: 'Directorio de proveedores', sections: sections.value.filter(section => section.group === 'support') },
].filter(group => group.sections.length));
const selectedRoute = computed(() => purchasingSectionRoute(route.path));

async function navigate(destination: string) {
  if (destination !== route.path) await router.push(destination);
}
</script>

<template>
  <ModuleSectionNav label="Compras" :home-route="purchasingRoute" :selected-route="selectedRoute" :groups="groups" :navigate="navigate" />
</template>
