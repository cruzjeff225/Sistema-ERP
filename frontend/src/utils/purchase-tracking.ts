// Types and presentation helpers for the purchase tracking view. The backend decides the stages and the next
// step; this module only translates that answer into labels, links and permission checks.

export type StageState = 'pending' | 'in_progress' | 'complete' | 'skipped';
export type Owner = 'Sucursal' | 'Compras' | 'Gerencia' | 'Bodega' | 'Administración';

export type TrackingStep = { stage: string; owner: Owner; label: string; route: string; query?: Record<string, string> };
export type TrackingStage = { id: string; label: string; owner: Owner; state: StageState; progress?: { done: number; total: number } };
export type TrackingLine = { productId: number; name: string; unit: string; requested: number; decided: number | null; purchased: number; received: number; placed: number; dispatched: number; delivered: number };
export type TrackingDocument = { id: number; code: string; status: string };
export type TrackingDocuments = Record<'requests' | 'consolidations' | 'quotations' | 'orders' | 'receipts' | 'retaceos' | 'transfers', TrackingDocument[]>;
export type Tracking = {
  anchor: { type: string; id: number };
  stages: TrackingStage[];
  nextStep: TrackingStep | null;
  alsoAvailable: TrackingStep[];
  blockers: { label: string; owner: Owner; route: string }[];
  completed: boolean;
  documents: TrackingDocuments;
  lines: TrackingLine[];
};

export const TRACKING_TYPES = ['request', 'quotation', 'order', 'receipt', 'retaceo', 'consolidation'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];
export const isTrackingType = (value: unknown): value is TrackingType => typeof value === 'string' && (TRACKING_TYPES as readonly string[]).includes(value);

const STATE_LABEL: Record<StageState, string> = { pending: 'Pendiente', in_progress: 'En curso', complete: 'Completa', skipped: 'No aplica' };
export const stateLabel = (state: StageState) => STATE_LABEL[state] ?? state;

/** Badge colour for a stage state, matching the variants of AppBadge. */
export function stateVariant(state: StageState): 'success' | 'info' | 'neutral' {
  return state === 'complete' ? 'success' : state === 'in_progress' ? 'info' : 'neutral';
}

/** The stage the team is working on: the first one in progress, otherwise the first that is still pending. */
export function currentStageId(stages: TrackingStage[], nextStep: TrackingStep | null): string | null {
  if (nextStep) return nextStep.stage;
  return stages.find(stage => stage.state === 'in_progress' || stage.state === 'pending')?.id ?? null;
}

export function progressPercent(progress?: { done: number; total: number }) {
  if (!progress || progress.total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)));
}

/** Quantities arrive as numbers with at most two decimals; avoid showing float noise such as 70.00000001. */
export function formatQuantity(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100);
}

// Permission needed to open each destination. The destination screen still enforces its own action permissions.
const ROUTE_PERMISSIONS: { prefix: string; any: string[] }[] = [
  { prefix: '/purchases/requests', any: ['purchase_requests.view'] },
  { prefix: '/purchases/quotations', any: ['purchase_quotations.view', 'purchase_orders.approve'] },
  { prefix: '/purchases/comparison', any: ['purchase_quotations.view'] },
  { prefix: '/purchases/orders', any: ['purchase_orders.view'] },
  { prefix: '/purchases/receipts', any: ['purchases.view'] },
  { prefix: '/purchases/retaceos', any: ['retaceos.view'] },
  { prefix: '/inventory/warehouse', any: ['inventory.view'] },
  { prefix: '/administration/trash', any: ['trash.view'] },
  { prefix: '/administration/settings/warehouse', any: ['warehouses.update'] },
];

export function canOpenRoute(route: string, can: (permission: string) => boolean) {
  const rule = ROUTE_PERMISSIONS.find(item => route === item.prefix || route.startsWith(item.prefix + '/') || route.startsWith(item.prefix + '?'));
  return !rule || rule.any.some(can);
}

export const stepLocation = (step: { route: string; query?: Record<string, string> }) => ({ path: step.route, query: step.query ?? {} });

type DocumentGroup = { key: keyof TrackingDocuments; label: string };
export const DOCUMENT_GROUPS: DocumentGroup[] = [
  { key: 'requests', label: 'Solicitudes' }, { key: 'consolidations', label: 'Gestiones de cotización' }, { key: 'quotations', label: 'Ofertas de proveedores' },
  { key: 'orders', label: 'Órdenes de compra' }, { key: 'receipts', label: 'Recepciones' }, { key: 'retaceos', label: 'Retaceos' }, { key: 'transfers', label: 'Traslados a sucursales' },
];

/** Where each kind of document is managed. Transfers live in the warehouse screen, filtered by the request they serve. */
export function documentLocation(kind: keyof TrackingDocuments, doc: TrackingDocument, documents: TrackingDocuments) {
  const id = String(doc.id);
  switch (kind) {
    case 'requests': return { path: '/purchases/requests', query: { id } };
    case 'consolidations': return { path: '/purchases/quotations/manage', query: { id } };
    case 'quotations': return { path: '/purchases/quotations', query: { id } };
    case 'orders': return { path: '/purchases/orders', query: { id } };
    case 'receipts': return { path: '/purchases/receipts', query: { id } };
    case 'retaceos': return { path: '/purchases/retaceos', query: { id } };
    case 'transfers': return { path: '/inventory/warehouse', query: documents.requests[0] ? { requestId: String(documents.requests[0].id) } : {} };
  }
}

const DOCUMENT_STATUS: Record<string, string> = {
  draft: 'Borrador', returned: 'Devuelta', submitted: 'Enviada a Compras', approved: 'Aprobada', rejected: 'Rechazada', in_quotation: 'En cotización', quoting: 'Cotizando',
  partially_ordered: 'Ordenada parcialmente', completed: 'Completada', cancelled: 'Cancelada', received: 'Recibida', in_procurement: 'En Compras',
  partially_distributed: 'Distribución parcial', fulfilled: 'Entregada a sucursal', under_review: 'En evaluación', selected: 'Seleccionada', expired: 'Vencida',
  pending_approval: 'Pendiente de aprobación', sent: 'Enviada al proveedor', partially_received: 'Recepción parcial', closed: 'Cerrada', pending_review: 'En revisión de Gerencia',
  calculated: 'Calculado', verified: 'Verificado',
  RECEIVED: 'Recibida', VERIFIED: 'Verificada', COSTED: 'Retaceada', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
  IN_TRANSIT: 'En tránsito', PARTIALLY_RECEIVED: 'Recibido parcialmente', COMPLETED: 'Entregado',
};
export const documentStatusLabel = (status: string) => DOCUMENT_STATUS[status] ?? status;

export function documentStatusVariant(status: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  const key = status.toLowerCase();
  if (['approved', 'selected', 'received', 'completed', 'closed', 'fulfilled', 'verified', 'costed'].includes(key)) return 'success';
  if (['rejected', 'cancelled', 'expired'].includes(key)) return 'danger';
  if (['pending_approval', 'pending_review', 'returned', 'in_transit', 'draft'].includes(key)) return 'warning';
  return 'neutral';
}

/** One-line description of the process for the page header, e.g. "PR-00012 · OC-00002 · RC-00002". */
export function processSummary(documents: TrackingDocuments) {
  const codes = [...documents.requests, ...documents.orders, ...documents.receipts].map(doc => doc.code);
  if (codes.length <= 4) return codes.join(' · ');
  return `${codes.slice(0, 4).join(' · ')} y ${codes.length - 4} más`;
}
