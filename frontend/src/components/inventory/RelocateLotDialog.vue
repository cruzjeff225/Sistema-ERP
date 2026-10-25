<script setup lang="ts">
import { computed, ref } from 'vue';
import { MoveRight } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import AppInput from '../base/AppInput.vue';
import AppDrawer from '../base/AppDrawer.vue';
import { inventoryPost } from '../../services/inventory.service';
import { getApiErrorMessage } from '../../utils/api-error';
import { quantity as format } from '../../utils/inventory-format';

const props = defineProps<{
  lot: { id: number; lotCode: string; productName: string };
  from: { id: number; code: string; warehouseName: string; available: number };
  destinations: { id: number; code: string }[];
}>();
const emit = defineEmits<{ close: []; moved: [] }>();

const toLocationId = ref(props.destinations.length === 1 ? props.destinations[0]!.id : 0);
const amount = ref(String(props.from.available)), reason = ref('');
const busy = ref(false), error = ref(''), requestId = crypto.randomUUID();
const options = computed(() => props.destinations.filter(space => space.id !== props.from.id));

async function submit() {
  if (busy.value) return;
  const value = Number(amount.value);
  if (!toLocationId.value) { error.value = 'Seleccione el espacio de destino'; return; }
  if (!Number.isSafeInteger(value) || value < 1 || value > props.from.available) { error.value = `Indique una cantidad entera entre 1 y ${format(props.from.available)}`; return; }
  if (reason.value.trim().length < 5) { error.value = 'Indique el motivo (mínimo 5 caracteres)'; return; }
  busy.value = true; error.value = '';
  try {
    await inventoryPost('relocations', { lotId: props.lot.id, fromLocationId: props.from.id, toLocationId: toLocationId.value, quantity: value, reason: reason.value.trim(), requestId });
    emit('moved'); emit('close');
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo mover el lote'); }
  finally { busy.value = false; }
}
</script>

<template>
  <AppDrawer label="Mover lote entre ubicaciones" size="sm" @close="!busy && emit('close')">
    <form class="flex h-full min-h-0 flex-col" @submit.prevent="submit">
      <header class="border-b border-border p-5 sm:p-6">
        <h2 class="text-lg font-semibold">Mover entre ubicaciones</h2>
        <p class="mt-1 text-sm text-muted-fg">Lote <strong class="text-fg">{{ lot.lotCode }}</strong> · {{ lot.productName }}</p>
      </header>
      <fieldset :disabled="busy" class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <p class="rounded-xl bg-surface-secondary p-4 text-sm">Desde <strong>{{ from.warehouseName }} · {{ from.code }}</strong> hay <strong class="tabular-nums">{{ format(from.available) }}</strong> unidades de este lote.</p>
        <label class="block text-sm font-medium">Espacio de destino (mismo almacén)
          <select v-model.number="toLocationId" required class="field-control"><option :value="0" disabled>Seleccionar espacio</option><option v-for="space in options" :key="space.id" :value="space.id">{{ space.code }}</option></select>
        </label>
        <p v-if="!options.length" class="text-sm text-muted-fg">Este almacén no tiene otros espacios activos. Para enviarlo a otro almacén use un traslado.</p>
        <AppInput v-model="amount" type="number" label="Cantidad a mover" min="1" :max="from.available" step="1" required />
        <AppInput v-model="reason" label="Motivo" placeholder="Por ejemplo: reacomodo del pasillo" minlength="5" maxlength="500" required />
        <p class="text-sm text-muted-fg">Solo cambia dónde está el lote: la cantidad total, el costo promedio y el valor del inventario no se modifican. Quedan registrados una salida y una entrada en el Kardex.</p>
      </fieldset>
      <footer class="flex justify-end gap-2 border-t border-border p-5">
        <AppButton type="button" variant="outline" :disabled="busy" @click="emit('close')">Cancelar</AppButton>
        <AppButton type="submit" :disabled="busy || !options.length"><MoveRight class="h-4 w-4" />{{ busy ? 'Moviendo…' : 'Mover' }}</AppButton>
      </footer>
    </form>
  </AppDrawer>
</template>
