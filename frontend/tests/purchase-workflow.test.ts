import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiptProgress, purchasePurposeLabel, onlyOptionId, quotationDestination, quotationPendingLines } from '../src/utils/purchase-workflow';

test('recepcion: no confunde entrega parcial con orden completa ni suma unidades diferentes', () => {
  const lines = [{ id: 1, quantity: '20', receivedQuantity: '10' }, { id: 2, quantity: '10', receivedQuantity: '5' }];
  assert.deepEqual(receiptProgress(lines, [{ orderDetailId: 1, quantity: 3 }]), { complete: false, pendingLines: 2 });
  assert.deepEqual(receiptProgress(lines, [{ orderDetailId: 1, quantity: 10 }]), { complete: false, pendingLines: 1 });
  assert.deepEqual(receiptProgress(lines, [{ orderDetailId: 1, quantity: 10 }, { orderDetailId: 2, quantity: 5 }]), { complete: true, pendingLines: 0 });
});

test('recepcion: saldo decimal y lineas ya recibidas', () => {
  assert.deepEqual(receiptProgress([{ id: 1, quantity: '.3', receivedQuantity: '.1' }, { id: 2, quantity: 2, receivedQuantity: 2 }], [{ orderDetailId: 1, quantity: '.2' }]), { complete: true, pendingLines: 0 });
});

test('finalidad: diferencia abastecimiento de ventas y no inventa el uso historico', () => {
  assert.equal(purchasePurposeLabel('resale'), 'Reposición para reventa');
  assert.equal(purchasePurposeLabel('operations'), 'Insumos para operación / instalación');
  assert.equal(purchasePurposeLabel('mixed'), 'Mixta: reventa y operación');
  assert.equal(purchasePurposeLabel(null), 'Finalidad sin registrar');
});

const branches = [{ id: 1, warehouses: [{ id: 10 }, { id: 11 }] }, { id: 2, warehouses: [{ id: 20 }] }];
test('destino: conserva el almacen de origen, no el primero del catalogo', () => {
  assert.deepEqual(quotationDestination([{ request: { branchId: 1, warehouseId: 11 } }], branches), { branchId: 1, warehouseId: 11 });
});
test('destino: requiere eleccion para solicitudes con distintos almacenes o sucursales', () => {
  const sources = [{ request: { branchId: 1, warehouseId: 10 } }, { request: { branchId: 1, warehouseId: 11 } }];
  assert.deepEqual(quotationDestination(sources, branches), { branchId: 1, warehouseId: 0 });
  assert.deepEqual(quotationDestination([...sources, { request: { branchId: 2, warehouseId: 20 } }], branches), { branchId: 0, warehouseId: 0 });
});
test('destino: no sustituye ubicaciones inactivas ni origen ausente por otra bodega', () => {
  assert.deepEqual(quotationDestination([{ request: { branchId: 1, warehouseId: 99 } }], branches), { branchId: 1, warehouseId: 0 });
  assert.deepEqual(quotationDestination([], branches), { branchId: 0, warehouseId: 0 });
});
test('catalogos: solo selecciona automaticamente una opcion unica', () => {
  assert.equal(onlyOptionId([]), 0);
  assert.equal(onlyOptionId(branches), 0);
  assert.equal(onlyOptionId([{ id: 9 }]), 9);
});
test('pendientes: descuenta ordenes activas, ignora canceladas y redondea decimales', () => {
  const lines = quotationPendingLines({ details: [{ id: 1, availableQuantity: '0.3', product: { name: 'Lamina' } }, { id: 2, availableQuantity: 10, product: { name: 'Tornillo' } }], orders: [
    { status: 'draft', details: [{ quotationDetailId: 1, quantity: '0.1' }, { quotationDetailId: 2, quantity: 10 }] },
    { status: 'cancelled', details: [{ quotationDetailId: 1, quantity: '0.2' }] },
  ] });
  assert.deepEqual(lines, [{ quotationDetailId: 1, productName: 'Lamina', pending: 0.2, quantity: 0.2 }]);
});
