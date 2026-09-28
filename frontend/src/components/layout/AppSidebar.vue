<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { LogOut, X } from "lucide-vue-next";
import { navigationGroups } from "../../config/navigation.config";
import { usePermissions } from "../../composables/usePermissions";
import { useAuthStore } from "../../stores/auth.store";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { can, currentUser } = usePermissions();

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const visibleGroups = computed(() =>
  navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.map(item => ({ ...item, sections: item.sections?.filter(section => can(section.permission)) }))
        .filter(item => item.permission === null || can(item.permission) || item.sections?.length)
        .map(item => ({ ...item, route: item.sections?.[0]?.route ?? item.route })),
    }))
    .filter((group) => group.items.length > 0),
);

const initials = computed(() => {
  const name = currentUser.value?.username ?? "";
  return name.slice(0, 1).toUpperCase() || "?";
});

async function handleLogout() {
  await authStore.logout();
  router.push({ name: "login" });
}
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-border/70 bg-sidebar shadow-2xl transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-[272px] lg:translate-x-0 lg:shadow-none"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="flex h-[68px] items-center gap-3 border-b border-border/70 px-5">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-fg text-bg shadow-sm">
          <span class="text-sm font-bold">E</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold leading-none text-fg">ERP Software</p>
          <p class="mt-1 text-xs text-muted-fg">Centro operativo</p>
        </div>
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-lg text-muted-fg hover:bg-surface-secondary hover:text-fg lg:hidden"
          title="Cerrar menu"
          @click="emit('close')"
        >
          <X class="h-5 w-5" />
        </button>
    </div>

    <nav class="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
      <div v-for="group in visibleGroups" :key="group.label">
        <p class="px-3 pb-2 text-xs font-semibold text-muted-fg">
          {{ group.label }}
        </p>
        <div class="space-y-1">
          <RouterLink
            v-for="item in group.items"
            :key="item.route"
            :to="item.route"
            class="group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-fg transition-colors hover:bg-surface-secondary hover:text-fg"
            active-class="!bg-sidebar-active !text-sidebar-active-fg shadow-sm"
            :class="item.sections?.some(section => section.route === route.path) ? '!bg-sidebar-active !text-sidebar-active-fg shadow-sm' : ''"
            @click="emit('close')"
          >
            <component :is="item.icon" class="h-[18px] w-[18px] shrink-0" />
            {{ item.label }}
          </RouterLink>
        </div>
      </div>
    </nav>

    <div class="border-t border-border/70 p-3">
      <div class="flex items-center gap-2.5 px-2 py-2">
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {{ initials }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-fg">{{ currentUser?.username }}</p>
          <p class="truncate text-xs text-muted-fg">{{ currentUser?.email }}</p>
          <RouterLink to="/account/security" class="mt-1 block text-xs text-muted-fg underline-offset-4 hover:text-fg hover:underline" @click="emit('close')">Seguridad de mi cuenta</RouterLink>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-fg transition-colors hover:bg-surface hover:text-fg"
          title="Cerrar sesion"
          @click="handleLogout"
        >
          <LogOut class="h-4 w-4" />
        </button>
      </div>
    </div>
  </aside>
</template>
