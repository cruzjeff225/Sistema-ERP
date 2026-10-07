<script setup lang="ts">
import { computed, useId, type Component } from 'vue';
import { ChevronDown, ChevronRight } from 'lucide-vue-next';

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
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <header class="mb-8 sm:mb-10">
      <h1 class="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{{ title }}</h1>
      <p class="mt-3 max-w-xl text-sm leading-6 text-muted-fg">{{ description }}</p>
    </header>
    <div class="grid items-start gap-7 lg:gap-8" :class="groups.length > 1 ? 'lg:grid-cols-2' : ''">
      <section v-for="group in groups" :key="group.id" :aria-labelledby="`${directoryId}-${group.id}`">
        <div class="mb-4 px-1">
          <h2 :id="`${directoryId}-${group.id}`" class="text-base font-semibold tracking-tight text-fg">{{ group.label }}</h2>
          <p class="mt-1 text-sm leading-6 text-muted-fg">{{ group.description }}</p>
        </div>
        <div class="overflow-hidden rounded-2xl border border-border bg-surface">
          <RouterLink v-for="(section, index) in group.sections" :key="section.id" :to="section.route" class="directory-row flex min-h-24 items-center gap-4 px-5 py-5 transition-colors hover:bg-surface-secondary" :class="index > 0 ? 'border-t border-border/70' : ''">
            <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-fg"><component :is="section.icon" class="h-5 w-5" :stroke-width="1.6" aria-hidden="true" /></span>
            <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-fg">{{ section.label }}</span><span class="mt-1 block text-sm leading-5 text-muted-fg">{{ section.description }}</span></span>
            <ChevronRight class="h-4 w-4 shrink-0 text-muted-fg" aria-hidden="true" />
          </RouterLink>
        </div>
      </section>
    </div>
    <details v-if="support.length" :open="!groups.length" class="directory-support mt-8 rounded-2xl border border-border bg-surface">
      <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-sm font-medium text-muted-fg transition-colors hover:bg-surface-secondary">
        {{ supportLabel }}<ChevronDown class="directory-chevron h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div class="border-t border-border/70">
        <RouterLink v-for="(section, index) in support" :key="section.id" :to="section.route" class="directory-row flex items-center gap-4 px-5 py-5 transition-colors hover:bg-surface-secondary" :class="index > 0 ? 'border-t border-border/70' : ''">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-fg"><component :is="section.icon" class="h-5 w-5" :stroke-width="1.6" aria-hidden="true" /></span>
          <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-fg">{{ section.label }}</span><span class="mt-1 block text-sm leading-5 text-muted-fg">{{ section.description }}</span></span>
          <ChevronRight class="h-4 w-4 shrink-0 text-muted-fg" aria-hidden="true" />
        </RouterLink>
      </div>
    </details>
    <p v-if="!hasSections" role="status" class="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-fg">{{ emptyMessage }}</p>
  </div>
</template>

<style scoped>
.directory-row:focus-visible { position: relative; outline-offset: -3px; }
.directory-support > summary::-webkit-details-marker { display: none; }
.directory-support[open] .directory-chevron { transform: rotate(180deg); }
</style>
