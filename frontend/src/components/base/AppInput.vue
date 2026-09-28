<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Eye, EyeOff } from "lucide-vue-next";

const props = defineProps<{
    modelValue: string | number;
    label?: string;
    type?: string;
    placeholder?: string;
    error?: string;
    hint?: string;
    autocomplete?: string;
    disabled?: boolean;
    required?: boolean;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    pattern?: string;
    inputmode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url" | "search";
    minlength?: number | string;
    maxlength?: number | string;
    revealPassword?: boolean;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();

const inputId = useId();
const passwordVisible = ref(false);
const inputType = computed(() => props.type === "password" && passwordVisible.value ? "text" : props.type ?? "text");
</script>

<template>
    <div>
        <label v-if="props.label" :for="inputId" class="mb-1.5 block text-sm font-medium text-fg">
            {{ props.label }}
        </label>
        <div class="relative">
            <input :id="inputId" :type="inputType" :value="props.modelValue" :placeholder="props.placeholder" :autocomplete="props.autocomplete" :disabled="props.disabled" :required="props.required" :min="props.min" :max="props.max" :step="props.step" :pattern="props.pattern" :inputmode="props.inputmode" :minlength="props.minlength" :maxlength="props.maxlength"
                class="h-10 w-full rounded-lg border bg-surface px-3 text-sm text-fg shadow-sm transition placeholder:text-muted-fg focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-muted-fg"
                :class="[props.error ? 'border-danger' : 'border-border', props.revealPassword && props.type === 'password' ? 'pr-10' : '']"
                @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
            <button v-if="props.revealPassword && props.type === 'password'" type="button" class="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-fg transition hover:text-fg focus:outline-none" :title="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordVisible = !passwordVisible">
                <EyeOff v-if="passwordVisible" class="h-4 w-4" />
                <Eye v-else class="h-4 w-4" />
            </button>
        </div>
        <p v-if="props.error" class="mt-1.5 text-xs text-danger">{{ props.error }}</p>
        <p v-else-if="props.hint" class="mt-1.5 text-xs text-muted-fg">{{ props.hint }}</p>
    </div>
</template>
