<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { Pencil, Plus, Power, RefreshCw, X } from "lucide-vue-next";
import TrashButton from "../admin/TrashButton.vue";
import AppButton from "../base/AppButton.vue";
import AppInput from "../base/AppInput.vue";
import PurchaseActionDialog from "../base/PurchaseActionDialog.vue";
import { http } from "../../services/http.service";
import { activeCompanyId } from "../../services/company-context";
import { usePermissions } from "../../composables/usePermissions";
import { getApiErrorMessage } from "../../utils/api-error";
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });
const emit = defineEmits<{ close: []; changed: [] }>();
const discard = ref(false);
let initialForm = '';
function requestClose() {
 if (busy.value) return;
 if (editor.value && JSON.stringify(form) !== initialForm) { discard.value = true; return; }
 emit('close');
}
defineExpose({ requestClose });
type ExpenseType = { id: number; name: string; description: string | null; isActive: boolean };
const { can } = usePermissions();
const rows = ref<ExpenseType[]>([]);
const search = ref("");
const filteredRows = computed(() => rows.value.filter(row => `${row.name} ${row.description ?? ''}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const editor = ref(false);
const id = ref<number | null>(null);
const confirmation = ref<ExpenseType | null>(null);
const form = reactive({ name: "", description: "" });
const busy = ref(false);
const loading = ref(false);
const error = ref("");
let version = 0;
onBeforeUnmount(() => { version++; });
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = "";
  try {
    const response = await http.get("/expense-types", { headers: { "X-Company-Id": String(activeCompanyId.value) } });
    if (current === version) rows.value = response.data.data;
  } catch (caught) { if (current === version) error.value = getApiErrorMessage(caught, "No se pudieron cargar los tipos de gasto"); }
  finally { if (current === version) loading.value = false; }
}
watch(activeCompanyId, () => { rows.value = []; editor.value = false; confirmation.value = null; if (activeCompanyId.value) void load(); }, { immediate: true });
function edit(row?: ExpenseType) { id.value = row?.id ?? null; Object.assign(form, { name: row?.name ?? "", description: row?.description ?? "" }); editor.value = true; error.value = ""; initialForm = JSON.stringify(form); }
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const company = activeCompanyId.value;
  const config = { headers: { "X-Company-Id": String(company) } };
  try {
    if (confirmation.value) await http.patch(`/expense-types/${confirmation.value.id}/status`, { isActive: !confirmation.value.isActive }, config);
    else if (id.value) await http.patch(`/expense-types/${id.value}`, form, config);
    else await http.post("/expense-types", form, config);
    if (company !== activeCompanyId.value) return;
    editor.value = false; confirmation.value = null;
    await load();
    emit('changed');
  } catch (caught) { if (company === activeCompanyId.value) error.value = getApiErrorMessage(caught, "No se pudo guardar el tipo de gasto"); }
  finally { busy.value = false; }
}
</script>
<template>
  <section aria-label="Configurar tipos de gasto">
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-xl font-semibold">Tipos de gasto</h2><div class="flex gap-2"><AppButton variant="outline" :disabled="loading || busy" @click="load"><RefreshCw class="h-4 w-4" />Actualizar</AppButton><AppButton v-if="can('expense_types.create')" :disabled="busy" @click="edit()"><Plus class="h-4 w-4" />Nuevo tipo</AppButton><button v-if="props.embedded" type="button" class="icon-button" aria-label="Cerrar configuración" @click="requestClose"><X class="h-4 w-4" /></button></div></div>
    <p v-if="error" role="alert" class="my-4 text-sm text-danger">{{ error }}</p>
    <form v-if="editor" class="my-6 max-w-xl border-y border-border py-6" @submit.prevent="save"><fieldset :disabled="busy" class="space-y-4"><h2 class="text-lg font-semibold">{{ id ? 'Editar tipo de gasto' : 'Nuevo tipo de gasto' }}</h2><AppInput v-model="form.name" label="Nombre" required maxlength="100" /><AppInput v-model="form.description" label="Descripcion" maxlength="500" /><div class="flex gap-2"><AppButton type="submit">{{ busy ? 'Guardando...' : 'Guardar' }}</AppButton><AppButton type="button" variant="outline" @click="editor = false">Cancelar</AppButton></div></fieldset></form>
    <div class="my-6 max-w-sm"><AppInput v-model="search" type="search" label="Buscar tipo de gasto" /></div>
    <p v-if="loading" role="status" class="py-6 text-muted-fg">Cargando...</p>
    <div v-else class="overflow-x-auto border-y border-border"><table class="w-full min-w-[480px] text-left text-sm"><thead class="bg-surface-secondary text-muted-fg"><tr><th class="p-3">Nombre</th><th class="p-3">Descripcion</th><th class="p-3">Estado</th><th class="p-3 text-right">Acciones</th></tr></thead><tbody class="divide-y divide-border"><tr v-for="row in filteredRows" :key="row.id"><td class="p-3 font-medium">{{ row.name }}</td><td class="p-3">{{ row.description || '-' }}</td><td class="p-3">{{ row.isActive ? 'Activo' : 'Inactivo' }}</td><td class="p-3"><div class="flex justify-end gap-2"><button v-if="can('expense_types.update')" class="icon-button" title="Editar tipo de gasto" :disabled="busy" @click="edit(row)"><Pencil class="h-4 w-4" /></button><button v-if="can(row.isActive ? 'expense_types.deactivate' : 'expense_types.activate')" class="icon-button" :title="row.isActive ? 'Desactivar' : 'Activar'" :disabled="busy" @click="confirmation = row; error = ''"><Power class="h-4 w-4" /></button><TrashButton compact entity="expense_types" :record-id="row.id" :label="row.name" :disabled="busy" @deleted="load(); emit('changed')" /></div></td></tr><tr v-if="!filteredRows.length"><td colspan="4" class="p-8 text-center text-muted-fg">{{ search ? 'No hay coincidencias.' : 'No hay tipos de gasto registrados.' }}</td></tr></tbody></table></div>
    <PurchaseActionDialog v-if="confirmation" :title="confirmation.isActive ? 'Desactivar tipo de gasto' : 'Activar tipo de gasto'" :description="`${confirmation.name}: ${confirmation.isActive ? 'no estara disponible en nuevos gastos; se conserva el historial.' : 'estara disponible para nuevos gastos.'}`" :busy="busy" :error="error" @close="confirmation = null" @confirm="save" />
    <PurchaseActionDialog v-if="discard" title="Descartar cambios" description="Tiene cambios sin guardar en el tipo de gasto." :busy="busy" @close="discard = false" @confirm="discard = false; emit('close')" />
  </section>
</template>
