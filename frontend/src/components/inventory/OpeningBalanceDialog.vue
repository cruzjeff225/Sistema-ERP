<script setup lang="ts">
import { computed, ref } from 'vue';
import { PackagePlus, X } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import AppDrawer from '../base/AppDrawer.vue';
import AppInput from '../base/AppInput.vue';
import { inventoryPost } from '../../services/inventory.service';
import { getApiErrorMessage } from '../../utils/api-error';
import { money } from '../../utils/inventory-format';

const props = defineProps<{
  products: { id: number; name: string; sku: string; purchaseUnit: { name: string } }[];
  warehouses: { id: number; name: string; branch: { name: string }; locations: { id: number; code: string }[] }[];
}>();
const emit = defineEmits<{ close: []; saved: [message: string] }>();

const productId = ref(0), warehouseId = ref(props.warehouses.length === 1 ? props.warehouses[0]!.id : 0), locationId = ref(0);
const amount = ref(''), unitCost = ref(''), reason = ref('');
const busy = ref(false), error = ref(''), requestId = crypto.randomUUID();
const spaces = computed(() => props.warehouses.find(w => w.id === warehouseId.value)?.locations ?? []);
const unit = computed(() => props.products.find(p => p.id === productId.value)?.purchaseUnit.name ?? '');
const total = computed(() => Number(amount.value) > 0 && Number(unitCost.value) >= 0 ? Number(amount.value) * Number(unitCost.value) : null);

async function submit() {
  if (busy.value) return;
  const quantity = Number(amount.value), cost = Number(unitCost.value);
  if (!productId.value || !locationId.value) { error.value = 'Seleccione el producto y el espacio donde está'; return; }
  if (!Number.isSafeInteger(quantity) || quantity < 1) { error.value = 'La cantidad debe ser un número entero mayor que cero'; return; }
  if (unitCost.value === '' || !Number.isFinite(cost) || cost < 0 || Math.round(cost * 10000) / 10000 !== cost) { error.value = 'Indique el costo unitario (hasta 4 decimales)'; return; }
  if (reason.value.trim() && reason.value.trim().length < 5) { error.value = 'El detalle debe tener al menos 5 caracteres o dejarse vacío'; return; }
  busy.value = true; error.value = '';
  try {
    await inventoryPost('opening-balances', { productId: productId.value, locationId: locationId.value, quantity, unitCost: cost, ...(reason.value.trim() ? { reason: reason.value.trim() } : {}), requestId });
    emit('saved', 'Saldo inicial registrado. Es la primera línea del Kardex del producto y ya cuenta en el costo promedio.'); emit('close');
  } catch (caught) { error.value = getApiErrorMessage(caught, 'No se pudo registrar el saldo inicial'); }
  finally { busy.value = false; }
}
</script>

<template>
  <AppDrawer label="Registrar saldo inicial" size="sm" @close="!busy && emit('close')">
    <form class="flex h-full min-h-0 flex-col" @submit.prevent="submit">
      <header class="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
        <div><h2 class="text-lg font-semibold">Registrar saldo inicial</h2><p class="mt-1 text-sm text-muted-fg">Existencias con las que el producto empieza en el sistema, con su costo.</p></div>
        <button type="button" class="icon-button shrink-0" aria-label="Cerrar" :disabled="busy" @click="emit('close')"><X class="h-4 w-4" /></button>
      </header>
      <fieldset :disabled="busy" class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <p class="rounded-xl bg-surface-secondary p-4 text-sm">Solo se puede registrar antes de que el producto tenga otros movimientos. Para corregir existencias después, use un ajuste.</p>
        <label class="block text-sm font-medium">Producto<select v-model.number="productId" required class="field-control"><option :value="0" disabled>Seleccionar producto</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.sku }} · {{ p.name }}</option></select></label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="text-sm font-medium">Almacén<select v-model.number="warehouseId" required class="field-control" @change="locationId = 0"><option :value="0" disabled>Seleccionar almacén</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.branch.name }} · {{ w.name }}</option></select></label>
          <label class="text-sm font-medium">Espacio<select v-model.number="locationId" required class="field-control" :disabled="!spaces.length"><option :value="0" disabled>Seleccionar espacio</option><option v-for="space in spaces" :key="space.id" :value="space.id">{{ space.code }}</option></select></label>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <AppInput v-model="amount" type="number" :label="`Cantidad${unit ? ` (${unit})` : ''}`" min="1" step="1" required />
          <AppInput v-model="unitCost" type="number" label="Costo unitario (USD)" min="0" step="0.0001" required />
        </div>
        <p v-if="total !== null" class="text-sm text-muted-fg">Valor inicial: <strong class="text-fg">{{ money(total) }}</strong></p>
        <AppInput v-model="reason" label="Detalle (opcional)" placeholder="Por ejemplo: inventario físico al iniciar operaciones" maxlength="500" />
      </fieldset>
      <footer class="flex justify-end gap-2 border-t border-border p-5">
        <AppButton type="button" variant="outline" :disabled="busy" @click="emit('close')">Cancelar</AppButton>
        <AppButton type="submit" :disabled="busy"><PackagePlus class="h-4 w-4" />{{ busy ? 'Registrando…' : 'Registrar saldo inicial' }}</AppButton>
      </footer>
    </form>
  </AppDrawer>
</template>
