// Pure rules for the purchase tracking view. It receives a plain snapshot of every document that belongs to one
// purchase process and returns the stage timeline plus the next step. No database access here so it can be tested.
//
// The process chain follows the target data model: request -> quotation -> order -> receipt -> retaceo.
// Consolidations, supplier RFQs and transfers are extensions; their stages are skipped when no data exists.

export type StageId = 'requests' | 'quantities' | 'quotation' | 'order' | 'reception' | 'costs' | 'distribution' | 'delivery';
export type StageState = 'pending' | 'in_progress' | 'complete' | 'skipped';
export type Owner = 'Sucursal' | 'Compras' | 'Gerencia' | 'Bodega' | 'Administración';

export type TrackingStep = { stage: StageId; owner: Owner; label: string; route: string; query?: Record<string, string> };
export type TrackingStage = { id: StageId; label: string; owner: Owner; state: StageState; progress?: { done: number; total: number } };
export type TrackingLine = {
  productId: number; name: string; unit: string;
  requested: number; decided: number | null; purchased: number; received: number;
  /** Received quantity already placed in a space: only that stock can be dispatched. */
  placed: number; dispatched: number; delivered: number;
};

export type TrackingSnapshot = {
  generalWarehouseConfigured: boolean;
  requests: { id: number; code: string; status: string; requested: number; dispatched: number; delivered: number }[];
  consolidations: { id: number; code: string; reviewStatus: string; quantitiesApproved: boolean }[];
  rfqs: { id: number; consolidationId: number; hasOffer: boolean }[];
  quotations: { id: number; code: string; status: string }[];
  orders: { id: number; code: string; status: string; consolidationId: number | null }[];
  receipts: { id: number; code: string; status: string; orderId: number; pendingPlacement: boolean; retaceoStatus: string | null; retaceoArchived: boolean }[];
  transfers: { id: number; code: string; status: string }[];
  lines: TrackingLine[];
};

export type TrackingResult = {
  stages: TrackingStage[];
  nextStep: TrackingStep | null;
  alsoAvailable: TrackingStep[];
  blockers: { label: string; owner: Owner; route: string }[];
  completed: boolean;
};

const DEAD_REQUEST = ['cancelled'];
const DEAD_ORDER = ['cancelled', 'rejected'];
const ORDER_SENT = ['sent', 'partially_received', 'received', 'closed'];
const ORDER_RECEIVED = ['received', 'closed'];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const EPS = 0.0001;

const STAGE_META: Record<StageId, { label: string; owner: Owner }> = {
  requests: { label: 'Solicitudes', owner: 'Sucursal' },
  quantities: { label: 'Cantidades', owner: 'Gerencia' },
  quotation: { label: 'Cotización', owner: 'Compras' },
  order: { label: 'Orden', owner: 'Gerencia' },
  reception: { label: 'Recepción', owner: 'Bodega' },
  costs: { label: 'Costos', owner: 'Compras' },
  distribution: { label: 'Distribución', owner: 'Bodega' },
  delivery: { label: 'Entrega', owner: 'Sucursal' },
};
export const STAGE_ORDER = Object.keys(STAGE_META) as StageId[];

type StageOutcome = { state: StageState; steps: TrackingStep[]; progress?: { done: number; total: number } };

function step(stage: StageId, owner: Owner, label: string, route: string, query?: Record<string, string>): TrackingStep {
  return { stage, owner, label, route, ...(query ? { query } : {}) };
}

