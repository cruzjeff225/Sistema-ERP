<script setup lang="ts">
defineProps<{
    modelValue: string;
    label?: string;
    type?: string;
    placeholder?: string;
    error?: string;
    autocomplete?: string;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <div>
        <label v-if="label" class="mb-1.5 block text-sm font-medium text-fg">
            {{ label }}
        </label>
        <input :type="type ?? 'text'" :value="modelValue" :placeholder="placeholder" :autocomplete="autocomplete"
            class="h-10 w-full rounded-lg border bg-surface px-3 text-sm text-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
            :class="error ? 'border-danger' : 'border-border'"
            @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
        <p v-if="error" class="mt-1.5 text-xs text-danger">{{ error }}</p>
    </div>
</template>