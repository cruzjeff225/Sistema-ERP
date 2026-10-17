import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locationLabel, lotStatusLabels, money, movementLabels, quantity, referenceLabel, transferStatusLabels } from '../src/utils/inventory-format';
import { labelText } from '../src/utils/inventory-labels';

test('el Kardex nombra el documento de origen de cada movimiento', () => {
  const lot = { purchaseItem: { purchase: { documentNumber: 'RC-00007' } } };
  assert.equal(referenceLabel({ referenceType: 'purchase_detail', referenceId: 3, lot }), 'Recepción RC-00007');
  assert.equal(referenceLabel({ referenceType: 'purchase_detail', referenceId: 3, lot: null }), 'Recepción de compra');
  assert.equal(referenceLabel({ referenceType: 'transfer', referenceId: 9, reason: 'Despacho TR-AB12CD34' }), 'Despacho TR-AB12CD34');
  assert.equal(referenceLabel({ referenceType: 'retaceo', referenceId: 1 }), 'Costo final por retaceo');
  assert.equal(referenceLabel({ referenceType: 'adjustment', referenceId: null }), 'Ajuste de inventario');
  assert.equal(referenceLabel({ referenceType: 'sale', referenceId: 12 }), 'Venta 12');
});

test('todos los tipos de movimiento, estados de lote y de traslado tienen etiqueta', () => {
  for (const type of ['OPENING', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RETURN']) assert.ok(movementLabels[type], type);
  for (const status of ['ACTIVE', 'DEPLETED', 'CANCELLED']) assert.ok(lotStatusLabels[status], status);
  // ERS 6.9.19: en preparación, en tránsito, recibido e incidencia
  for (const status of ['PREPARING', 'IN_TRANSIT', 'COMPLETED', 'INCIDENT']) assert.ok(transferStatusLabels[status], status);
});

test('cantidades y costos se muestran con la precisión que se almacena', () => {
  assert.match(quantity('1302.00'), /^1[,. ]?302$/);
  assert.equal(quantity('12.5'), '12.5');
  assert.match(money('13.3333', 'USD', 4), /13[.,]3333/);
  assert.match(money('200'), /200[.,]00/);
});

test('la ubicación se lee como almacén y espacio', () => {
  assert.equal(locationLabel({ code: 'A-01', warehouse: { name: 'Centro general' } }), 'Centro general · A-01');
  assert.equal(locationLabel(null), '—');
});

test('la etiqueta lleva producto, lote y fecha de recepción como texto (RN-INV-016)', () => {
  const text = labelText({ barcode: 'INT-0001', productName: 'Lámina 3 m', sku: 'LAM-3', lotCode: 'LT-000026', receivedAt: '2026-10-03T15:00:00Z' });
  assert.equal(text.product, 'Lámina 3 m');
  assert.equal(text.lot, 'Lote LT-000026');
  assert.match(text.received, /^Recepción /);
  assert.match(text.received, /2026/);
});
