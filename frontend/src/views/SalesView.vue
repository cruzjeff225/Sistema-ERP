<script setup lang="ts">
import { computed } from 'vue';
import { UsersRound } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import ModuleDirectory from '../components/modules/ModuleDirectory.vue';
import { salesGroups, visibleSalesSections } from '../config/sales.config';
import { usePermissions } from '../composables/usePermissions';

const { can } = usePermissions();
const sections = computed(() => visibleSalesSections(can).map(section => ({ ...section, icon: UsersRound })));
const groups = computed(() => salesGroups.map(group => ({ ...group, sections: sections.value.filter(section => section.group === group.id) })).filter(group => group.sections.length));
</script>

<template>
  <AdminLayout title="Ventas">
    <ModuleDirectory title="Ventas" description="El punto de partida para atender a tus clientes." :groups="groups" empty-message="Tu cuenta no tiene opciones de ventas disponibles." />
  </AdminLayout>
</template>
