import assert from 'node:assert/strict';
import { test } from 'node:test';
import { myOwners, pendingFor, stepForUser, waitingOnOthers } from '../src/utils/my-pending';
import type { ProcessRow, TrackingStep } from '../src/utils/purchase-tracking';

const step = (owner: TrackingStep['owner'], route = '/purchases/quotations/manage', label = 'Hacer algo'): TrackingStep => ({ stage: 'quotation', owner, label, route });
const row = (id: number, nextStep: TrackingStep | null, extra: Partial<ProcessRow> = {}): ProcessRow => ({
  anchor: { type: 'request', id }, documents: { requests: [{ id, code: 'PR-' + id, status: 'in_procurement' }], consolidations: [], quotations: [], orders: [], receipts: [], retaceos: [], transfers: [] },
  nextStep, blockers: 0, completed: false, stagesDone: 1, stagesTotal: 8, currentStage: null, updatedAt: '2026-10-10T10:00:00Z', ...extra,
});
const canAll = () => true;

test('cada usuario actúa por los equipos cuyo trabajo sus permisos le permiten hacer', () => {
  const has = (...permissions: string[]) => (p: string) => permissions.includes(p);
  assert.deepEqual(myOwners(has('purchase_requests.create')), ['Sucursal']);
  assert.deepEqual(myOwners(has('purchase_quotations.create', 'purchase_requests.create')), ['Sucursal', 'Compras']);
  assert.deepEqual(myOwners(has('purchase_orders.approve')), ['Gerencia']);
  assert.deepEqual(myOwners(has('purchase_orders.receive')), ['Bodega']);
  assert.deepEqual(myOwners(has('inventory.transfer')), [], 'recibir en la sucursal también exige inventario, no hace a nadie de Bodega');
  assert.deepEqual(myOwners(has('purchases.view')), []);
});

test('mis pendientes: el siguiente paso de cada compra si me toca a mí', () => {
  const rows = [row(1, step('Compras')), row(2, step('Gerencia', '/purchases/orders')), row(3, step('Bodega', '/inventory/warehouse'))];
  const items = pendingFor(rows, ['Compras'], canAll);
  assert.deepEqual(items.map(item => item.row.anchor.id), [1]);
  assert.equal(items[0].parallel, false);
  assert.equal(waitingOnOthers(rows, items), 2);
});

test('si el paso principal es de otro equipo, aparece mi paso en paralelo', () => {
  const rows = [row(1, step('Compras', '/purchases/retaceos', 'Hacer el retaceo'), { alsoAvailable: [step('Bodega', '/inventory/warehouse', 'Despachar a la sucursal')] })];
  const items = pendingFor(rows, ['Bodega'], canAll);
  assert.equal(items.length, 1); assert.equal(items[0].parallel, true); assert.equal(items[0].step.label, 'Despachar a la sucursal');
});

test('los pasos principales van antes que los paralelos y, dentro de cada grupo, lo más reciente primero', () => {
  const rows = [
    row(1, step('Gerencia', '/purchases/orders'), { alsoAvailable: [step('Bodega', '/inventory/warehouse')], updatedAt: '2026-10-10T12:00:00Z' }),
    row(2, step('Bodega', '/inventory/warehouse'), { updatedAt: '2026-10-10T08:00:00Z' }),
    row(3, step('Bodega', '/inventory/warehouse'), { updatedAt: '2026-10-10T09:00:00Z' }),
  ];
  assert.deepEqual(pendingFor(rows, ['Bodega'], canAll).map(item => item.row.anchor.id), [3, 2, 1]);
});

test('no se ofrecen pasos a los que el usuario no puede entrar ni compras ya completadas', () => {
  const rows = [row(1, step('Compras', '/purchases/retaceos')), row(2, step('Compras'), { completed: true })];
  assert.deepEqual(pendingFor(rows, ['Compras'], p => p !== 'retaceos.view').map(item => item.row.anchor.id), []);
  assert.deepEqual(pendingFor(rows, ['Compras'], canAll).map(item => item.row.anchor.id), [1]);
});

test('el paso de una compra para este usuario: el principal si es suyo, si no uno en paralelo de su equipo', () => {
  const retaceo = step('Compras', '/purchases/retaceos'), receive = step('Sucursal', '/inventory/warehouse', 'Recibir en la sucursal');
  assert.equal(stepForUser(retaceo, [receive], ['Sucursal'], canAll), receive);
  assert.equal(stepForUser(retaceo, [receive], ['Compras'], canAll), retaceo);
  assert.equal(stepForUser(retaceo, [receive], ['Gerencia'], canAll), retaceo, 'sin paso propio se muestra el principal');
  assert.equal(stepForUser(null, [], ['Compras'], canAll), null);
});
