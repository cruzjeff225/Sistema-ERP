<script setup lang="ts">
// Select with a search box inside its panel. Presentation only: it reports the chosen id and lets the parent decide
// what to do with it (the parent may ask for confirmation before changing its own state).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { Check, ChevronDown, Search, X } from 'lucide-vue-next';

type Option = { id: number; label: string; description?: string };
const props = defineProps<{ modelValue: number; options: Option[]; label: string; placeholder?: string; searchLabel?: string; disabled?: boolean; required?: boolean }>();
const emit = defineEmits<{ select: [id: number] }>();

const uid = useId();
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const open = ref(false);
const query = ref('');
const active = ref(0);

const selected = computed(() => props.options.find(option => option.id === props.modelValue));
const filtered = computed(() => {
  const term = query.value.trim().toLowerCase();
  return term ? props.options.filter(option => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(term)) : props.options;
});
const optionId = (index: number) => `${uid}-opt-${index}`;

async function show() {
  if (props.disabled) return;
  query.value = '';
  active.value = Math.max(0, props.options.findIndex(option => option.id === props.modelValue));
  open.value = true;
  await nextTick();
  searchInput.value?.focus();
  document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' });
}
function hide(returnFocus = true) { open.value = false; if (returnFocus) trigger.value?.focus(); }
function choose(option: Option) { hide(); emit('select', option.id); }
function move(step: number) {
  if (!filtered.value.length) return;
  active.value = (active.value + step + filtered.value.length) % filtered.value.length;
  void nextTick(() => document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' }));
}
function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
  else if (event.key === 'Enter') { event.preventDefault(); const option = filtered.value[active.value]; if (option) choose(option); }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); }
  else if (event.key === 'Tab') hide(false);
}
function onTriggerKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); void show(); }
}
function onOutside(event: MouseEvent) { if (open.value && root.value && !root.value.contains(event.target as Node)) hide(false); }
watch(query, () => { active.value = 0; });
onMounted(() => document.addEventListener('mousedown', onOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onOutside));
</script>

<template>
  <div ref="root" class="relative">
    <span :id="uid + '-label'" class="mb-1.5 block text-sm font-medium text-fg">{{ label }}</span>
    <button ref="trigger" type="button" class="field-control !mt-0 !h-10 flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60" aria-haspopup="listbox" :aria-expanded="open" :aria-labelledby="uid + '-label ' + uid + '-value'" :aria-controls="uid + '-list'" :disabled="disabled" @click="open ? hide() : show()" @keydown="onTriggerKey">
      <span :id="uid + '-value'" class="min-w-0 truncate" :class="selected ? 'text-fg' : 'text-muted-fg'">{{ selected ? selected.label + (selected.description ? ' · ' + selected.description : '') : placeholder ?? 'Seleccionar' }}</span>
      <ChevronDown class="h-4 w-4 shrink-0 text-muted-fg transition-transform" :class="open ? 'rotate-180' : ''" aria-hidden="true" />
    </button>
    <div v-if="open" class="absolute left-0 right-0 z-30 mt-1.5 rounded-[12px] border border-border bg-surface p-2 shadow-lg">
      <div class="relative">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" />
        <input ref="searchInput" v-model="query" type="text" role="combobox" autocomplete="off" aria-expanded="true" :aria-label="searchLabel ?? 'Buscar'" :aria-controls="uid + '-list'" :aria-activedescendant="filtered.length ? optionId(active) : undefined" class="field-control !mt-0 !h-10 w-full !pl-9 !pr-9" @keydown="onSearchKey" />
        <button v-if="query" type="button" class="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-fg hover:text-fg" aria-label="Limpiar búsqueda" @click="query = ''; searchInput?.focus()"><X class="h-4 w-4" /></button>
      </div>
      <ul :id="uid + '-list'" role="listbox" :aria-labelledby="uid + '-label'" class="mt-2 max-h-64 overflow-y-auto">
        <li v-for="(option, index) in filtered" :id="optionId(index)" :key="option.id" role="option" :aria-selected="option.id === modelValue" class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5" :class="index === active ? 'bg-surface-secondary' : ''" @mouseenter="active = index" @click="choose(option)">
          <span class="min-w-0"><span class="block font-semibold text-fg">{{ option.label }}</span><span v-if="option.description" class="block text-sm text-muted-fg">{{ option.description }}</span></span>
          <Check v-if="option.id === modelValue" class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        </li>
        <li v-if="!filtered.length" role="presentation" class="px-3 py-4 text-center text-sm text-muted-fg">No hay coincidencias.</li>
      </ul>
    </div>
  </div>
</template>
