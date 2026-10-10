import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTracking, TrackingSnapshot } from '../src/modules/purchases/application/services/purchase-tracking';

const line = (o: Partial<TrackingSnapshot['lines'][number]> = {}) => { const row = { productId: 1, name: 'Lámina', unit: 'Pieza', requested: 100, decided: 120, purchased: 0, received: 0, placed: o.received ?? 0, dispatched: 0, delivered: 0, ...o }; return row; };
const base = (o: Partial<TrackingSnapshot> = {}): TrackingSnapshot => ({
  generalWarehouseConfigured: true,
  requests: [{ id: 3, code: 'PR-00003', status: 'in_procurement', requested: 100, dispatched: 0, delivered: 0 }],
  consolidations: [{ id: 1, code: 'GC-1', reviewStatus: 'approved', quantitiesApproved: true }],
  rfqs: [], quotations: [], orders: [], receipts: [], transfers: [], lines: [line()], ...o,
});
const order = (status: string, id = 2) => ({ id, code: `OC-0000${id}`, status, consolidationId: 1 });
const receipt = (o: Partial<TrackingSnapshot['receipts'][number]> = {}) => ({ id: 2, code: 'RC-00002', status: 'RECEIVED', orderId: 2, pendingPlacement: false, retaceoStatus: null, retaceoArchived: false, ...o });
const stage = (r: ReturnType<typeof computeTracking>, id: string) => r.stages.find(s => s.id === id)!;

test('solicitud en borrador: Sucursal debe enviarla a Compras', () => {
  const r = computeTracking(base({ requests: [{ id: 3, code: 'PR-00003', status: 'draft', requested: 100, dispatched: 0, delivered: 0 }], consolidations: [] }));
  assert.equal(r.nextStep?.owner, 'Sucursal');
  assert.match(r.nextStep!.label, /Enviar la solicitud PR-00003/);
  assert.equal(stage(r, 'requests').state, 'in_progress');
  assert.equal(r.completed, false);
});

test('solicitud enviada sin gestión: Compras debe reunirla en una gestión', () => {
  const r = computeTracking(base({ requests: [{ id: 3, code: 'PR-00003', status: 'submitted', requested: 100, dispatched: 0, delivered: 0 }], consolidations: [] }));
  assert.equal(r.nextStep?.owner, 'Compras');
  assert.match(r.nextStep!.label, /gestión de cotización/);
  assert.deepEqual(r.nextStep!.query, { requestId: '3' });
});

test('cantidades: Compras envía, Gerencia autoriza, Compras corrige si las devuelven', () => {
  const draft = computeTracking(base({ consolidations: [{ id: 1, code: 'GC-1', reviewStatus: 'draft', quantitiesApproved: false }] }));
  assert.equal(draft.nextStep?.owner, 'Compras'); assert.match(draft.nextStep!.label, /Enviar las cantidades a Gerencia/);
  const pending = computeTracking(base({ consolidations: [{ id: 1, code: 'GC-1', reviewStatus: 'pending_review', quantitiesApproved: false }] }));
  assert.equal(pending.nextStep?.owner, 'Gerencia'); assert.match(pending.nextStep!.label, /autorizar las cantidades/);
  const returned = computeTracking(base({ consolidations: [{ id: 1, code: 'GC-1', reviewStatus: 'returned', quantitiesApproved: false }] }));
  assert.equal(returned.nextStep?.owner, 'Compras'); assert.match(returned.nextStep!.label, /Corregir las cantidades/);
  assert.equal(stage(pending, 'quotation').state, 'pending', 'no se cotiza antes de autorizar');
  assert.equal(pending.stages.find(s => s.id === 'quantities')!.owner, 'Gerencia');
});

test('cotización: preparar solicitud, registrar ofertas pendientes y comparar', () => {
  assert.match(computeTracking(base()).nextStep!.label, /Preparar la solicitud de precios/);
  const waiting = computeTracking(base({ rfqs: [{ id: 1, consolidationId: 1, hasOffer: false }, { id: 2, consolidationId: 1, hasOffer: true }] }));
  assert.match(waiting.nextStep!.label, /Registrar la oferta de 1 proveedor/);
  assert.match(waiting.alsoAvailable[0].label, /Comparar ofertas/);
  const compare = computeTracking(base({ rfqs: [{ id: 1, consolidationId: 1, hasOffer: true }] }));
  assert.equal(compare.nextStep?.route, '/purchases/comparison');
});

