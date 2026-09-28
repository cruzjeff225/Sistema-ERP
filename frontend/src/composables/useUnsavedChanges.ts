import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';

export function useUnsavedChanges(isDirty: () => boolean, isBusy: () => boolean) {
  const leaving = ref(false);
  let pending: ((allow: boolean) => void) | undefined;
  function resolveLeave(allow: boolean) {
    leaving.value = false;
    const resolve = pending;
    pending = undefined;
    resolve?.(allow);
  }
  function guard() {
    if (!isDirty()) return true;
    if (isBusy()) return false;
    // A second navigation must not abandon the first unresolved navigation.
    resolveLeave(false);
    leaving.value = true;
    return new Promise<boolean>(resolve => { pending = resolve; });
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty() && !isBusy()) return;
    event.preventDefault();
    event.returnValue = '';
  }
  onBeforeRouteLeave(guard);
  onBeforeRouteUpdate(guard);
  onMounted(() => window.addEventListener('beforeunload', beforeUnload));
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload);
    resolveLeave(false);
  });
  return { leaving, resolveLeave };
}
