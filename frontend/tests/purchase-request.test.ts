import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canCancelRequest, deliveredQuantity, hasBranchDeliveries, isEditableRequest, processSnapshot, quotationEntryLocation, requestDetailPath, requestEditLocation, requestListLocation,
} from '../src/utils/purchase-request';

test('solo se edita una solicitud que no ha llegado a Compras o que Compras devolvió', () => {
  assert.equal(isEditableRequest('draft'), true);
  assert.equal(isEditableRequest('rejected'), true);
  for (const status of ['submitted', 'in_procurement', 'fulfilled', 'cancelled']) assert.equal(isEditableRequest(status), false, status);
});

test('la cancelación y las entregas dependen del estado de la solicitud', () => {
  for (const status of ['draft', 'submitted', 'approved', 'in_quotation', 'partially_ordered']) assert.equal(canCancelRequest(status), true, status);
  for (const status of ['in_procurement', 'partially_distributed', 'fulfilled', 'cancelled', 'rejected']) assert.equal(canCancelRequest(status), false, status);
  assert.equal(hasBranchDeliveries('draft'), false);
  assert.equal(hasBranchDeliveries('rejected'), false);
  assert.equal(hasBranchDeliveries('cancelled'), false);
  assert.equal(hasBranchDeliveries('in_procurement'), true);
});

test('los enlaces de la solicitud conservan el contexto', () => {
  assert.equal(requestDetailPath(24), '/purchases/requests/24');
  assert.deepEqual(requestListLocation(24), { path: '/purchases/requests', query: { id: '24' } });
  assert.deepEqual(requestListLocation(), { path: '/purchases/requests', query: {} });
  assert.deepEqual(requestEditLocation(24), { path: '/purchases/requests', query: { id: '24', edit: '1', from: 'detail' } });
  assert.deepEqual(requestEditLocation(24, { addLine: true }), { path: '/purchases/requests', query: { id: '24', edit: '1', from: 'detail', addLine: '1' } });
});

test('Compras continúa en la gestión de la solicitud o abre una nueva', () => {
  assert.deepEqual(quotationEntryLocation({ id: 3, details: [{ consolidationSources: [{ line: { consolidationId: 7 } }] }] }), { path: '/purchases/quotations/manage', query: { id: '7' } });
  assert.deepEqual(quotationEntryLocation({ id: 3, details: [{ consolidationSources: [] }, {}] }), { path: '/purchases/quotations/manage', query: { requestId: '3' } });
  assert.deepEqual(quotationEntryLocation({ id: 3 }), { path: '/purchases/quotations/manage', query: { requestId: '3' } });
});

test('las cantidades despachadas y recibidas se suman sin ruido decimal', () => {
  const line = { transferItems: [{ quantity: '10.1', receivedQuantity: '5' }, { quantity: 20.2, receivedQuantity: 0 }] };
  assert.equal(deliveredQuantity(line, 'quantity'), 30.3);
  assert.equal(deliveredQuantity(line, 'receivedQuantity'), 5);
  assert.equal(deliveredQuantity({}, 'quantity'), 0);
});

test('el resumen del proceso toma la etapa del siguiente paso o la primera sin completar', () => {
  const stages = [
    { id: 'requests', label: 'Solicitudes', owner: 'Sucursal' as const, state: 'complete' as const },
    { id: 'quantities', label: 'Cantidades', owner: 'Gerencia' as const, state: 'skipped' as const },
    { id: 'quotation', label: 'Cotización', owner: 'Compras' as const, state: 'in_progress' as const },
    { id: 'order', label: 'Orden', owner: 'Gerencia' as const, state: 'pending' as const },
  ];
  const step = { stage: 'quotation', owner: 'Compras' as const, label: 'Registrar la oferta', route: '/purchases/quotations/manage' };
  assert.deepEqual(processSnapshot({ stages, nextStep: step }), { step, info: { stage: 'Cotización', done: 1, total: 3 } });
  assert.deepEqual(processSnapshot({ stages, nextStep: null }).info, { stage: 'Cotización', done: 1, total: 3 });
  const finished = stages.map(stage => ({ ...stage, state: stage.state === 'skipped' ? stage.state : ('complete' as const) }));
  assert.equal(processSnapshot({ stages: finished, nextStep: null }).info, null, 'una compra terminada no tiene etapa en curso');
});

import { requestNextStep, requestStatusIcon } from '../src/utils/purchase-request';

test('mientras la solicitud está en manos de la sucursal se indica su siguiente paso y quién lo hace', () => {
  assert.deepEqual(requestNextStep('draft'), { label: 'Enviar la solicitud a Compras', owner: 'Sucursal', hint: 'La solicitud está en borrador y pendiente de envío. Una vez completada la información y los productos, puedes enviarla al área de Compras.' });
  assert.equal(requestNextStep('rejected')?.label, 'Corregir la solicitud');
  assert.equal(requestNextStep('rejected')?.owner, 'Sucursal');
  for (const status of ['submitted', 'in_procurement', 'cancelled', 'fulfilled']) assert.equal(requestNextStep(status), null, status);
});

test('cada estado de la solicitud tiene un ícono que lo distingue', () => {
  assert.equal(requestStatusIcon('draft'), 'draft');
  assert.equal(requestStatusIcon('rejected'), 'attention');
  assert.equal(requestStatusIcon('cancelled'), 'cancelled');
  assert.equal(requestStatusIcon('fulfilled'), 'delivered');
  for (const status of ['submitted', 'approved']) assert.equal(requestStatusIcon(status), 'sent', status);
  for (const status of ['in_quotation', 'partially_ordered', 'in_procurement', 'partially_distributed', 'completed']) assert.equal(requestStatusIcon(status), 'progress', status);
});
