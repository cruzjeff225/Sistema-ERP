<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

// The one side panel of the system (forms, details, history). Clicking outside or pressing Esc emits `close`,
// so a screen with an unsaved-changes guard keeps asking before it lets go. Focus returns to what opened it.
withDefaults(defineProps<{
    label: string;
    size?: "sm" | "md" | "lg";
    /** Wraps the content in a scrolling area with padding; leave off when the content brings its own header, body and footer. */
    padded?: boolean;
}>(), { size: "md", padded: false });
defineEmits<{ close: [] }>();

const widths = { sm: "max-w-xl", md: "max-w-2xl", lg: "max-w-3xl" };
const panel = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;

onMounted(() => {
    opener = document.activeElement as HTMLElement | null;
    if (!panel.value?.contains(document.activeElement)) panel.value?.focus();
});

// Tab and Shift+Tab stay inside the panel while it is open, so the keyboard never lands on the page behind it.
const focusable = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function keepFocus(event: KeyboardEvent) {
    const items = Array.from(panel.value?.querySelectorAll<HTMLElement>(focusable) ?? []).filter(item => item.offsetParent !== null);
    if (!items.length) { event.preventDefault(); panel.value?.focus(); return; }
    const first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel.value)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
}
onBeforeUnmount(() => opener?.focus?.());
</script>

<template>
    <div class="fixed inset-0 z-50 flex justify-end bg-black/40" @click.self="$emit('close')">
        <aside ref="panel" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1" class="flex h-full w-full flex-col bg-surface shadow-[var(--shadow-float)] outline-none" :class="widths[size]" @keydown.esc.stop="$emit('close')" @keydown.tab="keepFocus">
            <div v-if="padded" class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><slot /></div>
            <slot v-else />
        </aside>
    </div>
</template>
