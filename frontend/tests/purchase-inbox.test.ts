import test from 'node:test';
import assert from 'node:assert/strict';
import { isPendingPurchase, purchaseStage } from '../src/utils/purchase-inbox';

test('pending inbox excludes cancelled and completed documents', () => {
  for (const section of ['requests', 'quotations', 'orders'] as const) {
    assert.equal(isPendingPurchase(section, 'cancelled'), false);
    assert.equal(isPendingPurchase(section, 'draft'), true);
  }
  assert.equal(isPendingPurchase('requests', 'completed'), false);
  assert.equal(isPendingPurchase('orders', 'closed'), false);
  assert.equal(isPendingPurchase('quotations', 'expired'), false);
  assert.equal(isPendingPurchase('requests', 'rejected'), true);
});

test('stage text distinguishes approvals, supplier offers and deliveries', () => {
  assert.equal(purchaseStage('requests', 'approved'), 'Lista para cotizar');
  assert.equal(purchaseStage('quotations', 'received'), 'Pendiente de evaluar');
  assert.equal(purchaseStage('orders', 'partially_received'), 'Entrega incompleta');
});
