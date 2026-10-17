<script setup lang="ts">
// Label/value pairs without a box around each one: the quiet way to show a document's data.
withDefaults(defineProps<{
    items: Array<{ label: string; value?: string | number | null }>;
    columns?: 2 | 3 | 4;
}>(), { columns: 4 });
</script>

<template>
    <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2" :class="columns === 4 ? 'lg:grid-cols-4' : columns === 3 ? 'lg:grid-cols-3' : ''">
        <div v-for="item in items" :key="item.label" class="min-w-0">
            <dt class="text-xs text-muted-fg">{{ item.label }}</dt>
            <dd class="mt-1 text-sm font-medium text-fg"><slot :name="item.label" :item="item">{{ item.value || '—' }}</slot></dd>
        </div>
    </dl>
</template>
