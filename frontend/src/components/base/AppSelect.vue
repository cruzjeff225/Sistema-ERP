<script setup lang="ts">
import { useId } from "vue";

const props = defineProps<{
    modelValue: string | number;
    label?: string;
    error?: string;
    hint?: string;
    disabled?: boolean;
    required?: boolean;
    /** Plain choices; use the default slot for groups or custom options. */
    options?: Array<{ value: string | number; label: string; disabled?: boolean }>;
    placeholder?: string;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();

const selectId = useId();
</script>

<template>
    <div>
        <label v-if="props.label" :for="selectId" class="mb-1.5 block text-sm font-medium text-fg">{{ props.label }}</label>
        <select :id="selectId" :value="props.modelValue" :disabled="props.disabled" :required="props.required"
            class="h-9 w-full rounded-lg border bg-surface px-3 text-sm text-fg transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-muted-fg"
            :class="props.error ? 'border-danger' : 'border-border'"
            :aria-invalid="props.error ? true : undefined"
            @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
            <option v-if="props.placeholder" value="">{{ props.placeholder }}</option>
            <slot>
                <option v-for="option in props.options" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option>
            </slot>
        </select>
        <p v-if="props.error" class="mt-1.5 text-xs text-danger">{{ props.error }}</p>
        <p v-else-if="props.hint" class="mt-1.5 text-xs text-muted-fg">{{ props.hint }}</p>
    </div>
</template>
