<script setup lang="ts">
import AdminLayout from '../layouts/AdminLayout.vue';
import AppCard from '../components/base/AppCard.vue';
</script>

<template>
    <AdminLayout title="Home">
        <h1 class="mb-6 text-2xl font-semibold text-fg">Dashboard</h1>

        <AppCard>
            <p class="text-sm text-muted-fg">
                Base del layout administrativo lista. Los módulos de Usuarios, Roles
                y Permisos se conectarán aquí en las próximas fases.
            </p>
        </AppCard>
    </AdminLayout>
</template>