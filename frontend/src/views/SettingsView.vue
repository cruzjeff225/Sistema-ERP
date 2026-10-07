<script setup lang="ts">
import { computed } from 'vue';
import { ClipboardList, KeyRound, ShieldCheck, Trash2, Users, Warehouse } from 'lucide-vue-next';
import AdminLayout from '../layouts/AdminLayout.vue';
import ModuleDirectory from '../components/modules/ModuleDirectory.vue';
import { administrationGroups, visibleAdministrationSections } from '../config/administration.config';
import { usePermissions } from '../composables/usePermissions';

const { can } = usePermissions();
const icons = { users: Users, roles: ShieldCheck, audit: ClipboardList, trash: Trash2, permissions: KeyRound, warehouse: Warehouse };
const sections = computed(() => visibleAdministrationSections(can).map(section => ({ ...section, icon: icons[section.id] })));
const groups = computed(() => administrationGroups.map(group => ({ ...group, sections: sections.value.filter(section => section.group === group.id) })).filter(group => group.sections.length));
const advanced = computed(() => sections.value.filter(section => section.group === 'advanced'));
</script>

<template>
  <AdminLayout title="Configuración">
    <ModuleDirectory title="Configuración" description="Administra tu equipo, sus accesos y la información del sistema." :groups="groups" :support="advanced" support-label="Opciones avanzadas" empty-message="Tu cuenta no tiene opciones de administración disponibles." />
  </AdminLayout>
</template>
