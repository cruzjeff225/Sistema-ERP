<script setup lang="ts">
import { computed, useId, type Component } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

interface DirectorySection {
  id: string;
  label: string;
  description: string;
  route: string;
  icon: Component;
}

interface DirectoryGroup {
  id: string;
  label: string;
  description: string;
  sections: DirectorySection[];
}

const props = withDefaults(defineProps<{
  title: string;
  description: string;
  groups: DirectoryGroup[];
  support?: DirectorySection[];
  supportLabel?: string;
  emptyMessage?: string;
}>(), {
  support: () => [],
  supportLabel: 'Catálogos de apoyo',
  emptyMessage: 'Tu cuenta no tiene opciones disponibles en esta sección.',
});

const directoryId = useId();
const hasSections = computed(() => props.groups.some(group => group.sections.length) || props.support.length > 0);

// Cells are separated by hairlines. The column count follows the number of entries (3 -> 3 columns, 4 -> 2x2) and the last cell
// stretches to close its row, so a partly filled row never shows an empty block.
const columnsFor = (count: number) => count <= 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : count === 4 ? 2 : 3;
const gridStyle = (count: number) => ({ '--cols': columnsFor(count) });
const lastStyle = (count: number) => ({ '--span-lg': columnsFor(count) - ((count - 1) % columnsFor(count)), '--span-sm': count % 2 === 1 ? 2 : 1 });
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-8 sm:mb-10">
      <h1 class="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{{ title }}</h1>
      <p class="mt-3 max-w-xl text-sm leading-6 text-muted-fg">{{ description }}</p>
    </header>
    <div class="space-y-9">
      <section v-for="group in groups" :key="group.id" :aria-labelledby="`${directoryId}-${group.id}`">
        <div class="mb-4">
          <h2 :id="`${directoryId}-${group.id}`" class="text-xl font-semibold tracking-tight text-fg">{{ group.label }}</h2>
          <p class="mt-1 text-sm leading-6 text-muted-fg">{{ group.description }}</p>
        </div>
        <div class="directory-grid overflow-hidden rounded-[12px] border border-border" :style="gridStyle(group.sections.length)">
          <RouterLink v-for="(section, index) in group.sections" :key="section.id" :to="section.route" class="directory-cell" :class="{ 'directory-last': index === group.sections.length - 1 }" :style="index === group.sections.length - 1 ? lastStyle(group.sections.length) : undefined">
            <component :is="section.icon" class="mt-0.5 h-7 w-7 shrink-0 text-fg" :stroke-width="1.5" aria-hidden="true" />
            <span class="min-w-0 flex-1"><span class="block text-base font-semibold text-fg">{{ section.label }}</span><span class="mt-1 block text-sm leading-6 text-muted-fg">{{ section.description }}</span></span>
          </RouterLink>
        </div>
      </section>
    </div>
    <details v-if="support.length" :open="!groups.length" class="directory-support mt-9 rounded-[12px] border border-border bg-surface">
      <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-[12px] px-5 py-4 text-base font-medium text-muted-fg transition-colors hover:bg-surface-secondary">
        {{ supportLabel }}<ChevronDown class="directory-chevron h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div class="directory-grid border-t border-border" :style="gridStyle(support.length)">
        <RouterLink v-for="(section, index) in support" :key="section.id" :to="section.route" class="directory-cell" :class="{ 'directory-last': index === support.length - 1 }" :style="index === support.length - 1 ? lastStyle(support.length) : undefined">
          <component :is="section.icon" class="mt-0.5 h-7 w-7 shrink-0 text-fg" :stroke-width="1.5" aria-hidden="true" />
          <span class="min-w-0 flex-1"><span class="block text-base font-semibold text-fg">{{ section.label }}</span><span class="mt-1 block text-sm leading-6 text-muted-fg">{{ section.description }}</span></span>
        </RouterLink>
      </div>
    </details>
    <p v-if="!hasSections" role="status" class="rounded-[12px] border border-border bg-surface p-6 text-sm text-muted-fg">{{ emptyMessage }}</p>
  </div>
</template>

<style scoped>
.directory-grid { display: grid; gap: 1px; grid-template-columns: minmax(0, 1fr); background: hsl(var(--border)); }
.directory-cell { display: flex; align-items: flex-start; gap: 1rem; min-height: 7rem; padding: 1.5rem; background: hsl(var(--surface)); transition: background-color .15s; }
.directory-cell:hover { background: hsl(var(--surface-secondary)); }
.directory-cell:focus-visible { position: relative; outline: 2px solid hsl(var(--accent)); outline-offset: -3px; }
.directory-support > summary::-webkit-details-marker { display: none; }
.directory-support[open] .directory-chevron { transform: rotate(180deg); }
@media (min-width: 640px) {
  .directory-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .directory-last { grid-column: span var(--span-sm, 1); }
}
@media (min-width: 1024px) {
  .directory-grid { grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr)); }
  .directory-last { grid-column: span var(--span-lg, 1); }
}
</style>
