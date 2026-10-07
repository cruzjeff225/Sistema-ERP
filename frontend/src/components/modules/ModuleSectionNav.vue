<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';

const props = defineProps<{
  label: string;
  homeRoute: string;
  selectedRoute: string;
  groups: Array<{ label: string; sections: Array<{ id: string; label: string; route: string }> }>;
  navigate: (route: string) => Promise<unknown>;
}>();
const sections = computed(() => props.groups.flatMap(group => group.sections));
const knownSelection = computed(() => sections.value.some(section => section.route === props.selectedRoute));

async function changeSection(event: Event) {
  const select = event.target as HTMLSelectElement;
  const destination = sections.value.find(section => section.route === select.value);
  try {
    if (destination) await props.navigate(destination.route);
  } finally {
    // Keep the real section selected when its form prevents navigation.
    select.value = props.selectedRoute;
  }
}
</script>

<template>
  <nav :aria-label="`Navegación de ${label.toLocaleLowerCase('es')}`" class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
    <RouterLink :to="homeRoute" class="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted-fg transition-colors hover:bg-surface-secondary hover:text-fg">
      <ArrowLeft class="h-4 w-4" aria-hidden="true" />{{ label }}
    </RouterLink>
    <select v-if="sections.length > 1" :value="selectedRoute" :aria-label="`Sección de ${label.toLocaleLowerCase('es')}`" class="h-9 max-w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" @change="changeSection">
      <option v-if="!knownSelection" :value="selectedRoute" disabled>Sección actual</option>
      <optgroup v-for="group in groups" :key="group.label" :label="group.label">
        <option v-for="section in group.sections" :key="section.id" :value="section.route">{{ section.label }}</option>
      </optgroup>
    </select>
  </nav>
</template>
