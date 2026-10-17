import { computed, ref, watch } from 'vue';
import { useAuthStore } from '../stores/auth.store';
import { activeCompanyId } from '../services/company-context';

/** A purchase document the person opened lately, kept only in this browser. */
export type RecentDocument = {
  key: string;
  code: string;
  /** Document type as the person knows it, e.g. "Solicitud de compra". */
  kind: string;
  /** Stage or status when it was opened; screens that know the live one show that instead. */
  stage: string;
  /** Where "Abrir" leads. */
  to: string;
  anchor?: { type: string; id: number };
  at: string;
};

const MAX_STORED = 8;
const version = ref(0);

function storageKey() {
  const userId = useAuthStore().user?.id;
  return userId && activeCompanyId.value ? `erp.recent-documents.${userId}.${activeCompanyId.value}` : null;
}

function read(): RecentDocument[] {
  const key = storageKey();
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.key === 'string' && typeof item.to === 'string' && typeof item.code === 'string') : [];
  } catch { return []; }
}

/** Remember that a document was just opened (most recent first, one entry per document). */
export function recordRecentDocument(doc: Omit<RecentDocument, 'at'>) {
  const key = storageKey();
  if (!key) return;
  try {
    const next = [{ ...doc, at: new Date().toISOString() }, ...read().filter(item => item.key !== doc.key)].slice(0, MAX_STORED);
    localStorage.setItem(key, JSON.stringify(next));
    version.value++;
  } catch { /* Storage may be blocked or full; the history is a convenience. */ }
}

export function useRecentDocuments(limit = 4) {
  const items = computed(() => { void version.value; void activeCompanyId.value; return read().slice(0, limit); });
  watch(() => useAuthStore().user?.id, () => version.value++);
  return { items };
}
