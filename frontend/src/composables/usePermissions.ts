import { computed } from "vue";
import { useAuthStore } from "../stores/auth.store";

const SUPERADMIN_ROLE = "superadmin";

export function usePermissions() {
  const authStore = useAuthStore();

  function isSuperadmin(): boolean {
    return authStore.user?.roles.includes(SUPERADMIN_ROLE) ?? false;
  }

  function can(permission: string): boolean {
    if (isSuperadmin()) return true;
    return authStore.user?.permissions.includes(permission) ?? false;
  }

  function canAny(permissions: string[]): boolean {
    if (isSuperadmin()) return true;
    return permissions.some((p) => authStore.user?.permissions.includes(p));
  }

  function canAll(permissions: string[]): boolean {
    if (isSuperadmin()) return true;
    return permissions.every((p) => authStore.user?.permissions.includes(p));
  }

  const currentUser = computed(() => authStore.user);

  return { can, canAny, canAll, isSuperadmin, currentUser };
}
