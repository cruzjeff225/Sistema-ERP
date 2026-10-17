import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { http } from '../services/http.service';
import { activeCompanyId } from '../services/company-context';
import { usePermissions } from './usePermissions';
import { myOwners, pendingFor, waitingOnOthers } from '../utils/my-pending';
import type { ProcessRow } from '../utils/purchase-tracking';

/** The open purchases that wait on the signed-in user, loaded for the active company. Shared by every screen that shows "Mis pendientes". */
export function useMyPending() {
  const { can } = usePermissions();
  const rows = ref<ProcessRow[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  let version = 0;

  const visible = computed(() => can('purchases.view'));
  const owners = computed(() => myOwners(can));
  const items = computed(() => pendingFor(rows.value, owners.value, can));
  const waiting = computed(() => waitingOnOthers(rows.value, items.value));

  async function load() {
    const companyId = activeCompanyId.value;
    if (!companyId || !visible.value) return;
    const current = ++version;
    loading.value = true; failed.value = false;
    try {
      const response = await http.get('/purchases/tracking/processes', { params: { scope: 'open', limit: 50 }, headers: { 'X-Company-Id': String(companyId) } });
      if (current !== version || companyId !== activeCompanyId.value) return;
      rows.value = response.data.data.items;
    } catch {
      if (current === version) { rows.value = []; failed.value = true; }
    } finally { if (current === version) loading.value = false; }
  }

  onMounted(() => void load());
  onBeforeUnmount(() => { version++; });
  watch(activeCompanyId, () => void load());

  return { rows, loading, failed, visible, owners, items, waiting, load };
}
