<script setup lang="ts">
import { computed } from 'vue';
import { Boxes, Building2, FolderTree, MapPin, Package, Tags, Truck, Warehouse } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import ModuleDirectory from '../components/modules/ModuleDirectory.vue';
import { operationsGroups, visibleOperationsSections } from '../config/operations.config';
import { usePermissions } from '../composables/usePermissions';

const { can } = usePermissions();
const icons = { inventory: Boxes, warehouse: Truck, products: Package, company: Building2, branches: FolderTree, warehouses: Warehouse, locations: MapPin, categories: Tags };
const sections = computed(() => visibleOperationsSections(can).map(section => ({ ...section, icon: icons[section.id] })));
const groups = computed(() => operationsGroups.map(group => ({ ...group, sections: sections.value.filter(section => section.group === group.id) })).filter(group => group.sections.length));
const support = computed(() => sections.value.filter(section => section.group === 'support'));
</script>

<template>
  <AdminLayout title="Operaciones">
    <ModuleDirectory title="Operaciones" description="Tus productos, sus existencias y cada espacio de trabajo." :groups="groups" :support="support" empty-message="Tu cuenta no tiene opciones de operaciones disponibles." />
  </AdminLayout>
</template>
