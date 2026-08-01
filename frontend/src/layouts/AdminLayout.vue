<script setup lang="ts">
import AppSidebar from '../components/layout/AppSidebar.vue';
import AppTopbar from '../components/layout/AppTopbar.vue';

defineProps<{ title: string }>();
</script>

<template>
    <div class="flex h-screen bg-bg">
        <AppSidebar />
        <div class="flex flex-1 flex-col overflow-hidden">
            <AppTopbar :title="title" />
            <main class="flex-1 overflow-y-auto p-6">
                <slot />
            </main>
        </div>
    </div>
</template>