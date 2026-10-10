// Rules and links shared by the purchase request screens (the list with its side panel and the full detail page).
import type { Tracking, TrackingStep } from './purchase-tracking';

/** A request can be edited while it has not reached Purchasing, or after Purchasing sends it back. */
export const isEditableRequest = (status: string) => ['draft', 'rejected'].includes(status);
export const canCancelRequest = (status: string) => ['draft', 'submitted', 'approved', 'in_quotation', 'partially_ordered'].includes(status);
/** Deliveries to the branch only make sense once the request has left the branch. */
export const hasBranchDeliveries = (status: string) => !['draft', 'rejected', 'cancelled'].includes(status);

export const requestDetailPath = (id: number) => `/purchases/requests/${id}`;
export const requestListLocation = (id?: number) => ({ path: '/purchases/requests', query: id ? { id: String(id) } : {} });
/** Opens the edit panel of the list screen and comes back to the detail page when it closes. */
export const requestEditLocation = (id: number, options: { addLine?: boolean } = {}) => ({ path: '/purchases/requests', query: { id: String(id), edit: '1', from: 'detail', ...(options.addLine ? { addLine: '1' } : {}) } });

type RequestWithSources = { id: number; details?: { consolidationSources?: { line?: { consolidationId?: number } }[] }[] };
/** Where Purchasing continues a request: its quotation management when it already has one, otherwise a new one. */
export function quotationEntryLocation(request: RequestWithSources) {
  const consolidationId = request.details?.flatMap(detail => detail.consolidationSources ?? [])[0]?.line?.consolidationId;
  return { path: '/purchases/quotations/manage', query: consolidationId ? { id: String(consolidationId) } : { requestId: String(request.id) } };
}

type TransferLine = { transferItems?: { quantity: number | string; receivedQuantity: number | string }[] };
/** Quantity already dispatched (`quantity`) or already received by the branch (`receivedQuantity`) for a request line. */
export function deliveredQuantity(line: TransferLine, field: 'quantity' | 'receivedQuantity') {
  return Math.round((line.transferItems ?? []).reduce((total, item) => total + Number(item[field]), 0) * 100) / 100;
}

/** What the headers need from the tracking of the whole purchase: the next step and where the purchase stands. */
export function processSnapshot(tracking: Pick<Tracking, 'stages' | 'nextStep'>): { step: TrackingStep | null; info: { stage: string; done: number; total: number } | null } {
  const applicable = tracking.stages.filter(stage => stage.state !== 'skipped');
  const current = tracking.stages.find(stage => stage.id === tracking.nextStep?.stage) ?? applicable.find(stage => stage.state !== 'complete');
  return {
    step: tracking.nextStep,
    info: current ? { stage: current.label, done: applicable.filter(stage => stage.state === 'complete').length, total: applicable.length } : null,
  };
}

/** The step that belongs to the branch while the request is still in its hands; later steps come from the purchase tracking. */
export function requestNextStep(status: string): { label: string; owner: 'Sucursal'; hint: string } | null {
  if (status === 'draft') return { label: 'Enviar la solicitud a Compras', owner: 'Sucursal', hint: 'La solicitud está en borrador y pendiente de envío. Una vez completada la información y los productos, puedes enviarla al área de Compras.' };
  if (status === 'rejected') return { label: 'Corregir la solicitud', owner: 'Sucursal', hint: 'La solicitud necesita correcciones. Revisa la información y los productos y vuelve a enviarla a Compras.' };
  return null;
}

export type RequestStatusIcon = 'draft' | 'sent' | 'progress' | 'delivered' | 'cancelled' | 'attention';
/** Which icon represents the status of a request, so the state is recognisable without reading the label. */
export function requestStatusIcon(status: string): RequestStatusIcon {
  if (status === 'draft') return 'draft';
  if (status === 'rejected') return 'attention';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'fulfilled') return 'delivered';
  if (['submitted', 'approved'].includes(status)) return 'sent';
  return 'progress';
}
