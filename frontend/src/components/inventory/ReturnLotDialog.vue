<script setup lang="ts">
import { computed, ref } from 'vue';
import { Undo2 } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import AppInput from '../base/AppInput.vue';
import AppDrawer from '../base/AppDrawer.vue';
import { inventoryPost } from '../../services/inventory.service';
import { getApiErrorMessage } from '../../utils/api-error';

const props = defineProps<{
  lot: { id: number; lotCode: string; productName: string; returnable: number };
  warehouses: { id: number; name: string; branch: { name: string }; locations: { id: number; code: string }[] }[];
}>();
const emit = defineEmits<{ close: []; returned: [] }>();

const warehouseId = ref(props.warehouses.length === 1 ? props.warehouses[0]!.id : 0), locationId = ref(0);
const amount = ref('1'), reason = ref('');
const busy = ref(false), error = ref(''), requestId = crypto.randomUUID();
const spaces = computed(() => props.warehouses.find(w => w.id === warehouseId.value)?.locations ?? []);

async function submit() {
  if (busy.value) return;
  const value = Number(amount.value);
  if (!locationId.value) { error.value = 'Seleccione el espacio donde queda el producto'; return; }
  if (!Number.isSafeInteger(value) || value < 1 || value > props.lot.returnable) { error.value = `Indique una cantidad entera entre 1 y ${props.lot.returnable}`; return; }
  if (reason.value.trim().length < 5) { error.value = 'Indique el motivo (mínimo 5 caracteres)'; return; }
  busy.value = true; error.value = '';
  try {
    await inventoryPost('returns', { lotId: props.lot.id, locationId: locationId.value, quantity: value, reason: reason.value.trim(), requestId });
    emit('returned'); emit('close');
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo registrar la devolución'); }
  finally { busy.value = false; }
}
</script>

<template>
  <AppDrawer label="Registrar devolución aceptada" size="sm" @close="!busy && emit('close')">
    <form class="flex h-full min-h-0 flex-col" @submit.prevent="submit">
      <header class="border-b border-border p-5 sm:p-6">
        <h2 class="text-lg font-semibold">Devolución aceptada</h2>
        <p class="mt-1 text-sm text-muted-fg">Lote <strong class="text-fg">{{ lot.lotCode }}</strong> · {{ lot.productName }}</p>
      </header>
      <fieldset :disabled="busy" class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <p class="rounded-xl bg-surface-secondary p-4 text-sm">Registre solo lo que ya recibió y revisó. Este lote puede reingresar hasta <strong class="tabular-nums">{{ lot.returnable }}</strong> unidades, que es lo que ya salió de él.</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="text-sm font-medium">Almacén<select v-model.number="warehouseId" required class="field-control" @change="locationId = 0"><option :value="0" disabled>Seleccionar almacén</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.branch.name }} · {{ w.name }}</option></select></label>
          <label class="text-sm font-medium">Espacio<select v-model.number="locationId" required class="field-control" :disabled="!spaces.length"><option :value="0" disabled>Seleccionar espacio</option><option v-for="space in spaces" :key="space.id" :value="space.id">{{ space.code }}</option></select></label>
        </div>
        <AppInput v-model="amount" type="number" label="Cantidad aceptada" min="1" :max="lot.returnable" step="1" required />
        <AppInput v-model="reason" label="Motivo y documento de origen" placeholder="Por ejemplo: devolución del cliente, venta 123" minlength="5" maxlength="500" required />
        <p class="text-sm text-muted-fg">Se registra una entrada de tipo devolución, valorada al costo del lote, que queda en el Kardex.</p>
      </fieldset>
      <footer class="flex justify-end gap-2 border-t border-border p-5">
        <AppButton type="button" variant="outline" :disabled="busy" @click="emit('close')">Cancelar</AppButton>
        <AppButton type="submit" :disabled="busy"><Undo2 class="h-4 w-4" />{{ busy ? 'Registrando…' : 'Registrar devolución' }}</AppButton>
      </footer>
    </form>
  </AppDrawer>
</template>
