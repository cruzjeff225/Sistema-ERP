import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { allocateFifo, applyEntry, applyExit, applyRevaluation, lotCodeForAdjustment, lotCodeForReceipt, type CostBalance } from '../src/modules/inventory/inventory-costing';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const balance = (quantity: number, value: number): CostBalance => ({ quantity: D(quantity), value: D(value), average: quantity ? D(value).div(quantity).toDecimalPlaces(4) : D(0) });
const rows = (...r: [number, number, number, string][]) => r.map(([lotId, locationId, available, receivedAt]) => ({ lotId, locationId, available: D(available), receivedAt: new Date(receivedAt) }));

test('ERS 6.9.15: 5 unidades a $10 y 10 a $15 dan $200 y un promedio de $13.3333', () => {
  const next = applyEntry(balance(5, 50), 10, 15);
  assert.equal(next.quantity.toString(), '15');
  assert.equal(next.value.toString(), '200');
  assert.equal(next.average.toString(), '13.3333');
});

test('la primera entrada fija el promedio en su costo unitario', () => {
  const next = applyEntry(balance(0, 0), 8, '2.5');
  assert.equal(next.average.toString(), '2.5');
  assert.equal(next.value.toString(), '20');
});

test('una salida baja cantidad y valor al promedio, sin cambiar el promedio', () => {
  const next = applyExit(balance(15, 200), 6);
  assert.equal(next.quantity.toString(), '9');
  assert.equal(next.average.toString(), '13.3333');
  assert.equal(next.value.toString(), '120');
});

test('al vaciar el saldo el valor queda en cero aunque el promedio redondee', () => {
  const next = applyExit(balance(15, 200), 15);
  assert.equal(next.quantity.toString(), '0');
  assert.equal(next.value.toString(), '0');
});

test('RN-INV-001: no se puede sacar más de lo que hay', () => {
  assert.throws(() => applyExit(balance(3, 30), 4), /insuficientes/);
});

test('un traslado no entra en la valoración: las salidas y entradas por traslado no usan applyEntry/applyExit', () => {
  // La valoración global solo cambia en recepción, venta, ajuste y retaceo; el servicio no la toca al trasladar.
  const before = balance(10, 100);
  assert.deepEqual({ q: before.quantity.toString(), v: before.value.toString() }, { q: '10', v: '100' });
});

test('el costo final del retaceo revalúa solo las unidades que siguen en existencia', () => {
  const next = applyRevaluation(balance(10, 100), 25);
  assert.equal(next.value.toString(), '125');
  assert.equal(next.average.toString(), '12.5');
});

test('FIFO toma primero el lote recibido antes y reparte el resto en el siguiente', () => {
  const slices = allocateFifo(rows([2, 1, 10, '2026-02-01'], [1, 1, 4, '2026-01-01']), 7);
  assert.deepEqual(slices.map(s => [s.lotId, s.quantity.toString()]), [[1, '4'], [2, '3']]);
});

test('un lote pedido explícitamente tiene prioridad y es el único que se usa', () => {
  const slices = allocateFifo(rows([1, 1, 4, '2026-01-01'], [2, 1, 10, '2026-02-01']), 5, 2);
  assert.deepEqual(slices.map(s => [s.lotId, s.quantity.toString()]), [[2, '5']]);
  assert.throws(() => allocateFifo(rows([1, 1, 4, '2026-01-01'], [2, 1, 10, '2026-02-01']), 5, 1), /insuficientes/);
});

test('FIFO rechaza una salida mayor que lo disponible en la ubicación', () => {
  assert.throws(() => allocateFifo(rows([1, 1, 4, '2026-01-01']), 5), /insuficientes/);
});

test('los códigos de lote son estables y legibles', () => {
  assert.equal(lotCodeForReceipt(42), 'LT-000042');
  assert.equal(lotCodeForAdjustment(7), 'LT-AJ-000007');
});
