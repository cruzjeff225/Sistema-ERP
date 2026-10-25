import assert from 'node:assert/strict';
import { test } from 'node:test';
import { warehouseContext, placementsForContext, transfersForContext, receiptStateLabel, transferStateLabel } from '../src/utils/warehouse-context';

test('bodega: valida contexto sin convertir un enlace inválido en una lista general', () => {
  assert.equal(warehouseContext({}), null);
  assert.deepEqual(warehouseContext({ purchaseId: '66' }), { kind: 'purchase', id: 66 });
  assert.deepEqual(warehouseContext({ requestId: '79' }), { kind: 'request', id: 79 });
  for (const purchaseId of ['0', '-1', '1e3', '1.5', '9007199254740992', ['66', '67']]) {
    assert.deepEqual(warehouseContext({ purchaseId }), { kind: 'invalid', id: 0 });
  }
  assert.deepEqual(warehouseContext({ purchaseId: '66', requestId: '79' }), { kind: 'purchase', id: 66 });
});

test('bodega: una recepción solamente muestra su colocación pendiente', () => {
  const rows = [{ purchaseId: 66 }, { purchase: { id: 67 } }, { purchase: { id: 66 } }];
  assert.deepEqual(placementsForContext(rows, { kind: 'purchase', id: 66 }), [rows[0], rows[2]]);
  assert.deepEqual(placementsForContext(rows, { kind: 'invalid', id: 0 }), []);
});

test('bodega: preserva el traslado pero oculta líneas de otras solicitudes', () => {
  const rows = [{ id: 8, items: [{ requestDetail: { requestId: 79 } }, { requestDetail: { request: { id: 80 } } }] }, { id: 9, items: [{ requestDetail: null }] }];
  const scoped = transfersForContext(rows, { kind: 'request', id: 79 });
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0]!.id, 8);
  assert.equal(scoped[0]!.items.length, 1);
  assert.equal(rows[0]!.items.length, 2);
  assert.deepEqual(transfersForContext(rows, { kind: 'purchase', id: 66 }), []);
});

test('bodega: presenta estados operativos en español', () => {
  assert.equal(transferStateLabel('IN_TRANSIT'), 'En tránsito');
  assert.equal(transferStateLabel('COMPLETED'), 'Entregado');
  assert.equal(receiptStateLabel('COSTED'), 'Costo calculado');
  assert.equal(receiptStateLabel('CLOSED'), 'Cerrada');
});
