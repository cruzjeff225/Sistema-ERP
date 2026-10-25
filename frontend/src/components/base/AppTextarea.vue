<script setup lang="ts">
import { useId } from "vue";

const props = withDefaults(defineProps<{
    modelValue: string;
    label?: string;
    placeholder?: string;
    error?: string;
    hint?: string;
    disabled?: boolean;
    required?: boolean;
    maxlength?: number | string;
    rows?: number;
}>(), { rows: 3 });

defineEmits<{ 'update:modelValue': [value: string] }>();

const textareaId = useId();
</script>

<template>
    <div>
        <label v-if="props.label" :for="textareaId" class="mb-1.5 block text-sm font-medium text-fg">{{ props.label }}</label>
        <textarea :id="textareaId" :value="props.modelValue" :rows="props.rows" :placeholder="props.placeholder" :disabled="props.disabled" :required="props.required" :maxlength="props.maxlength"
            class="w-full rounded-lg border bg-surface px-3 py-2 text-sm text-fg transition placeholder:text-muted-fg focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-muted-fg"
            :class="props.error ? 'border-danger' : 'border-border'"
            :aria-invalid="props.error ? true : undefined"
            @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" />
        <p v-if="props.error" class="mt-1.5 text-xs text-danger">{{ props.error }}</p>
        <p v-else-if="props.hint" class="mt-1.5 text-xs text-muted-fg">{{ props.hint }}</p>
    </div>
</template>
