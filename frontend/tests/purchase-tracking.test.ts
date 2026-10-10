import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canOpenRoute, currentStageId, documentLocation, documentStatusLabel, documentStatusVariant, formatQuantity, isTrackingType, processSummary, progressPercent, stateVariant, stepLocation,
  type TrackingDocuments, type TrackingStage,
} from '../src/utils/purchase-tracking';

const stage = (id: string, state: TrackingStage['state']): TrackingStage => ({ id, label: id, owner: 'Compras', state });
const docs = (o: Partial<TrackingDocuments> = {}): TrackingDocuments => ({ requests: [], consolidations: [], quotations: [], orders: [], receipts: [], retaceos: [], transfers: [], ...o });

test('la etapa actual es la del siguiente paso o, sin paso, la primera en curso o pendiente', () => {
  const stages = [stage('requests', 'complete'), stage('quotation', 'in_progress'), stage('order', 'pending')];
  assert.equal(currentStageId(stages, { stage: 'order', owner: 'Gerencia', label: 'x', route: '/purchases/orders' }), 'order');
  assert.equal(currentStageId(stages, null), 'quotation');
  assert.equal(currentStageId([stage('requests', 'complete'), stage('delivery', 'skipped')], null), null);
});

test('el avance se acota entre 0 y 100 y tolera totales vacíos', () => {
  assert.equal(progressPercent({ done: 70, total: 120 }), 58);
  assert.equal(progressPercent({ done: 130, total: 120 }), 100);
  assert.equal(progressPercent({ done: -1, total: 120 }), 0);
  assert.equal(progressPercent({ done: 0, total: 0 }), 0);
  assert.equal(progressPercent(undefined), 0);
});

test('las cantidades no muestran ruido decimal y los vacíos usan raya', () => {
  assert.equal(formatQuantity(70.00000001), '70');
  assert.equal(formatQuantity(12.5), '12.5');
  assert.equal(formatQuantity(1700), '1,700');
  assert.equal(formatQuantity(null), '—');
});

test('el botón solo se habilita si el usuario puede abrir la pantalla de destino', () => {
  const only = (...granted: string[]) => (permission: string) => granted.includes(permission);
  assert.equal(canOpenRoute('/purchases/orders', only('purchase_orders.view')), true);
  assert.equal(canOpenRoute('/purchases/orders', only('purchases.view')), false);
  assert.equal(canOpenRoute('/purchases/quotations/manage', only('purchase_orders.approve')), true, 'Gerencia entra a la gestión para autorizar cantidades');
  assert.equal(canOpenRoute('/inventory/warehouse', only()), false);
  assert.equal(canOpenRoute('/purchases/retaceos', only('retaceos.view')), true);
  assert.equal(canOpenRoute('/ruta/desconocida', only()), true, 'sin regla no se bloquea');
});

test('el paso se convierte en una ubicación de ruta con sus parámetros', () => {
  assert.deepEqual(stepLocation({ route: '/inventory/warehouse', query: { purchaseId: '2' } }), { path: '/inventory/warehouse', query: { purchaseId: '2' } });
  assert.deepEqual(stepLocation({ route: '/purchases/comparison' }), { path: '/purchases/comparison', query: {} });
});

test('cada documento se abre en la pantalla donde se gestiona', () => {
  const all = docs({ requests: [{ id: 12, code: 'PR-00012', status: 'draft' }] });
  assert.deepEqual(documentLocation('orders', { id: 3, code: 'OC-3', status: 'sent' }, all), { path: '/purchases/orders', query: { id: '3' } });
  assert.deepEqual(documentLocation('consolidations', { id: 5, code: 'G-5', status: 'approved' }, all), { path: '/purchases/quotations/manage', query: { id: '5' } });
  assert.deepEqual(documentLocation('transfers', { id: 1, code: 'TR-1', status: 'IN_TRANSIT' }, all), { path: '/inventory/warehouse', query: { requestId: '12' } });
  assert.deepEqual(documentLocation('transfers', { id: 1, code: 'TR-1', status: 'IN_TRANSIT' }, docs()), { path: '/inventory/warehouse', query: {} });
});