export function computeTracking(snapshot: TrackingSnapshot): TrackingResult {
  const requests = snapshot.requests.filter(r => !DEAD_REQUEST.includes(r.status));
  const orders = snapshot.orders.filter(o => !DEAD_ORDER.includes(o.status));
  const receipts = snapshot.receipts.filter(r => r.status !== 'CANCELLED');
  const consolidation = snapshot.consolidations[0];
  const consolidationId = consolidation?.id;
  const requestedTotal = sum(snapshot.lines.map(l => l.requested));
  const receivedTotal = sum(snapshot.lines.map(l => l.received));
  const out = {} as Record<StageId, StageOutcome>;

  // 1. Requests -------------------------------------------------------------------------------------------------
  {
    const open = requests.filter(r => ['draft', 'rejected', 'returned'].includes(r.status));
    const steps = open.map(r => r.status === 'draft'
      ? step('requests', 'Sucursal', `Enviar la solicitud ${r.code} a Compras`, '/purchases/requests', { id: String(r.id) })
      : step('requests', 'Sucursal', `Corregir la solicitud ${r.code}`, '/purchases/requests', { id: String(r.id) }));
    out.requests = { state: !requests.length ? 'pending' : open.length ? 'in_progress' : 'complete', steps, progress: { done: requests.length - open.length, total: requests.length } };
  }
  const requestsReady = out.requests.state === 'complete';

  // 2. Quantities (extension: consolidation) -------------------------------------------------------------------
  {
    const downstream = snapshot.quotations.length > 0 || orders.length > 0;
    if (!snapshot.consolidations.length) {
      out.quantities = downstream || !requestsReady
        ? { state: downstream ? 'skipped' : 'pending', steps: [] }
        : { state: 'pending', steps: [step('quantities', 'Compras', 'Reunir las solicitudes en una gestión de cotización', '/purchases/quotations/manage', { requestId: String(requests[0]?.id ?? '') })] };
    } else {
      const open = snapshot.consolidations.filter(c => !c.quantitiesApproved);
      const steps = open.map(c => c.reviewStatus === 'pending_review'
        ? step('quantities', 'Gerencia', 'Revisar y autorizar las cantidades a comprar', '/purchases/quotations/manage', { id: String(c.id) })
        : c.reviewStatus === 'returned'
          ? step('quantities', 'Compras', 'Corregir las cantidades devueltas por Gerencia', '/purchases/quotations/manage', { id: String(c.id) })
          : step('quantities', 'Compras', 'Enviar las cantidades a Gerencia', '/purchases/quotations/manage', { id: String(c.id) }));
      out.quantities = { state: open.length ? 'in_progress' : 'complete', steps, progress: { done: snapshot.consolidations.length - open.length, total: snapshot.consolidations.length } };
    }
  }
  const quantitiesReady = out.quantities.state === 'complete' || out.quantities.state === 'skipped';

  // 3. Quotation ------------------------------------------------------------------------------------------------
  {
    const decidedLines = snapshot.lines.filter(l => l.decided !== null);
    const uncovered = decidedLines.filter(l => l.purchased + EPS < (l.decided ?? 0));
    const covered = consolidation ? decidedLines.length > 0 && !uncovered.length : orders.length > 0;
    const steps: TrackingStep[] = [];
    let state: StageState = 'pending';
    if (covered) state = 'complete';
    else if (requestsReady && quantitiesReady) {
      const offers = snapshot.rfqs.filter(r => r.hasOffer);
      const waiting = snapshot.rfqs.length - offers.length;
      if (consolidationId !== undefined) {
        const q = { id: String(consolidationId) };
        if (!snapshot.rfqs.length) steps.push(step('quotation', 'Compras', 'Preparar la solicitud de precios a los proveedores', '/purchases/quotations/manage', q));
        else {
          if (waiting > 0) steps.push(step('quotation', 'Compras', `Registrar la oferta de ${waiting} ${waiting === 1 ? 'proveedor' : 'proveedores'}`, '/purchases/quotations/manage', q));
          if (offers.length) steps.push(step('quotation', 'Compras', uncovered.length && orders.length ? 'Comparar ofertas para los productos pendientes' : 'Comparar ofertas y elegir proveedor', '/purchases/comparison', q));
        }
        state = snapshot.rfqs.length ? 'in_progress' : 'pending';
      } else {
        // Historical flow: direct quotations without a consolidation.
        for (const q of snapshot.quotations) {
          if (q.status === 'draft') steps.push(step('quotation', 'Compras', `Confirmar la oferta ${q.code}`, '/purchases/quotations', { id: String(q.id) }));
          else if (['received', 'under_review'].includes(q.status)) steps.push(step('quotation', 'Compras', `Elegir la oferta ${q.code}`, '/purchases/quotations', { id: String(q.id) }));
          else if (q.status === 'selected') steps.push(step('quotation', 'Compras', `Crear la orden de compra desde ${q.code}`, '/purchases/quotations', { id: String(q.id) }));
        }
        if (!snapshot.quotations.length) steps.push(step('quotation', 'Compras', 'Registrar la cotización del proveedor', '/purchases/quotations'));
        state = snapshot.quotations.length ? 'in_progress' : 'pending';
      }
    }
    out.quotation = { state, steps, progress: consolidation && decidedLines.length ? { done: decidedLines.length - uncovered.length, total: decidedLines.length } : undefined };
  }

  // 4. Order ----------------------------------------------------------------------------------------------------
  {
    const open = orders.filter(o => !ORDER_SENT.includes(o.status));
    const steps = open.map(o => {
      const q = { id: String(o.id) };
      if (o.status === 'pending_approval') return step('order', 'Gerencia', `Aprobar la orden ${o.code}`, '/purchases/orders', q);
      if (o.status === 'approved') return step('order', 'Compras', `Marcar la orden ${o.code} como enviada al proveedor`, '/purchases/orders', q);
      if (o.status === 'returned') return step('order', 'Compras', `Corregir la orden ${o.code} devuelta por Gerencia`, '/purchases/orders', q);
      return step('order', 'Compras', `Enviar la orden ${o.code} a Gerencia`, '/purchases/orders', q);
    });
    out.order = { state: !orders.length ? 'pending' : open.length ? 'in_progress' : 'complete', steps, progress: { done: orders.length - open.length, total: orders.length } };
  }

  // 5. Reception and placement ----------------------------------------------------------------------------------
  {
    const sent = orders.filter(o => ORDER_SENT.includes(o.status));
    const stepsHere: TrackingStep[] = [];
    for (const r of receipts) {
      if (r.pendingPlacement) stepsHere.push(step('reception', 'Bodega', `Ubicar los productos de ${r.code}`, '/inventory/warehouse', { purchaseId: String(r.id) }));
      else if (r.status === 'RECEIVED') stepsHere.push(step('reception', 'Bodega', `Verificar la recepción ${r.code}`, '/purchases/receipts', { id: String(r.id) }));
    }
    for (const o of sent.filter(o => !ORDER_RECEIVED.includes(o.status))) {
      stepsHere.push(step('reception', 'Bodega', `Registrar la recepción de la orden ${o.code}`, '/purchases/orders', { id: String(o.id) }));
    }
    const allReceived = sent.length > 0 && sent.length === orders.length && sent.every(o => ORDER_RECEIVED.includes(o.status));
    const receiptsSettled = receipts.every(r => !r.pendingPlacement && r.status !== 'RECEIVED');
    const state: StageState = !sent.length ? 'pending' : allReceived && receiptsSettled ? 'complete' : 'in_progress';
    const purchased = sum(snapshot.lines.map(l => l.purchased));
    out.reception = { state, steps: stepsHere, progress: purchased > 0 ? { done: Math.min(receivedTotal, purchased), total: purchased } : undefined };
  }

  // 6. Costs (retaceo) ------------------------------------------------------------------------------------------
  {
    const closed = receipts.filter(r => r.status === 'CLOSED');
    const steps: TrackingStep[] = [];
    for (const r of receipts) {
      if (r.status === 'CLOSED' || r.status === 'RECEIVED' || r.pendingPlacement) continue;
      const q = { purchaseId: String(r.id) };
      if (r.retaceoArchived && r.retaceoStatus !== 'closed') steps.push(step('costs', 'Compras', `Restaurar el retaceo de ${r.code} desde la papelera`, '/administration/trash'));
      else if (r.retaceoStatus === 'closed' || r.status === 'COSTED') steps.push(step('costs', 'Compras', `Cerrar la recepción ${r.code}`, '/purchases/receipts', { id: String(r.id) }));
      else steps.push(step('costs', 'Compras', r.retaceoStatus ? `Terminar el retaceo de ${r.code}` : `Hacer el retaceo de ${r.code}`, '/purchases/retaceos', q));
    }
    out.costs = { state: !receipts.length ? 'pending' : closed.length === receipts.length ? 'complete' : steps.length || closed.length ? 'in_progress' : 'pending', steps, progress: receipts.length ? { done: closed.length, total: receipts.length } : undefined };
  }

  // 7. Distribution to branches (extension: transfers) ---------------------------------------------------------
  {
    const needing = snapshot.lines.filter(l => l.requested > 0);
    const dispatchedAll = needing.length > 0 && needing.every(l => l.dispatched + EPS >= l.requested);
    const dispatchable = needing.some(l => Math.min(l.requested - l.dispatched, l.placed - l.dispatched) > EPS);
    const target = requests.find(r => r.dispatched + EPS < r.requested);
    const steps = dispatchable && target ? [step('distribution', 'Bodega', 'Despachar los productos recibidos a la sucursal', '/inventory/warehouse', { requestId: String(target.id) })] : [];
    const state: StageState = !requests.length || !requestedTotal ? 'skipped' : dispatchedAll ? 'complete' : receivedTotal > 0 ? 'in_progress' : 'pending';
    out.distribution = { state, steps, progress: requestedTotal ? { done: Math.min(sum(needing.map(l => l.dispatched)), requestedTotal), total: requestedTotal } : undefined };
  }

  // 8. Delivery to the branch -----------------------------------------------------------------------------------
  {
    const needing = snapshot.lines.filter(l => l.requested > 0);
    const deliveredAll = needing.length > 0 && needing.every(l => l.delivered + EPS >= l.requested);
    const inTransit = requests.find(r => r.dispatched > r.delivered + EPS);
    const steps = inTransit ? [step('delivery', 'Sucursal', 'Recibir en la sucursal los productos en tránsito', '/inventory/warehouse', { requestId: String(inTransit.id) })] : [];
    const state: StageState = !requests.length || !requestedTotal ? 'skipped' : deliveredAll ? 'complete' : inTransit ? 'in_progress' : 'pending';
    out.delivery = { state, steps, progress: requestedTotal ? { done: Math.min(sum(needing.map(l => l.delivered)), requestedTotal), total: requestedTotal } : undefined };
  }

  const stages: TrackingStage[] = STAGE_ORDER.map(id => ({ id, label: STAGE_META[id].label, owner: ownerOf(id, out[id]), state: out[id].state, ...(out[id].progress ? { progress: out[id].progress } : {}) }));
  const steps = STAGE_ORDER.flatMap(id => out[id].steps);

  const blockers: TrackingResult['blockers'] = [];
  if (!snapshot.generalWarehouseConfigured && steps.length) {
    blockers.push({ label: 'Falta configurar el centro general de recepción', owner: 'Administración', route: '/administration/settings/warehouse' });
  }
  const completed = STAGE_ORDER.every(id => ['complete', 'skipped'].includes(out[id].state)) && requests.length > 0;
  return { stages, nextStep: steps[0] ?? null, alsoAvailable: steps.slice(1, 5), blockers, completed };
}

