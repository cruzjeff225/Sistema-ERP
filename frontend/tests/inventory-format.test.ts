import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kardexFileName, locationLabel, movementFilterLabels, returnsEnabled, salesModuleEnabled, lotStatusLabels, money, movementLabels, quantity, processLabel, referenceLabel, supportDocumentLabel, transferStatusLabels } from '../src/utils/inventory-format';
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

test('las devoluciones se ofrecen, las ventas no hasta que exista el módulo de Ventas, y el saldo inicial tiene su nombre', () => {
  assert.equal(returnsEnabled, true); assert.equal(salesModuleEnabled, false);
  assert.ok(movementFilterLabels.RETURN); assert.equal('SALE' in movementFilterLabels, false);
  for (const type of ['RECEIPT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'REVERSAL', 'OPENING']) assert.ok(movementFilterLabels[type], type);
  assert.equal(movementLabels.OPENING, 'Saldo inicial'); assert.ok(movementLabels.SALE, 'lo ya registrado se sigue mostrando');
  assert.equal(referenceLabel({ referenceType: 'opening', referenceId: null }), 'Saldo inicial del inventario');
});

test('cantidades y costos se muestran con la precisión que se almacena', () => {
  assert.match(quantity('1302.00'), /^1[,. ]?302$/);
  assert.equal(quantity('12.5'), '12.5');
  assert.match(money('13.3333', 'USD', 4), /13[.,]3333/);
  assert.match(money('200'), /200[.,]00/);
  // Presentación: un costo redondo no arrastra ceros de más, pero uno con 4 decimales se muestra completo
  assert.match(money('35', 'USD', 4), /35[.,]00$/);
  assert.match(money('35.5', 'USD', 4), /35[.,]50$/);
  assert.match(money('13.3333', 'USD', 4), /13[.,]3333$/);
  assert.match(money('0.125', 'USD', 4), /0[.,]125$/);
});

test('el documento de respaldo es el del proveedor y, sin él, la recepción interna', () => {
  assert.match(supportDocumentLabel({ supplierInvoiceNumber: 'CCF-0045', supplierInvoiceDate: '2026-10-03T12:00:00Z', receipt: 'RC-00007' }), /^Doc\. CCF-0045 · .*2026/);
  assert.equal(supportDocumentLabel({ supplierInvoiceNumber: 'CCF-0045', supplierInvoiceDate: null, receipt: 'RC-00007' }), 'Doc. CCF-0045');
  assert.equal(supportDocumentLabel({ supplierInvoiceNumber: null, supplierInvoiceDate: null, receipt: 'RC-00007' }), 'Recepción RC-00007');
});

test('la cadena de documentos va de la solicitud a la recepción y el retaceo', () => {
  const full = { requests: [{ code: 'PR-00067' }], quotation: { code: 'PQ-00012' }, order: { code: 'OC-00031' }, receipt: { code: 'RC-00046' }, retaceos: [{ code: 'RT-00009' }] };
  assert.equal(processLabel(full, 'RC-00046'), 'Solicitud PR-00067 → Cotización PQ-00012 → Orden OC-00031 → Recepción RC-00046 → Retaceo RT-00009');
  assert.equal(processLabel({ ...full, requests: [{ code: 'PR-00001' }, { code: 'PR-00002' }], quotation: null, retaceos: [] }, 'RC-00046'), 'Solicitudes PR-00001, PR-00002 → Orden OC-00031 → Recepción RC-00046');
  assert.equal(processLabel(null, 'RC-00046'), 'Recepción RC-00046');
});

test('el archivo exportado lleva el producto o «todos» y la fecha de hoy en El Salvador', () => {
  const noche = new Date('2026-10-25T03:30:00Z'); // 24/10 21:30 en El Salvador
  assert.equal(kardexFileName('xlsx', 'todos', noche), 'kardex-todos-2026-10-24.xlsx');
  assert.equal(kardexFileName('pdf', 'DEMO-AT-CUM/01', noche), 'kardex-DEMO-AT-CUM-01-2026-10-24.pdf');
  assert.equal(kardexFileName('pdf', 'Cañería ñandú', noche), 'kardex-Caneria-nandu-2026-10-24.pdf');
  assert.equal(kardexFileName('xlsx', '', noche), 'kardex-producto-2026-10-24.xlsx');
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