test('órdenes: Gerencia aprueba, Compras marca enviada, Bodega recibe', () => {
  const lines = [line({ purchased: 120 })];
  const approve = computeTracking(base({ orders: [order('pending_approval')], lines }));
  assert.equal(approve.nextStep?.owner, 'Gerencia'); assert.match(approve.nextStep!.label, /Aprobar la orden OC-00002/);
  const send = computeTracking(base({ orders: [order('approved')], lines }));
  assert.match(send.nextStep!.label, /Marcar la orden OC-00002 como enviada/);
  const receive = computeTracking(base({ orders: [order('sent')], lines }));
  assert.equal(receive.nextStep?.owner, 'Bodega'); assert.match(receive.nextStep!.label, /Registrar la recepción de la orden/);
  assert.equal(stage(receive, 'order').state, 'complete');
});

test('órdenes canceladas o rechazadas no cuentan como compra', () => {
  const r = computeTracking(base({ orders: [order('cancelled')], lines: [line({ purchased: 0 })], rfqs: [{ id: 1, consolidationId: 1, hasOffer: true }] }));
  assert.equal(stage(r, 'order').state, 'pending');
  assert.equal(stage(r, 'quotation').state, 'in_progress');
});

test('compra parcial: faltan productos por comprar y se vuelve a comparar', () => {
  const r = computeTracking(base({ orders: [order('pending_approval')], lines: [line({ purchased: 60, decided: 120 })], rfqs: [{ id: 1, consolidationId: 1, hasOffer: true }] }));
  assert.equal(stage(r, 'quotation').state, 'in_progress');
  assert.match(r.nextStep!.label, /productos pendientes/);
  assert.match(r.alsoAvailable[0].label, /Aprobar la orden/);
});

test('recepción: ubicar, verificar y luego costos', () => {
  const lines = [line({ purchased: 120, received: 70 })];
  const orders = [order('partially_received')];
  const place = computeTracking(base({ orders, lines, receipts: [receipt({ pendingPlacement: true })] }));
  assert.match(place.nextStep!.label, /Ubicar los productos de RC-00002/);
  assert.deepEqual(place.nextStep!.query, { purchaseId: '2' });
  assert.match(place.alsoAvailable[0].label, /Registrar la recepción de la orden/, 'sigue esperando el resto de la entrega');
  const verify = computeTracking(base({ orders, lines, receipts: [receipt()] }));
  assert.match(verify.nextStep!.label, /Verificar la recepción RC-00002/);
  const cost = computeTracking(base({ orders: [order('received')], lines, receipts: [receipt({ status: 'VERIFIED' })] }));
  assert.equal(cost.nextStep?.owner, 'Compras'); assert.match(cost.nextStep!.label, /Hacer el retaceo de RC-00002/);
  assert.equal(stage(cost, 'reception').state, 'complete');
});

test('costos: retaceo en curso, cerrado y recepción lista para cerrar; archivado pide restaurar', () => {
  const o = [order('received')]; const l = [line({ purchased: 120, received: 120 })];
  const draft = computeTracking(base({ orders: o, lines: l, receipts: [receipt({ status: 'VERIFIED', retaceoStatus: 'draft' })] }));
  assert.match(draft.nextStep!.label, /Terminar el retaceo/);
  const closed = computeTracking(base({ orders: o, lines: l, receipts: [receipt({ status: 'VERIFIED', retaceoStatus: 'closed' })] }));
  assert.match(closed.nextStep!.label, /Cerrar la recepción RC-00002/);
  const archived = computeTracking(base({ orders: o, lines: l, receipts: [receipt({ status: 'VERIFIED', retaceoStatus: 'draft', retaceoArchived: true })] }));
  assert.match(archived.nextStep!.label, /Restaurar el retaceo/);
});