test('los estados se muestran en español y los desconocidos se conservan', () => {
  assert.equal(documentStatusLabel('pending_approval'), 'Pendiente de aprobación');
  assert.equal(documentStatusLabel('IN_TRANSIT'), 'En tránsito');
  assert.equal(documentStatusLabel('algo_nuevo'), 'algo_nuevo');
  assert.equal(documentStatusVariant('CLOSED'), 'success');
  assert.equal(documentStatusVariant('rejected'), 'danger');
  assert.equal(documentStatusVariant('pending_approval'), 'warning');
  assert.equal(stateVariant('in_progress'), 'info');
  assert.equal(stateVariant('skipped'), 'neutral');
});

test('el resumen del encabezado limita los códigos mostrados', () => {
  assert.equal(processSummary(docs()), '');
  assert.equal(processSummary(docs({ requests: [{ id: 1, code: 'PR-1', status: 'x' }], orders: [{ id: 1, code: 'OC-1', status: 'x' }] })), 'PR-1 · OC-1');
  const many = docs({ requests: [1, 2, 3].map(n => ({ id: n, code: `PR-${n}`, status: 'x' })), receipts: [1, 2, 3].map(n => ({ id: n, code: `RC-${n}`, status: 'x' })) });
  assert.equal(processSummary(many), 'PR-1 · PR-2 · PR-3 · RC-1 y 2 más');
});

test('solo se aceptan los tipos de documento que conoce el servidor', () => {
  assert.equal(isTrackingType('request'), true);
  assert.equal(isTrackingType('retaceo'), true);
  assert.equal(isTrackingType('bogus'), false);
  assert.equal(isTrackingType(undefined), false);
});

import { relativeTime, PROCESS_SCOPES } from '../src/utils/purchase-tracking';
import { purchasingSectionRoute, visiblePurchasingSections, purchasingGroups } from '../src/config/purchasing.config';

test('la antigüedad de un proceso se expresa en lenguaje natural', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(relativeTime('2026-10-10T11:59:40Z', now), 'ahora');
  assert.equal(relativeTime('2026-10-10T11:55:00Z', now), 'hace 5 min');
  assert.equal(relativeTime('2026-10-10T09:00:00Z', now), 'hace 3 h');
  assert.equal(relativeTime('2026-10-09T09:00:00Z', now), 'ayer');
  assert.equal(relativeTime('2026-10-05T12:00:00Z', now), 'hace 5 días');
  assert.equal(relativeTime('2026-10-10T12:05:00Z', now), 'ahora', 'una hora futura no produce textos negativos');
  assert.equal(relativeTime('no-es-fecha', now), 'ahora');
});

test('los filtros del listado coinciden con los que acepta el servidor', () => {
  assert.deepEqual(PROCESS_SCOPES.map(scope => scope.id), ['open', 'done', 'all']);
});

test('el seguimiento aparece en Compras para quien puede ver compras y se mantiene seleccionado en el detalle', () => {
  const sections = visiblePurchasingSections(permission => permission === 'purchases.view');
  assert.ok(sections.some(section => section.id === 'tracking' && section.route === '/purchases/tracking'));
  assert.equal(visiblePurchasingSections(() => false).some(section => section.id === 'tracking'), false);
  assert.equal(purchasingSectionRoute('/purchases/tracking/request/12'), '/purchases/tracking');
  assert.equal(purchasingSectionRoute('/purchases/tracking'), '/purchases/tracking');
  assert.equal(purchasingSectionRoute('/purchases/orders'), '/purchases/orders');
  assert.ok(purchasingGroups.some(group => group.id === 'overview'), 'la sección nueva tiene un grupo que la contiene');
});
