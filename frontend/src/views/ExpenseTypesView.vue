<script setup lang="ts">
import AdminLayout from '../layouts/AdminLayout.vue';
import PurchasesNav from '../components/purchases/PurchasesNav.vue';
import ExpenseTypesManager from '../components/purchases/ExpenseTypesManager.vue';
</script>
<template>
  <AdminLayout title="Tipos de gasto">
    <PurchasesNav />
    <ExpenseTypesManager />
  </AdminLayout>
</template>
