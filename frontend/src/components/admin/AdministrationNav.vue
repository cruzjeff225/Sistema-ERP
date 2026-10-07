<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ModuleSectionNav from '../modules/ModuleSectionNav.vue';
import { administrationGroups, administrationRoute, visibleAdministrationSections, type AdministrationSectionId } from '../../config/administration.config';
import { usePermissions } from '../../composables/usePermissions';

const props = defineProps<{ section: AdministrationSectionId }>();
const router = useRouter();
const { can } = usePermissions();
const sections = computed(() => visibleAdministrationSections(can));
const selectedRoute = computed(() => sections.value.find(section => section.id === props.section)?.route ?? '');
const groups = computed(() => [
  ...administrationGroups.map(group => ({ label: group.label, sections: sections.value.filter(section => section.group === group.id) })),
  { label: 'Opciones avanzadas', sections: sections.value.filter(section => section.group === 'advanced') },
].filter(group => group.sections.length));

async function navigate(destination: string) {
  if (destination !== selectedRoute.value) await router.push(destination);
}
</script>

<template>
  <ModuleSectionNav label="Configuración" :home-route="administrationRoute" :selected-route="selectedRoute" :groups="groups" :navigate="navigate" />
</template>
