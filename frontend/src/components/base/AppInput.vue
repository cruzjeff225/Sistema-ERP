<script setup lang="ts">
defineProps<{
    modelValue: string;
    label?: string;
    type?: string;
    placeholder?: string;
    error?: string;
    autocomplete?: string;
    disabled?: boolean;
    required?: boolean;
    minlength?: number;
    maxlength?: number;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <div>
        <label v-if="label" class="mb-1.5 block text-sm font-medium text-fg">
            {{ label }}
        </label>
        <input :type="type ?? 'text'" :value="modelValue" :placeholder="placeholder" :autocomplete="autocomplete" :disabled="disabled" :required="required" :minlength="minlength" :maxlength="maxlength"
            class="h-10 w-full rounded-lg border bg-surface px-3 text-sm text-fg shadow-sm transition placeholder:text-muted-fg focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-muted-fg"
            :class="error ? 'border-danger' : 'border-border'"
            @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
        <p v-if="error" class="mt-1.5 text-xs text-danger">{{ error }}</p>
    </div>
</template>
