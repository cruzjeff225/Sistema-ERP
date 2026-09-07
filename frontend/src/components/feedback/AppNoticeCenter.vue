<script setup lang="ts">
import { storeToRefs } from "pinia";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-vue-next";
import { useFeedbackStore } from "../../stores/feedback.store";

const feedbackStore = useFeedbackStore();
const { items } = storeToRefs(feedbackStore);
</script>

<template>
  <section class="pointer-events-none fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-md flex-col gap-2" aria-live="polite" aria-label="Notificaciones">
    <TransitionGroup enter-active-class="transition duration-200 ease-out" enter-from-class="-translate-y-2 opacity-0" leave-active-class="transition duration-150 ease-in" leave-to-class="translate-y-1 opacity-0">
      <article v-for="item in items" :key="item.id" class="pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface px-3 py-3 shadow-lg" :class="item.tone === 'error' ? 'border-danger/30' : item.tone === 'success' ? 'border-success/30' : 'border-border'" role="status">
        <TriangleAlert v-if="item.tone === 'error'" class="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <CheckCircle2 v-else-if="item.tone === 'success'" class="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <Info v-else class="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p class="min-w-0 flex-1 text-sm leading-5 text-fg">{{ item.message }}</p>
        <button class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-fg transition hover:bg-surface-secondary hover:text-fg" title="Cerrar notificación" @click="feedbackStore.dismiss(item.id)">
          <X class="h-4 w-4" />
        </button>
      </article>
    </TransitionGroup>
  </section>
</template>
