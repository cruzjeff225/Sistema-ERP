<script setup lang="ts">
import { computed } from 'vue';
import { Calculator, ClipboardList, FileSearch, GitCompareArrows, ListChecks, PackageCheck, ShoppingCart, Truck } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import ModuleDirectory from '../components/modules/ModuleDirectory.vue';
import { purchasingGroups, visiblePurchasingSections } from '../config/purchasing.config';
import { usePermissions } from '../composables/usePermissions';

const { can } = usePermissions();
const icons = { tracking: ListChecks, requests: ClipboardList, quotations: FileSearch, comparison: GitCompareArrows, orders: ShoppingCart, receipts: PackageCheck, retaceos: Calculator, suppliers: Truck };
const sections = computed(() => visiblePurchasingSections(can).map(section => ({ ...section, icon: icons[section.id] })));
const groups = computed(() => purchasingGroups.map(group => ({ ...group, sections: sections.value.filter(section => section.group === group.id) })).filter(group => group.sections.length));
const support = computed(() => sections.value.filter(section => section.group === 'support'));
</script>

<template>
  <AdminLayout title="Compras">
    <ModuleDirectory title="Compras" description="De la solicitud al producto recibido, con cada paso en su lugar." :groups="groups" :support="support" support-label="Directorio de proveedores" empty-message="Tu cuenta no tiene opciones de compras disponibles." />
  </AdminLayout>
</template>