test('distribución y entrega a la sucursal hasta completar el proceso', () => {
  const o = [order('received')];
  const closedReceipt = [receipt({ status: 'CLOSED', retaceoStatus: 'closed' })];
  const stock = computeTracking(base({ orders: o, receipts: closedReceipt, lines: [line({ purchased: 120, received: 120 })] }));
  assert.equal(stock.nextStep?.owner, 'Bodega'); assert.match(stock.nextStep!.label, /Despachar/);
  assert.deepEqual(stock.nextStep!.query, { requestId: '3' });
  assert.equal(stage(stock, 'costs').state, 'complete');

  const transit = computeTracking(base({ orders: o, receipts: closedReceipt, lines: [line({ purchased: 120, received: 120, dispatched: 100 })],
    requests: [{ id: 3, code: 'PR-00003', status: 'partially_distributed', requested: 100, dispatched: 100, delivered: 0 }] }));
  assert.equal(transit.nextStep?.owner, 'Sucursal'); assert.match(transit.nextStep!.label, /Recibir en la sucursal/);
  assert.equal(stage(transit, 'distribution').state, 'complete');

  const done = computeTracking(base({ orders: o, receipts: closedReceipt, lines: [line({ purchased: 120, received: 120, dispatched: 100, delivered: 100 })],
    requests: [{ id: 3, code: 'PR-00003', status: 'fulfilled', requested: 100, dispatched: 100, delivered: 100 }] }));
  assert.equal(done.completed, true);
  assert.equal(done.nextStep, null);
  assert.ok(done.stages.every(s => s.state === 'complete'));
});

test('no se despacha lo que todavía no se ha recibido', () => {
  const r = computeTracking(base({ orders: [order('sent')], lines: [line({ purchased: 120, received: 0 })] }));
  assert.equal(stage(r, 'distribution').state, 'pending');
  assert.ok(!r.alsoAvailable.some(s => s.stage === 'distribution'));
});

test('flujo histórico sin gestión: la etapa de cantidades se omite', () => {
  const r = computeTracking(base({ consolidations: [], quotations: [{ id: 9, code: 'COT-9', status: 'selected' }], lines: [line({ decided: null })] }));
  assert.equal(stage(r, 'quantities').state, 'skipped');
  assert.match(r.nextStep!.label, /Crear la orden de compra desde COT-9/);
});

test('centro general sin configurar aparece como bloqueo con enlace a la configuración', () => {
  const r = computeTracking(base({ generalWarehouseConfigured: false, requests: [{ id: 3, code: 'PR-00003', status: 'draft', requested: 100, dispatched: 0, delivered: 0 }], consolidations: [] }));
  assert.equal(r.blockers.length, 1);
  assert.equal(r.blockers[0].owner, 'Administración');
  assert.equal(r.blockers[0].route, '/administration/settings/warehouse');
  assert.equal(computeTracking(base({ generalWarehouseConfigured: false, requests: [{ id: 3, code: 'PR-00003', status: 'fulfilled', requested: 100, dispatched: 100, delivered: 100 }],
    orders: [order('received')], receipts: [receipt({ status: 'CLOSED' })], lines: [line({ purchased: 120, received: 120, dispatched: 100, delivered: 100 })] })).blockers.length, 0, 'sin pasos pendientes no hay bloqueo');
});

test('el progreso numérico refleja cantidades reales', () => {
  const r = computeTracking(base({ orders: [order('partially_received')], lines: [line({ purchased: 120, received: 70 })], receipts: [receipt({ status: 'VERIFIED' })] }));
  assert.deepEqual(stage(r, 'reception').progress, { done: 70, total: 120 });
  assert.equal(stage(r, 'reception').state, 'in_progress');
});

test('mercadería recibida pero sin ubicar no se ofrece para despacho', () => {
  const r = computeTracking(base({ orders: [order('received')], lines: [line({ purchased: 120, received: 120, placed: 0 })], receipts: [receipt({ pendingPlacement: true })] }));
  assert.ok(!r.nextStep!.label.includes('Despachar'));
  assert.ok(!r.alsoAvailable.some(s => s.stage === 'distribution'));
  const placed = computeTracking(base({ orders: [order('received')], lines: [line({ purchased: 120, received: 120, placed: 70 })], receipts: [receipt({ status: 'VERIFIED' })] }));
  assert.ok(placed.alsoAvailable.some(s => s.stage === 'distribution'), 'lo ubicado sí puede despacharse');
});
