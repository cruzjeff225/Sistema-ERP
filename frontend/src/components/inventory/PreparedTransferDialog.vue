<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, Send, X } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import AppDrawer from '../base/AppDrawer.vue';
import AppInput from '../base/AppInput.vue';
import { http } from '../../services/http.service';
import { activeCompanyId } from '../../services/company-context';
import { inventoryPost } from '../../services/inventory.service';
import { getApiErrorMessage } from '../../utils/api-error';

type Vehicle = { id: number; code: string; warehouseId: number; vehicle: { plate: string; brand: string | null; model: string | null } | null };
const props = defineProps<{ mode: 'dispatch' | 'cancel'; transfer: { id: number; documentNumber: string; fromWarehouseId: number; vehicleLocationId: number | null }; vehicles: Vehicle[] }>();
const emit = defineEmits<{ close: []; done: [message: string] }>();

const known = ref<Vehicle[]>([...props.vehicles]);
const vehicleId = ref(props.transfer.vehicleLocationId ?? 0), notes = ref(''), reason = ref(''), plate = ref(''), adding = ref(false);
const busy = ref(false), error = ref('');
const available = computed(() => known.value.filter(item => item.warehouseId === props.transfer.fromWarehouseId));
const headers = () => ({ headers: { 'X-Company-Id': String(activeCompanyId.value) } });

async function addVehicle() {
  if (plate.value.trim().length < 3) { error.value = 'Indique la placa del vehículo'; return; }
  busy.value = true; error.value = '';
  try {
    const result = await inventoryPost<Vehicle & { vehicleId: number }>('vehicle-locations', { warehouseId: props.transfer.fromWarehouseId, plate: plate.value.trim() });
    const created: Vehicle = { id: result.data.id, code: result.data.code, warehouseId: props.transfer.fromWarehouseId, vehicle: { plate: plate.value.trim().toUpperCase(), brand: null, model: null } };
    if (!known.value.some(item => item.id === created.id)) known.value.push(created);
    vehicleId.value = created.id; plate.value = ''; adding.value = false;
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo registrar el vehículo'); }
  finally { busy.value = false; }
}

async function submit() {
  if (busy.value) return;
  if (props.mode === 'cancel' && reason.value.trim().length < 5) { error.value = 'Indique el motivo (mínimo 5 caracteres)'; return; }
  busy.value = true; error.value = '';
  try {
    if (props.mode === 'dispatch') {
      await http.post(`/supply/transfers/${props.transfer.id}/dispatch`, { ...(vehicleId.value ? { vehicleLocationId: vehicleId.value } : {}), ...(notes.value.trim() ? { notes: notes.value.trim() } : {}) }, headers());
      emit('done', 'Despacho confirmado. Los productos salieron del almacén y están en tránsito.');
    } else {
      await http.post(`/supply/transfers/${props.transfer.id}/cancel`, { reason: reason.value.trim() }, headers());
      emit('done', 'Preparación cancelada. Lo reservado volvió a quedar disponible en la solicitud.');
    }
    emit('close');
  } catch (caught) { error.value = getApiErrorMessage(caught, props.mode === 'dispatch' ? 'No se pudo confirmar el despacho' : 'No se pudo cancelar la preparación'); }
  finally { busy.value = false; }
}
</script>

<template>
  <AppDrawer :label="mode === 'dispatch' ? 'Confirmar despacho' : 'Cancelar preparación'" size="sm" @close="!busy && emit('close')">
    <form class="flex h-full min-h-0 flex-col" @submit.prevent="submit">
      <header class="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
        <div><h2 class="text-lg font-semibold">{{ mode === 'dispatch' ? 'Confirmar despacho' : 'Cancelar preparación' }}</h2><p class="mt-1 text-sm text-muted-fg">Traslado <strong class="text-fg">{{ transfer.documentNumber }}</strong></p></div>
        <button type="button" class="icon-button shrink-0" aria-label="Cerrar" :disabled="busy" @click="emit('close')"><X class="h-4 w-4" /></button>
      </header>
      <fieldset :disabled="busy" class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <template v-if="mode === 'dispatch'">
          <p class="rounded-xl bg-surface-secondary p-4 text-sm">Al confirmar, los productos salen del origen y quedan en tránsito hasta que la sucursal los reciba. Mientras tanto no se muestran disponibles para vender en destino.</p>
          <label class="block text-sm font-medium">Vehículo de tránsito (opcional)
            <select v-model.number="vehicleId" class="field-control"><option :value="0">Sin vehículo asignado</option><option v-for="item in available" :key="item.id" :value="item.id">{{ item.vehicle?.plate ?? item.code }}{{ item.vehicle?.brand ? ' · ' + item.vehicle.brand : '' }}</option></select>
          </label>
          <div v-if="adding" class="flex items-end gap-2"><AppInput v-model="plate" label="Placa del vehículo" maxlength="20" placeholder="P123-456" class="flex-1" /><AppButton type="button" variant="outline" :disabled="busy" @click="addVehicle">Guardar</AppButton></div>
          <button v-else type="button" class="inline-flex items-center gap-1 text-sm text-accent hover:underline" @click="adding = true"><Plus class="h-4 w-4" />Registrar otro vehículo</button>
          <AppInput v-model="notes" label="Notas del despacho (opcional)" maxlength="500" placeholder="Chofer, ruta u observaciones" />
        </template>
        <template v-else>
          <p class="rounded-xl bg-surface-secondary p-4 text-sm">La preparación todavía no movió existencias. Al cancelarla se libera lo reservado en la solicitud y queda el registro del traslado cancelado.</p>
          <AppInput v-model="reason" label="Motivo de la cancelación" minlength="5" maxlength="500" required />
        </template>
      </fieldset>
      <footer class="flex justify-end gap-2 border-t border-border p-5">
        <AppButton type="button" variant="outline" :disabled="busy" @click="emit('close')">Volver</AppButton>
        <AppButton type="submit" :variant="mode === 'cancel' ? 'danger' : undefined" :disabled="busy"><Send v-if="mode === 'dispatch'" class="h-4 w-4" />{{ busy ? 'Procesando…' : mode === 'dispatch' ? 'Confirmar despacho' : 'Cancelar preparación' }}</AppButton>
      </footer>
    </form>
  </AppDrawer>
</template>
