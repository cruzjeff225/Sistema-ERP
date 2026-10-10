import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentAction, needsProcessStep, type ActionContext } from '../src/utils/purchase-next-action';

const all = () => true;
const ctx = (o: Partial<ActionContext> = {}): ActionContext => ({ can: all, quoteExpired: false, hasPendingOrderLines: true, processStep: null, ...o });
const only = (...granted: string[]) => (permission: string) => granted.includes(permission);
const step = (o = {}) => ({ stage: 'distribution', owner: 'Bodega' as const, label: 'Despachar los productos recibidos a la sucursal', route: '/inventory/warehouse', query: { requestId: '3' }, ...o });

test('solicitud en borrador: enviar si está completa, completar si falta la finalidad, corregir si la rechazaron', () => {
  assert.deepEqual(documentAction('requests', { id: 3, status: 'draft', purpose: 'resale' }, ctx()), { label: 'Enviar a Compras', kind: 'workflow', path: '/purchase-requests/3/submit', message: 'Solicitud enviada a Compras' });
  assert.deepEqual(documentAction('requests', { id: 3, status: 'draft' }, ctx()), { label: 'Completar solicitud', kind: 'edit-request' });
  assert.deepEqual(documentAction('requests', { id: 3, status: 'rejected' }, ctx()), { label: 'Corregir solicitud', kind: 'edit-request' });
  assert.equal(documentAction('requests', { id: 3, status: 'draft', purpose: 'resale' }, ctx({ can: only('purchase_requests.view') })), null, 'sin permiso no hay acción');
});

test('solicitud ya enviada sin información del proceso conserva el acceso a cotizaciones', () => {
  const action = documentAction('requests', { id: 3, status: 'in_procurement' }, ctx());
  assert.equal(action?.label, 'Continuar en Cotizaciones');
  assert.equal(action?.kind, 'new-quotation');
  assert.equal(documentAction('requests', { id: 3, status: 'submitted' }, ctx({ can: only('inventory.view') })), null);
});

test('solicitud en curso: el siguiente paso de la compra reemplaza al botón desactualizado', () => {
  const action = documentAction('requests', { id: 3, status: 'in_procurement' }, ctx({ processStep: step() }));
  assert.deepEqual(action, { label: 'Continuar en bodega', detail: 'Despachar los productos recibidos a la sucursal', kind: 'navigate', path: '/inventory/warehouse', query: { requestId: '3' } });
});

test('un paso de otra solicitud o sin acceso a su pantalla no se ofrece como acción de esta', () => {
  const sendOther = step({ stage: 'requests', label: 'Enviar la solicitud PR-2 a Compras', route: '/purchases/requests', query: { id: '2' } });
  assert.equal(documentAction('requests', { id: 3, status: 'in_procurement' }, ctx({ processStep: sendOther }))?.label, 'Continuar en Cotizaciones');
  const withoutAccess = documentAction('requests', { id: 3, status: 'in_procurement' }, ctx({ can: only('purchase_quotations.view'), processStep: step() }));
  assert.equal(withoutAccess?.label, 'Continuar en Cotizaciones', 'cae al comportamiento anterior si no puede abrir la pantalla del paso');
});

test('solicitud con distribución parcial o completada sin paso pendiente muestra las entregas', () => {
  assert.equal(documentAction('requests', { id: 3, status: 'partially_distributed' }, ctx())?.label, 'Ver entregas a sucursal');
  assert.equal(documentAction('requests', { id: 3, status: 'completed' }, ctx())?.label, 'Ver entregas a sucursal');
  assert.equal(documentAction('requests', { id: 3, status: 'fulfilled' }, ctx()), null);
  assert.equal(documentAction('requests', { id: 3, status: 'cancelled' }, ctx()), null);
});

test('ofertas: completar, comparar, confirmar, elegir y crear la orden', () => {
  const rfq = { id: 9, consolidationId: 5 };
  assert.deepEqual(documentAction('quotations', { id: 1, status: 'draft', rfq }, ctx()), { label: 'Completar oferta', kind: 'navigate', path: '/purchases/quotations/manage', query: { id: '5', rfqId: '9' } });
  assert.deepEqual(documentAction('quotations', { id: 1, status: 'received', rfq }, ctx()), { label: 'Comparar y elegir productos', kind: 'navigate', path: '/purchases/comparison', query: { id: '5' } });
  assert.equal(documentAction('quotations', { id: 1, status: 'draft' }, ctx())?.label, 'Confirmar oferta recibida');
  assert.equal(documentAction('quotations', { id: 1, status: 'under_review' }, ctx())?.label, 'Elegir oferta');
  assert.equal(documentAction('quotations', { id: 1, status: 'selected' }, ctx())?.kind, 'new-order');
});

