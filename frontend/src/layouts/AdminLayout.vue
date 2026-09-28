<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppSidebar from '../components/layout/AppSidebar.vue';
import AppTopbar from '../components/layout/AppTopbar.vue';
import PurchaseSections from '../components/layout/PurchaseSections.vue';

defineProps<{ title: string }>();

const route = useRoute();
const sidebarOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false;
  },
);
</script>

<template>
    <div class="flex h-dvh min-h-0 bg-bg">
        <button
            v-if="sidebarOpen"
            type="button"
            class="fixed inset-0 z-30 bg-black/35 backdrop-blur-[2px] lg:hidden"
            aria-label="Cerrar menu"
            @click="sidebarOpen = false"
        />
        <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AppTopbar :title="title" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
            <main class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div class="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
                    <PurchaseSections />
                    <slot />
                </div>
            </main>
        </div>
    </div>
</template>
