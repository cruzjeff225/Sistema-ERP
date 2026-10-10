// The single place that decides which button a request, an offer or an order shows as its main action.
// The view only executes the descriptor it gets back. When the document alone cannot tell what comes next
// (the purchase moved on in another screen), the decision comes from the process tracking step instead.
import { canOpenRoute, stepLocation, type TrackingStep } from './purchase-tracking';
import { nextOrderReceipt, receiptNextStep } from './purchase-workflow';

export type ActionSection = 'requests' | 'quotations' | 'orders';

type Behavior =
  | { kind: 'edit-request' }
  | { kind: 'workflow'; path: string; message: string }
  | { kind: 'new-quotation' }
  | { kind: 'new-order' }
  | { kind: 'receive' }
  | { kind: 'approval-tab' }
  | { kind: 'navigate'; path: string; query?: Record<string, string> };
export type DocumentAction = { label: string } & Behavior;

export type ActionContext = {
  can: (permission: string) => boolean;
  quoteExpired: boolean;
  hasPendingOrderLines: boolean;
  /** Next step of the whole purchase process, when it has been loaded. */
  processStep?: TrackingStep | null;
};

// A request in these statuses has left the branch: what comes next depends on the whole purchase, not on the request.
export const PROCESS_DRIVEN_REQUEST_STATUSES = ['submitted', 'approved', 'in_quotation', 'partially_ordered', 'in_procurement', 'partially_distributed', 'completed'];
export const needsProcessStep = (section: ActionSection, record: { status: string } | null) =>
  !!record && ((section === 'requests' && PROCESS_DRIVEN_REQUEST_STATUSES.includes(record.status)) || (section === 'orders' && record.status === 'received'));

const FINISHED = ['cancelled', 'expired', 'closed', 'fulfilled'];

export function documentAction(section: ActionSection, record: any, ctx: ActionContext): DocumentAction | null {
  if (!record || FINISHED.includes(record.status) || (record.status === 'rejected' && section !== 'requests')) return null;
  const { can } = ctx;
  const allow = (permission: string, action: DocumentAction): DocumentAction | null => (can(permission) ? action : null);
  // A step that belongs to a single request (sending a draft, for example) must not appear as the action of another one.
  const fromProcess = (): DocumentAction | null => {
    const step = ctx.processStep;
    if (!step || step.stage === 'requests' || !canOpenRoute(step.route, can)) return null;
    const { path, query } = stepLocation(step);
    return { label: step.label, kind: 'navigate', path, query };
  };

  if (section === 'requests') {
    if (record.status === 'rejected') return allow('purchase_requests.update', { label: 'Corregir solicitud', kind: 'edit-request' });
    if (record.status === 'draft') {
      return allow('purchase_requests.update', record.purpose
        ? { label: 'Enviar a Compras', kind: 'workflow', path: `/purchase-requests/${record.id}/submit`, message: 'Solicitud enviada a Compras' }
        : { label: 'Completar solicitud', kind: 'edit-request' });
    }
    if (PROCESS_DRIVEN_REQUEST_STATUSES.includes(record.status)) {
      const step = fromProcess();
      if (step) return step;
      if (record.status === 'partially_distributed' || record.status === 'completed') return allow('inventory.view', { label: 'Ver entregas a sucursal', kind: 'navigate', path: '/inventory/warehouse', query: { requestId: String(record.id) } });
      return allow('purchase_quotations.view', { label: 'Continuar en Cotizaciones', kind: 'new-quotation' });
    }
    return allow('inventory.view', { label: 'Ver entregas a sucursal', kind: 'navigate', path: '/inventory/warehouse', query: { requestId: String(record.id) } });
  }

  if (section === 'quotations') {
    const draft = record.status === 'draft';
    if (record.rfq) {
      return allow(draft ? 'purchase_quotations.update' : 'purchase_quotations.view', {
        label: draft ? 'Completar oferta' : 'Comparar y elegir productos', kind: 'navigate',
        path: draft ? '/purchases/quotations/manage' : '/purchases/comparison',
        query: { id: String(record.rfq.consolidationId), ...(draft ? { rfqId: String(record.rfq.id) } : {}) },
      });
    }
    if (draft) return allow('purchase_quotations.update', { label: 'Confirmar oferta recibida', kind: 'workflow', path: `/purchase-quotations/${record.id}/receive`, message: 'Oferta recibida' });
    if (['received', 'under_review'].includes(record.status) && !ctx.quoteExpired) return allow('purchase_quotations.select', { label: 'Elegir oferta', kind: 'workflow', path: `/purchase-quotations/${record.id}/select`, message: 'Oferta seleccionada' });
    if (record.status === 'selected' && ctx.hasPendingOrderLines && !ctx.quoteExpired) return allow('purchase_orders.create', { label: 'Crear orden de compra', kind: 'new-order' });
    return null;
  }

  // Orders
  if (record.status === 'returned') return allow('purchase_orders.update', { label: 'Revisar observaciones', kind: 'approval-tab' });
  if (record.status === 'draft') return allow('purchase_orders.update', { label: 'Enviar a Gerencia', kind: 'workflow', path: `/purchase-orders/${record.id}/submit`, message: 'Orden enviada a aprobación' });
  if (record.status === 'pending_approval') return allow('purchase_orders.approve', { label: 'Revisar para aprobar', kind: 'approval-tab' });
  if (record.status === 'approved') return allow('purchase_orders.send', { label: 'Marcar enviada al proveedor', kind: 'workflow', path: `/purchase-orders/${record.id}/send`, message: 'Orden enviada' });
  const receipt = nextOrderReceipt(record.purchases);
  if (['partially_received', 'received'].includes(record.status) && receipt) {
    const step = receiptNextStep(receipt).step;
    if (step === 'placement' && can('inventory.view') && can('purchases.view')) return allow('inventory.view', { label: 'Ubicar productos', kind: 'navigate', path: '/inventory/warehouse', query: { purchaseId: String(receipt.id) } });
    if (step === 'cost' && can('retaceos.view')) return allow('retaceos.view', { label: 'Continuar en Retaceo', kind: 'navigate', path: '/purchases/retaceos', query: { purchaseId: String(receipt.id) } });
    return allow('purchases.view', { label: step === 'verify' ? 'Verificar recepción' : step === 'close' ? 'Cerrar recepción' : 'Ver recepción pendiente', kind: 'navigate', path: '/purchases/receipts', query: { id: String(receipt.id) } });
  }
  if (['sent', 'partially_received'].includes(record.status)) return allow(can('purchase_orders.receive') ? 'purchase_orders.receive' : 'purchases.create', { label: 'Registrar recepción', kind: 'receive' });
  // Fully received and every receipt closed: only the rest of the purchase (distribution, delivery) is left.
  if (record.status === 'received') return fromProcess();
  return null;
}
