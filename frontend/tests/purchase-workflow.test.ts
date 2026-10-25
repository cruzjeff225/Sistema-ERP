import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiptProgress, purchasePurposeLabel, onlyOptionId, quotationDestination, quotationPendingLines, receiptNextStep, nextOrderReceipt, orderNeedsAttention, orderReceiptStage, purchaseOriginRequests } from '../src/utils/purchase-workflow';

test('recepción conserva solicitudes por sucursal desde la agrupación aunque la oferta no tenga enlaces directos', () => {
  const first = { id: 1, code: 'SOL-001' }, second = { id: 2, code: 'SOL-002' };
  const source = (request: typeof first) => ({ requestDetail: { request } });
  assert.deepEqual(purchaseOriginRequests({quotation:{requestLinks:[]},consolidation:{lines:[{sources:[source(first),source(second)]},{sources:[source(first)]}]}}),[first,second]);
  assert.deepEqual(purchaseOriginRequests({quotation:{requestLinks:[{request:first}]},consolidation:{lines:[{sources:[source(first)]}]}}),[first]);
  assert.deepEqual(purchaseOriginRequests(null),[]);
});

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

test('pendientes: limita lo cotizado y libera rechazos sin liberar órdenes devueltas', () => {
  const quotation = { details: [{ id: 1, quantity: 10, availableQuantity: 30, product: { name: 'Lámina' } }], orders: [
    { status: 'rejected', details: [{ quotationDetailId: 1, quantity: 8 }] },
    { status: 'returned', details: [{ quotationDetailId: 1, quantity: 3 }] },
    { status: 'pending_approval', details: [{ quotationDetailId: 1, quantity: 2 }] },
  ] };
  assert.deepEqual(quotationPendingLines(quotation), [{ quotationDetailId: 1, productName: 'Lámina', pending: 5, quantity: 5 }]);
  quotation.details[0]!.availableQuantity = 4;
  assert.deepEqual(quotationPendingLines(quotation), []);
  assert.equal(orderNeedsAttention({ status: 'returned' }), true);
  assert.equal(orderNeedsAttention({ status: 'rejected' }), false);
});

test('orden recibida: sigue la recepción abierta aunque otra parcial anterior esté cerrada', () => {
  const closed = { id: 1, status: 'CLOSED', purchaseDate: '2026-10-01T12:00:00Z' };
  const open = { id: 2, status: 'VERIFIED', purchaseDate: '2026-10-02T12:00:00Z', items: [{ locationId: 9 }] };
  const newer = { id: 3, status: 'RECEIVED', purchaseDate: '2026-10-03T12:00:00Z', items: [{ locationId: null }] };
  for (const receipts of [[newer, open, closed], [closed, newer, open]]) {
    assert.equal(nextOrderReceipt(receipts)?.id, open.id);
    assert.equal(orderNeedsAttention({ status: 'received', purchases: receipts }), true);
    assert.equal(orderReceiptStage({ status: 'received', purchases: receipts }), 'Pendiente de retaceo · 2 recepciones abiertas');
  }
  assert.equal(orderNeedsAttention({ status: 'received', purchases: [closed, { id: 4, status: 'CANCELLED' }] }), false);
  assert.equal(orderReceiptStage({ status: 'received', purchases: [closed] }), 'Productos recibidos · Recepciones cerradas');
  assert.equal(orderNeedsAttention({ status: 'partially_received', purchases: [closed] }), true);
  assert.equal(orderNeedsAttention({ status: 'received', purchases: [] }), false);
});

test('recepción: guía ubicación, verificación, costo y cierre sin repetir costos archivados', () => {
  const receipt = { id: 1, status: 'RECEIVED', items: [{ locationId: null }] };
  assert.equal(receiptNextStep(receipt).step, 'placement');
  const located = { ...receipt, items: [{ locationId: 9 }] };
  assert.equal(receiptNextStep(located).step, 'verify');
  const verified = { ...located, status: 'VERIFIED' };
  assert.equal(receiptNextStep(verified).step, 'cost');
  assert.equal(receiptNextStep({ ...verified, retaceoStatus: 'draft', retaceoArchived: true }).step, 'restore');
  assert.equal(receiptNextStep({ ...verified, retaceoStatus: 'closed', retaceoArchived: true }).step, 'close');
  assert.equal(receiptNextStep({ ...verified, retaceos: [{ status: 'cancelled' }, { status: 'closed' }] }).step, 'close');
  assert.equal(receiptNextStep({ ...receipt, status: 'CANCELLED' }).step, 'cancelled');
  assert.equal(receiptNextStep({ ...receipt, status: 'CLOSED' }).step, 'complete');
});
