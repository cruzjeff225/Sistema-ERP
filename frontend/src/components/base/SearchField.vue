<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { Search } from "lucide-vue-next";

// The one search box of the system. `class` lands on the wrapper (layout); everything else
// (placeholder, aria-label, disabled, maxlength, type, id…) goes to the input itself.
defineOptions({ inheritAttrs: false });
defineProps<{ modelValue: string }>();
defineEmits<{ "update:modelValue": [value: string] }>();

const attrs = useAttrs();
const wrapperClass = computed(() => attrs.class);
const inputAttrs = computed(() => {
    const { class: _class, ...rest } = attrs;
    return rest;
});
</script>

<template>
    <div class="relative min-w-0" :class="wrapperClass">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" />
        <input v-bind="inputAttrs" :value="modelValue" type="search" class="control w-full pl-9 pr-3" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    </div>
</template>
