<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { MoreHorizontal, Pencil, Plus, Power, RefreshCw, Search, Trash2, X } from "lucide-vue-next";
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
const removal = ref<ExpenseType | null>(null);
const menuId = ref<number | null>(null);
const menuButtons = new Map<number, HTMLElement>();
const closeMenu = (focus = false) => { const open = menuId.value; menuId.value = null; if (focus && open !== null) menuButtons.get(open)?.focus(); };
function toggleMenu(row: ExpenseType) { menuId.value = menuId.value === row.id ? null : row.id; }
function onDocumentClick(event: MouseEvent) { if (menuId.value !== null && !(event.target as HTMLElement).closest('[data-row-menu]')) menuId.value = null; }
document.addEventListener('click', onDocumentClick);
const canRemove = computed(() => can('trash.delete'));
const rowCanToggle = (row: ExpenseType) => can(row.isActive ? 'expense_types.deactivate' : 'expense_types.activate');
const openUp = (index: number) => filteredRows.value.length > 3 && index >= filteredRows.value.length - 2;
const form = reactive({ name: "", description: "" });
const busy = ref(false);
const loading = ref(false);
const error = ref("");
let version = 0;
onBeforeUnmount(() => { version++; document.removeEventListener("click", onDocumentClick); });
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
async function remove() {
  if (!removal.value || busy.value) return;
  busy.value = true; error.value = "";
  const company = activeCompanyId.value;
  try {
    await http.delete(`/trash/expense_types/${removal.value.id}`, { headers: { "X-Company-Id": String(company) } });
    if (company !== activeCompanyId.value) return;
    removal.value = null;
    await load();
    emit('changed');
  } catch (caught) { if (company === activeCompanyId.value) error.value = getApiErrorMessage(caught, "No se pudo enviar a la papelera"); }
  finally { busy.value = false; }
}
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
  <section aria-label="Configurar tipos de gasto" @keydown.esc="menuId !== null && (closeMenu(true), $event.stopPropagation())">
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-2xl font-semibold tracking-tight">Tipos de gasto</h2><div class="flex items-center gap-2"><AppButton variant="outline" :disabled="loading || busy" @click="load"><RefreshCw class="h-4 w-4" />Actualizar</AppButton><AppButton v-if="can('expense_types.create')" :disabled="busy" @click="edit()"><Plus class="h-4 w-4" />Nuevo tipo</AppButton><button v-if="props.embedded" type="button" class="icon-button" aria-label="Cerrar configuración" @click="requestClose"><X class="h-4 w-4" /></button></div></div>
    <p v-if="error" role="alert" class="mt-4 rounded-[12px] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{{ error }}</p>
    <form v-if="editor" class="mt-5 rounded-[12px] border border-border bg-surface-secondary/50 p-5" @submit.prevent="save"><fieldset :disabled="busy" class="space-y-4"><h3 class="text-lg font-semibold">{{ id ? 'Editar tipo de gasto' : 'Nuevo tipo de gasto' }}</h3><AppInput v-model="form.name" label="Nombre" required maxlength="100" /><AppInput v-model="form.description" label="Descripción" maxlength="500" /><div class="flex gap-2"><AppButton type="submit">{{ busy ? 'Guardando...' : 'Guardar' }}</AppButton><AppButton type="button" variant="outline" @click="editor = false">Cancelar</AppButton></div></fieldset></form>
    <label class="mt-5 block text-sm font-medium">Buscar tipo de gasto<span class="relative mt-1.5 block"><Search class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-fg" aria-hidden="true" /><input v-model="search" type="search" autocomplete="off" class="field-control !mt-0 !h-11 w-full !pl-10 font-normal" /></span></label>
    <p v-if="loading" role="status" class="py-6 text-muted-fg">Cargando...</p>
    <div v-else class="mt-5">
      <table class="w-full text-left text-sm">
        <caption class="sr-only">Tipos de gasto con su estado y acciones</caption>
        <thead class="bg-surface-secondary text-muted-fg"><tr><th scope="col" class="rounded-tl-[8px] px-4 py-3 font-medium">Nombre</th><th scope="col" class="px-3 py-3 font-medium">Estado</th><th scope="col" class="rounded-tr-[8px] px-4 py-3 text-right font-medium">Acciones</th></tr></thead>
        <tbody class="divide-y divide-border border-b border-border">
          <tr v-for="(row, index) in filteredRows" :key="row.id">
            <th scope="row" class="px-4 py-3.5 text-left font-normal"><p class="font-semibold text-fg">{{ row.name }}</p><p v-if="row.description" class="mt-0.5 text-sm text-muted-fg">{{ row.description }}</p></th>
            <td class="px-3 py-3.5 align-middle"><span class="inline-flex items-center gap-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="row.isActive ? 'bg-success' : 'bg-muted-fg/60'" aria-hidden="true" />{{ row.isActive ? 'Activo' : 'Inactivo' }}</span></td>
            <td class="px-4 py-3.5 align-middle">
              <div class="flex items-center justify-end gap-2">
                <button v-if="can('expense_types.update')" type="button" class="icon-button" :title="'Editar ' + row.name" :aria-label="'Editar ' + row.name" :disabled="busy" @click="edit(row)"><Pencil class="h-4 w-4" /></button>
                <div v-if="rowCanToggle(row) || canRemove" class="relative" data-row-menu>
                  <button :ref="el => { if (el) menuButtons.set(row.id, el as HTMLElement); }" type="button" class="icon-button" aria-haspopup="menu" :aria-expanded="menuId === row.id" :aria-label="'Más acciones de ' + row.name" :disabled="busy" @click="toggleMenu(row)"><MoreHorizontal class="h-4 w-4" /></button>
                  <div v-if="menuId === row.id" role="menu" :aria-label="'Acciones de ' + row.name" class="absolute right-0 z-20 w-44 rounded-[12px] border border-border bg-surface p-1.5 shadow-lg" :class="openUp(index) ? 'bottom-full mb-1.5' : 'top-full mt-1.5'">
                    <button v-if="rowCanToggle(row)" type="button" role="menuitem" class="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-fg hover:bg-surface-secondary" @click="confirmation = row; error = ''; closeMenu()"><Power class="h-4 w-4" aria-hidden="true" />{{ row.isActive ? 'Desactivar' : 'Activar' }}</button>
                    <button v-if="canRemove" type="button" role="menuitem" class="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-danger hover:bg-danger/10" @click="removal = row; error = ''; closeMenu()"><Trash2 class="h-4 w-4" aria-hidden="true" />Eliminar</button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredRows.length"><td colspan="3" class="p-8 text-center text-muted-fg">{{ search ? 'No hay coincidencias.' : 'No hay tipos de gasto registrados.' }}</td></tr>
        </tbody>
      </table>
    </div>
    <PurchaseActionDialog v-if="confirmation" :title="confirmation.isActive ? 'Desactivar tipo de gasto' : 'Activar tipo de gasto'" :description="`${confirmation.name}: ${confirmation.isActive ? 'no estará disponible en nuevos gastos; se conserva el historial.' : 'estará disponible para nuevos gastos.'}`" :busy="busy" :error="error" @close="confirmation = null" @confirm="save" />
    <PurchaseActionDialog v-if="removal" title="Eliminar tipo de gasto" :description="removal.name + ': se enviará a la papelera y podrá restaurarse durante 30 días. Se conservan los movimientos y las relaciones históricas.'" :busy="busy" :error="error" @close="removal = null" @confirm="remove" />
    <PurchaseActionDialog v-if="discard" title="Descartar cambios" description="Tiene cambios sin guardar en el tipo de gasto." :busy="busy" @close="discard = false" @confirm="discard = false; emit('close')" />
  </section>
</template>
