<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Check, X } from "lucide-vue-next";
import AppButton from "./AppButton.vue";

const props = defineProps<{ title: string; description: string; requireReason?: boolean; busy?: boolean; error?: string }>();
const emit = defineEmits<{ confirm: [reason: string]; close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const reason = ref("");
onMounted(() => dialog.value?.showModal());
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface p-6 text-fg shadow-xl backdrop:bg-black/50" aria-labelledby="purchase-confirm-title" @cancel.prevent="!props.busy && emit('close')">
      <form @submit.prevent="emit('confirm', reason.trim())">
        <div class="flex items-start justify-between gap-4"><h2 id="purchase-confirm-title" class="text-lg font-semibold">{{ props.title }}</h2><button type="button" class="icon-button shrink-0" aria-label="Cerrar confirmación" :disabled="props.busy" @click="emit('close')"><X class="h-4 w-4" /></button></div>
        <p class="mt-3 text-sm leading-6 text-muted-fg">{{ props.description }}</p>
        <label v-if="props.requireReason" class="mt-4 block text-sm font-medium">Motivo<textarea v-model="reason" class="field-control min-h-24 py-2" required maxlength="500" :disabled="props.busy" autofocus /></label>
        <p v-if="props.error" role="alert" class="mt-4 text-sm text-danger">{{ props.error }}</p>
        <div class="mt-6 flex justify-end gap-2"><AppButton type="button" variant="outline" :disabled="props.busy" @click="emit('close')">Volver</AppButton><AppButton type="submit" :disabled="props.busy || (props.requireReason && !reason.trim())"><Check class="h-4 w-4" />{{ props.busy ? 'Procesando...' : 'Confirmar' }}</AppButton></div>
      </form>
    </dialog>
  </Teleport>
</template>
