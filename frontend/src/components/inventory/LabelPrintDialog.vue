<script setup lang="ts">
import { computed, ref } from 'vue';
import { Printer } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import AppInput from '../base/AppInput.vue';
import AppDrawer from '../base/AppDrawer.vue';
import { inventoryPost } from '../../services/inventory.service';
import { getApiErrorMessage } from '../../utils/api-error';
import { printLotLabels, type LotLabel } from '../../utils/inventory-labels';

const props = defineProps<{ lot: { id: number; lotCode: string; productName: string; onHand: number; hasPrints: boolean; defaultCopies?: number } }>();
const emit = defineEmits<{ close: []; printed: [] }>();

const copies = ref(String(Math.max(1, Math.min(props.lot.defaultCopies ?? (props.lot.onHand || 1), 100))));
const reason = ref('');
const busy = ref(false), error = ref('');
const reprint = computed(() => props.lot.hasPrints);
const quantityOk = computed(() => Number.isInteger(Number(copies.value)) && Number(copies.value) >= 1 && Number(copies.value) <= 1000);

async function submit() {
  if (busy.value) return;
  if (!quantityOk.value) { error.value = 'Indique entre 1 y 1000 etiquetas'; return; }
  if (reprint.value && reason.value.trim().length < 5) { error.value = 'Indique el motivo de la reimpresión (mínimo 5 caracteres)'; return; }
  busy.value = true; error.value = '';
  try {
    const result = await inventoryPost<{ label: LotLabel; copies: number }>(`lots/${props.lot.id}/labels`, { quantity: Number(copies.value), ...(reprint.value ? { reprintReason: reason.value.trim() } : {}) });
    const problem = printLotLabels(result.data.label, result.data.copies);
    if (problem) { error.value = `La impresión quedó registrada, pero no se pudo abrir: ${problem}`; emit('printed'); return; }
    emit('printed'); emit('close');
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo registrar la impresión'); }
  finally { busy.value = false; }
}
</script>

<template>
  <AppDrawer label="Imprimir etiquetas de lote" size="sm" @close="!busy && emit('close')">
    <form class="flex h-full min-h-0 flex-col" @submit.prevent="submit">
      <header class="border-b border-border p-5 sm:p-6">
        <h2 class="text-lg font-semibold">{{ reprint ? 'Reimprimir etiquetas' : 'Imprimir etiquetas' }}</h2>
        <p class="mt-1 text-sm text-muted-fg">Lote <strong class="text-fg">{{ lot.lotCode }}</strong> · {{ lot.productName }}</p>
      </header>
      <fieldset :disabled="busy" class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <AppInput v-model="copies" type="number" label="Cantidad de etiquetas" min="1" max="1000" step="1" required />
        <AppInput v-if="reprint" v-model="reason" label="Motivo de la reimpresión" placeholder="Por ejemplo: etiqueta dañada o ilegible" minlength="5" maxlength="255" required />
        <p class="text-sm text-muted-fg">Cada etiqueta muestra el código de barras con el <strong>código interno</strong> del producto, el lote y la fecha de recepción. La impresión queda registrada en el historial del lote.</p>
      </fieldset>
      <footer class="flex justify-end gap-2 border-t border-border p-5">
        <AppButton type="button" variant="outline" :disabled="busy" @click="emit('close')">Cancelar</AppButton>
        <AppButton type="submit" :disabled="busy"><Printer class="h-4 w-4" />{{ busy ? 'Registrando…' : 'Imprimir' }}</AppButton>
      </footer>
    </form>
  </AppDrawer>
</template>