test('ofertas vencidas o sin líneas pendientes no ofrecen elegir ni crear órdenes', () => {
  assert.equal(documentAction('quotations', { id: 1, status: 'received' }, ctx({ quoteExpired: true })), null);
  assert.equal(documentAction('quotations', { id: 1, status: 'selected' }, ctx({ hasPendingOrderLines: false })), null);
  assert.equal(documentAction('quotations', { id: 1, status: 'rejected' }, ctx()), null);
  assert.equal(documentAction('quotations', { id: 1, status: 'selected' }, ctx({ can: only('purchase_quotations.view') })), null);
});

test('órdenes: enviar, revisar, aprobar, marcar enviada y registrar la recepción', () => {
  assert.equal(documentAction('orders', { id: 2, status: 'draft' }, ctx())?.label, 'Enviar a Gerencia');
  assert.equal(documentAction('orders', { id: 2, status: 'returned' }, ctx())?.kind, 'approval-tab');
  assert.deepEqual(documentAction('orders', { id: 2, status: 'pending_approval' }, ctx()), { label: 'Revisar para aprobar', kind: 'approval-tab' });
  assert.equal(documentAction('orders', { id: 2, status: 'approved' }, ctx())?.label, 'Marcar enviada al proveedor');
  assert.deepEqual(documentAction('orders', { id: 2, status: 'sent' }, ctx()), { label: 'Registrar recepción', kind: 'receive' });
  assert.equal(documentAction('orders', { id: 2, status: 'pending_approval' }, ctx({ can: only('purchase_orders.view') })), null, 'solo Gerencia aprueba');
  assert.equal(documentAction('orders', { id: 2, status: 'rejected' }, ctx()), null);
});

test('orden con recepciones abiertas: ubicar, verificar, retacear o cerrar según la que sigue', () => {
  const purchases = (receipt: object) => ({ purchases: [{ id: 7, status: 'RECEIVED', purchaseDate: '2026-10-01', items: [{ locationId: 5 }], ...receipt }] });
  const placement = documentAction('orders', { id: 2, status: 'partially_received', ...purchases({ items: [{ locationId: null }] }) }, ctx());
  assert.deepEqual(placement, { label: 'Ubicar productos', kind: 'navigate', path: '/inventory/warehouse', query: { purchaseId: '7' } });
  assert.equal(documentAction('orders', { id: 2, status: 'received', ...purchases({}) }, ctx())?.label, 'Verificar recepción');
  const cost = documentAction('orders', { id: 2, status: 'received', ...purchases({ status: 'VERIFIED' }) }, ctx());
  assert.deepEqual(cost, { label: 'Continuar en Retaceo', kind: 'navigate', path: '/purchases/retaceos', query: { purchaseId: '7' } });
  assert.equal(documentAction('orders', { id: 2, status: 'received', ...purchases({ status: 'VERIFIED', retaceoStatus: 'closed' }) }, ctx())?.label, 'Cerrar recepción');
  const noInventory = documentAction('orders', { id: 2, status: 'received', ...purchases({ items: [{ locationId: null }] }) }, ctx({ can: only('purchases.view') }));
  assert.equal(noInventory?.label, 'Ver recepción pendiente', 'sin acceso a bodega se envía a la recepción');
});

test('orden recibida con todas las recepciones cerradas: lo que sigue lo marca el proceso', () => {
  const closed = { id: 2, status: 'received', purchases: [{ id: 7, status: 'CLOSED', purchaseDate: '2026-10-01', items: [{ locationId: 5 }] }] };
  assert.equal(documentAction('orders', closed, ctx()), null, 'sin información del proceso no hay botón');
  const fromProcess = documentAction('orders', closed, ctx({ processStep: step() }));
  assert.equal(fromProcess?.label, 'Continuar en bodega');
  assert.equal(fromProcess?.detail, 'Despachar los productos recibidos a la sucursal');
});

test('solo se consulta el proceso cuando el documento no basta para decidir', () => {
  assert.equal(needsProcessStep('requests', { status: 'in_procurement' }), true);
  assert.equal(needsProcessStep('requests', { status: 'draft' }), false);
  assert.equal(needsProcessStep('orders', { status: 'received' }), true);
  assert.equal(needsProcessStep('orders', { status: 'draft' }), false);
  assert.equal(needsProcessStep('quotations', { status: 'received' }), false);
  assert.equal(needsProcessStep('requests', null), false);
});

test('el botón de una solicitud usa un texto corto y deja el paso exacto como referencia', () => {
  const place = documentAction('requests', { id: 3, status: 'in_procurement' }, ctx({ processStep: step({ stage: 'reception', label: 'Ubicar los productos de RC-00011', route: '/inventory/warehouse', query: { purchaseId: '11' } }) }));
  assert.equal(place?.label, 'Continuar en bodega');
  assert.equal(place?.detail, 'Ubicar los productos de RC-00011');
});
