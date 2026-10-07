<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ModuleSectionNav from '../modules/ModuleSectionNav.vue';
import { salesGroups, salesRoute, visibleSalesSections } from '../../config/sales.config';
import { usePermissions } from '../../composables/usePermissions';

const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const sections = computed(() => visibleSalesSections(can));
const groups = computed(() => salesGroups.map(group => ({ label: group.label, sections: sections.value.filter(section => section.group === group.id) })).filter(group => group.sections.length));
async function navigate(destination: string) { if (destination !== route.path) await router.push(destination); }
</script>

<template>
  <ModuleSectionNav label="Ventas" :home-route="salesRoute" :selected-route="route.path" :groups="groups" :navigate="navigate" />
</template>
