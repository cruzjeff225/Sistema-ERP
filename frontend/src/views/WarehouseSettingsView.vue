<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import AdministrationNav from '../components/admin/AdministrationNav.vue';
import AppButton from '../components/base/AppButton.vue';
import PurchaseActionDialog from '../components/base/PurchaseActionDialog.vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from '../composables/usePermissions';
import { useUnsavedChanges } from '../composables/useUnsavedChanges';
import { getApiErrorMessage } from '../utils/api-error';

const { can } = usePermissions();
const general = ref<any>(null), warehouses = ref<any[]>([]), warehouseId = ref(0), originalId = ref(0);
const loading = ref(false), saving = ref(false), error = ref(''), success = ref('');
let version = 0, operation = 0, mounted = true;
const choices = computed(() => {
  const rows = warehouses.value.filter(w => w.isActive && !w.deletedAt && w.branch.isActive !== false && !w.branch.deletedAt);
  return general.value && !rows.some(w => w.id === general.value.id) ? [general.value, ...rows] : rows;
});
const dirty = computed(() => warehouseId.value !== originalId.value);
const { leaving, resolveLeave } = useUnsavedChanges(() => dirty.value, () => saving.value);
async function load() {
  const company = activeCompanyId.value, token = ++version;
  const current = () => mounted && token === version && company === activeCompanyId.value;
  general.value = null; warehouses.value = []; warehouseId.value = 0; originalId.value = 0; error.value = '';
  if (!company) { loading.value = false; return; }
  loading.value = true;
  const config = { headers: { 'X-Company-Id': String(company) } };
  try {
    const [settings, catalog] = await Promise.all([
      http.get('/supply/configuration', config),
      can('warehouses.view') ? http.get('/warehouses', config) : can('inventory.view') ? http.get('/inventory/catalogs', config) : Promise.resolve({ data: { data: [] } }),
    ]);
    if (!current()) return;
    general.value = settings.data.data.generalWarehouse;
    warehouses.value = Array.isArray(catalog.data.data) ? catalog.data.data : catalog.data.data.warehouses;
    warehouseId.value = general.value?.id ?? 0; originalId.value = warehouseId.value;
  } catch (e) { if (current()) error.value = getApiErrorMessage(e, 'No se pudo cargar el centro de recepción'); }
  finally { if (current()) loading.value = false; }
}
async function save() {
  if (saving.value || loading.value || !warehouseId.value || !dirty.value || !can('warehouses.update')) return;
  const company = activeCompanyId.value, token = ++operation, selected = warehouseId.value;
  const current = () => mounted && token === operation && company === activeCompanyId.value;
  saving.value = true; error.value = ''; success.value = '';
  try {
    await http.patch('/supply/configuration', { warehouseId: selected }, { headers: { 'X-Company-Id': String(company) } });
    if (!current()) return;
    originalId.value = selected;
    await load();
    if (current() && !error.value) success.value = 'Centro de recepción guardado.';
  } catch (e) { if (current()) error.value = getApiErrorMessage(e, 'No se pudo cambiar el centro de recepción'); }
  finally { if (current()) saving.value = false; }
}
watch(activeCompanyId, () => { ++operation; saving.value = false; success.value = ''; void load(); }, { immediate: true });
onBeforeUnmount(() => { mounted = false; ++version; ++operation; });
</script>

<template>
  <AdminLayout title="Centro de recepción de compras">
    <AdministrationNav section="warehouse" />
    <div class="mx-auto max-w-3xl space-y-6">
      <header><h1 class="text-3xl font-semibold tracking-tight">Centro de recepción</h1><p class="mt-3 max-w-xl text-sm leading-6 text-muted-fg">El almacén general recibe las compras. Desde allí se distribuyen a las sucursales.</p></header>
      <p v-if="error" role="alert" class="rounded-xl bg-danger-soft p-4 text-sm text-danger">{{ error }}</p>
      <p v-if="success" role="status" class="rounded-xl bg-success-soft p-4 text-sm">{{ success }}</p>
      <p v-if="loading" role="status" class="py-8 text-sm text-muted-fg">Cargando configuración…</p>
      <form v-else-if="can('warehouses.update') && choices.length" class="overflow-hidden rounded-2xl border border-border bg-surface" @submit.prevent="save">
        <div class="p-6 sm:p-8"><label class="block text-sm font-medium">Almacén general<select v-model.number="warehouseId" required :disabled="saving" class="field-control mt-3"><option :value="0" disabled>Seleccionar almacén</option><option v-for="warehouse in choices" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }} · {{ warehouse.branch.name }}</option></select></label><p v-if="!can('warehouses.view') && !can('inventory.view')" class="mt-3 text-xs text-muted-fg">Necesitas acceso a la consulta de almacenes para elegir otro centro.</p></div>
        <footer class="flex justify-end border-t border-border px-6 py-4"><AppButton type="submit" :disabled="saving || !warehouseId || !dirty">{{ saving ? 'Guardando…' : 'Guardar cambio' }}</AppButton></footer>
      </form>
      <p v-else-if="!error" class="text-sm text-muted-fg">No hay almacenes disponibles para esta empresa.</p>
      <RouterLink v-if="general && can('locations.view')" :to="{path:'/organization/locations',query:{warehouse:String(general.id),branch:String(general.branchId)}}" class="inline-block text-sm text-muted-fg hover:text-fg">Gestionar espacios del almacén general</RouterLink>
    </div>
    <PurchaseActionDialog v-if="leaving" title="Descartar cambio" description="El cambio del centro de recepción no se ha guardado." @close="resolveLeave(false)" @confirm="resolveLeave(true)" />
  </AdminLayout>
</template>
