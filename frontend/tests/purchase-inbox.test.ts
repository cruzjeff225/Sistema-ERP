import test from 'node:test';
import assert from 'node:assert/strict';
import { isPendingPurchase, purchaseStage, isRecentRequest, isCurrentPurchaseWeek, currentPurchaseWeek } from '../src/utils/purchase-inbox';

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

test('recent requests use El Salvador calendar days and keep older requests separate', () => {
  const now = new Date('2026-10-04T02:00:00Z'); // October 3 in El Salvador.
  assert.equal(isRecentRequest('2026-10-03T23:00:00Z', now), true);
  assert.equal(isRecentRequest('2026-10-01T06:00:00Z', now), true);
  assert.equal(isRecentRequest('2026-10-01T05:59:59Z', now), false);
  assert.equal(isRecentRequest('2026-10-02T06:00:00Z', now, 1), false);
  assert.equal(isRecentRequest('2026-10-03T06:00:00Z', now, 1), true);
  assert.equal(isRecentRequest('2026-10-04T06:00:00Z', now), false);
  assert.equal(isRecentRequest('invalid', now), false);
});

test('orders show the current Monday to Sunday week in El Salvador', () => {
 const now = new Date('2026-10-03T18:00:00Z');
 assert.equal(isCurrentPurchaseWeek('2026-09-28T06:00:00Z', now), true);
 assert.equal(isCurrentPurchaseWeek('2026-09-28T05:59:59Z', now), false);
 assert.equal(isCurrentPurchaseWeek('2026-10-05T05:59:59Z', now), true);
 assert.equal(isCurrentPurchaseWeek('2026-10-05T06:00:00Z', now), false);
 assert.equal(isCurrentPurchaseWeek('invalid', now), false);
});

test('receipt week filters follow local calendar at Sunday to Monday and year boundaries', () => {
  assert.deepEqual(currentPurchaseWeek(new Date('2026-10-05T05:59:59Z')), { dateFrom: '2026-09-28', dateTo: '2026-10-04' });
  assert.deepEqual(currentPurchaseWeek(new Date('2026-10-05T06:00:00Z')), { dateFrom: '2026-10-05', dateTo: '2026-10-11' });
  assert.deepEqual(currentPurchaseWeek(new Date('2027-01-01T18:00:00Z')), { dateFrom: '2026-12-28', dateTo: '2027-01-03' });
});