// The responsible team is the owner of the step in progress, not a fixed one per stage.
function ownerOf(id: StageId, outcome: StageOutcome): Owner {
  return outcome.steps[0]?.owner ?? STAGE_META[id].owner;
}

export type ProcessSummary = { stagesDone: number; stagesTotal: number; currentStage: { id: StageId; label: string } | null };

/** Compact progress for lists: how many applicable stages are complete and which one is current. */
export function summarizeTracking(result: TrackingResult): ProcessSummary {
  const applicable = result.stages.filter(stage => stage.state !== 'skipped');
  const done = applicable.filter(stage => stage.state === 'complete').length;
  const current = result.completed ? null : result.stages.find(stage => stage.id === result.nextStep?.stage) ?? result.stages.find(stage => stage.state === 'in_progress' || stage.state === 'pending') ?? null;
  return { stagesDone: done, stagesTotal: applicable.length, currentStage: current ? { id: current.id, label: current.label } : null };
}

/** Group documents into processes: every pair of linked keys ends up in the same group (union-find). */
export function groupLinked(keys: string[], links: [string, string][]): string[][] {
  const parent = new Map<string, string>(keys.map(key => [key, key]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    for (let node = key; node !== root;) { const next = parent.get(node)!; parent.set(node, root); node = next; }
    return root;
  };
  for (const [a, b] of links) {
    if (!parent.has(a) || !parent.has(b)) continue; // a link to a deleted or foreign document does not join anything
    const rootA = find(a), rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }
  const groups = new Map<string, string[]>();
  for (const key of keys) { const root = find(key); groups.set(root, [...(groups.get(root) ?? []), key]); }
  return [...groups.values()];
}
