<script setup lang="ts">
import { computed } from 'vue';
import { Calculator, ClipboardList, FileSearch, List, ListChecks, PackageCheck, ShoppingCart, Truck } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import ModuleDirectory from '../components/modules/ModuleDirectory.vue';
import { purchasingGroups, visiblePurchasingSections } from '../config/purchasing.config';
import { usePermissions } from '../composables/usePermissions';
import { useMyPending } from '../composables/useMyPending';
import { myPendingRoute } from '../config/my-pending.config';

const { can } = usePermissions();
const icons = { tracking: List, requests: ClipboardList, quotations: FileSearch, orders: ShoppingCart, receipts: PackageCheck, retaceos: Calculator, suppliers: Truck };
const sections = computed(() => visiblePurchasingSections(can).map(section => ({ ...section, icon: icons[section.id] })));
// "Mis pendientes" sits first in the overview, with the number of purchases waiting on this user, and the group links to the full tracking list.
const pending = useMyPending();
const pendingSection = computed(() => pending.visible.value ? [{ id: 'my-pending', label: 'Mis pendientes', description: 'Lo que necesita tu acción ahora.', route: myPendingRoute, icon: ListChecks, badge: pending.loading.value && !pending.rows.value.length ? undefined : pending.items.value.length }] : []);
const groups = computed(() => purchasingGroups.map(group => ({
  ...group,
  sections: [...(group.id === 'overview' ? pendingSection.value : []), ...sections.value.filter(section => section.group === group.id)],
  ...(group.id === 'overview' && can('purchases.view') ? { action: { label: 'Ver todas las compras', route: '/purchases/tracking' } } : {}),
})).filter(group => group.sections.length));
const support = computed(() => sections.value.filter(section => section.group === 'support'));
</script>

<template>
  <AdminLayout title="Compras">
    <ModuleDirectory title="Compras" description="De la solicitud al producto recibido, con cada paso en su lugar." :groups="groups" :support="support" support-label="Directorio de proveedores" empty-message="Tu cuenta no tiene opciones de compras disponibles." />
  </AdminLayout>
</template>
