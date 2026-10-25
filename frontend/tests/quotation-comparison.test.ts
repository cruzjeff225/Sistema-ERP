import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateQuotationSelection, evaluateComparisonOffer, projectComparisonExpenses, recommendComparisonOffer, type ComparisonOffer, type ComparisonQuotation } from '../src/utils/quotation-comparison';

const today = '2026-10-03';

test('bloquea precio cero, oferta archivada y unidades no equivalentes', () => {
  assert.equal(evaluateComparisonOffer(offer(1, { unitPrice: 0 }), 10, today).reason, 'Precio pendiente de confirmar');
  assert.equal(evaluateComparisonOffer(offer(2, {}, { deletedAt: today }), 10, today).eligible, false);
  const box = { ...offer(3, { unitId: 2 }), requiredUnitId: 1 };
  assert.equal(evaluateComparisonOffer(box, 10, today).reason, 'Unidad no equivalente');
  box.detail.unitId = 1;
  assert.equal(evaluateComparisonOffer(box, 10, today).eligible, true);
});

test('la comparación parcial respeta el mínimo y lo ya incluido en el borrador', () => {
  const small = offer(1, { availableQuantity: 2, minimumQuantity: 2, unitPrice: 3 });
  const bulk = offer(2, { availableQuantity: 4, minimumQuantity: 3, unitPrice: 1 });
  const comparison = recommendComparisonOffer([small, bulk], 10, today);
  assert.equal(comparison.comparisonQuantity, 2);
  assert.equal(comparison.recommendation?.offer.detail.id, 1, 'el proveedor barato no acepta dos unidades');
  bulk.quotation.orders = [{ status: 'draft', details: [{ quotationDetailId: 2, quantity: 2, subtotal: 2, discount: 0, taxAmount: 0 }] }];
  assert.equal(evaluateComparisonOffer(bulk, 1, today).eligible, true, 'el borrador ya contiene dos de las tres unidades mínimas');
});
function offer(id: number, changes: Partial<ComparisonOffer['detail']> = {}, quote: Partial<ComparisonQuotation> = {}): ComparisonOffer {
  const detail = { id, quantity: 100, availableQuantity: 100, unitPrice: 2, discount: 0, taxRate: 0, ...changes };
  return { detail, supplier: { id, name: `Proveedor ${id}`, isActive: true }, quotation: { currency: 'USD', status: 'received', validUntil: today, details: [detail], expenses: [], ...quote } };
}

test('compara el costo con descuento, impuesto y gastos, no solamente el precio base', () => {
  const base = offer(1, { unitPrice: 10, taxRate: 13 }, { expenses: [{ amount: 100 }] });
  const discounted = offer(2, { unitPrice: 11, discount: 200, taxRate: 13 });
  const result = recommendComparisonOffer([base, discounted], 50, today);
  assert.equal(result.recommendation?.offer.detail.id, 2);
  assert.equal(result.recommendation?.comparable.total, 508.5);
  assert.deepEqual(estimateQuotationSelection(base.quotation, [{ detailId: 1, quantity: 50 }]), { gross: 500, discount: 0, subtotal: 500, tax: 65, expenses: 50, expensesAutomatic: true, total: 615, previousTotal: 0, orderTotal: 615 });
});

test('los descuentos y gastos se prorratean con la cantidad original de cada oferta', () => {
  const a = offer(1, { unitPrice: 1, quantity: 100, discount: 10 });
  const b = offer(2, { unitPrice: 1, quantity: 200, availableQuantity: 200, discount: 20 });
  assert.equal(estimateQuotationSelection(a.quotation, [{ detailId: 1, quantity: 50 }]).total, 45);
  assert.equal(estimateQuotationSelection(b.quotation, [{ detailId: 2, quantity: 50 }]).total, 45);
});

test('redondea cada concepto de gasto antes de sumar como la orden', () => {
  const item = offer(1, { quantity: 2, availableQuantity: 2, unitPrice: 1 }, { expenses: [{ amount: '.01', expenseTypeId: 1 }, { amount: '.01', expenseTypeId: 2 }], additionalExpenses: '.02' });
  const estimate = estimateQuotationSelection(item.quotation, [{ detailId: 1, quantity: 1 }]);
  assert.equal(estimate.expenses, .02);
  assert.equal(estimate.total, 1.02);
});

test('dos productos del mismo proveedor comparten el gasto de una sola orden', () => {
  const item = offer(1, { quantity: 10, availableQuantity: 10, unitPrice: 10 }, { expenses: [{ amount: '.01', expenseTypeId: 1 }] });
  item.quotation.details.push({ id: 2, quantity: 10, availableQuantity: 10, unitPrice: 10 });
  const estimate = estimateQuotationSelection(item.quotation, [{ detailId: 1, quantity: 10 }, { detailId: 2, quantity: 10 }]);
  assert.equal(estimate.expenses, .01);
  assert.equal(estimate.total, 200.01);
  assert.equal(estimate.orderTotal, 200.01);
});

test('prioriza cubrir toda la cantidad pendiente antes de ofrecer una alternativa parcial barata', () => {
  const partial = offer(1, { unitPrice: .1, availableQuantity: 2 });
  const complete = offer(2, { unitPrice: 5, deliveryDays: 7 });
  const result = recommendComparisonOffer([partial, complete], 10, today);
  assert.equal(result.recommendation?.offer.detail.id, 2);
  assert.equal(result.comparisonQuantity, 10);
  assert.match(result.message, /Cubre la cantidad pendiente/);
});

test('si todas son parciales compara la misma cantidad y conserva el saldo pendiente', () => {
  const a = offer(1, { unitPrice: 2, availableQuantity: 5 });
  const b = offer(2, { unitPrice: 1, availableQuantity: 10 });
  const result = recommendComparisonOffer([a, b], 20, today);
  assert.equal(result.comparisonQuantity, 5);
  assert.equal(result.recommendation?.offer.detail.id, 2);
  assert.equal(result.recommendation?.comparable.total, 5);
  assert.equal(result.recommendation?.maxQuantity, 10);
  assert.match(result.message, /Todas las ofertas son parciales/);
});

test('no mezcla monedas ni supone un tipo de cambio', () => {
  const usd = offer(1), eur = offer(2, { unitPrice: .1 }, { currency: 'EUR' });
  const result = recommendComparisonOffer([usd, eur], 10, today);
  assert.equal(result.recommendation, null);
  assert.deepEqual(result.currencies, ['EUR', 'USD']);
  assert.equal(recommendComparisonOffer([usd, eur], 10, today, 'USD').recommendation?.offer.detail.id, 1);
  assert.equal(recommendComparisonOffer([usd, eur], 10, today, 'GBP').recommendation, null);
});

test('no recomienda ofertas vencidas, rechazadas, agotadas o de proveedores inactivos', () => {
  const expired = offer(1, {}, { validUntil: '2026-10-02' });
  const rejected = offer(2, {}, { status: 'rejected' });
  const empty = offer(3, { availableQuantity: 0 });
  const inactive = { ...offer(4), supplier: { id: 4, name: 'Inactivo', isActive: false } };
  const purchased = offer(5, {}, { orders: [{ status: 'approved' }] });
  const archived = offer(6, {}, { orders: [{ status: 'draft', deletedAt: today }] });
  const malformed = offer(7, { unitPrice: 'NaN' });
  const result = recommendComparisonOffer([expired, rejected, empty, inactive, purchased, archived, malformed], 10, today);
  assert.equal(result.recommendation, null);
  assert.ok(result.evaluations.every(item => !item.eligible));
  assert.equal(evaluateComparisonOffer(offer(8), 10, today).eligible, true, 'la vigencia incluye el día indicado');
});

test('una orden en borrador admite el saldo disponible y las canceladas no consumen cantidades', () => {
  const draft = offer(1, { quantity: 10, availableQuantity: 8 }, { orders: [{ status: 'draft', details: [{ quotationDetailId: 1, quantity: 3, subtotal: 6, discount: 0, taxAmount: 0 }] }, { status: 'cancelled', details: [{ quotationDetailId: 1, quantity: 5, subtotal: 10, discount: 0, taxAmount: 0 }] }] });
  const evaluated = evaluateComparisonOffer(draft, 10, today);
  assert.equal(evaluated.eligible, true);
  assert.equal(evaluated.maxQuantity, 5);
  assert.equal(evaluated.pendingAvailable, 5);
  assert.equal(evaluateComparisonOffer({ ...draft, supplierAlreadyOrdered: true }, 10, today).eligible, false);
});

test('al ampliar el borrador usa redondeo acumulado de descuento, impuesto y gastos', () => {
  const item = offer(1, { quantity: 3, availableQuantity: 3, unitPrice: '.33', discount: '.10', taxRate: 13 }, {
    expenses: [{ expenseTypeId: 1, amount: '.03' }],
    orders: [{ status: 'draft', details: [{ quotationDetailId: 1, quantity: 1, subtotal: '.30', discount: '.03', taxAmount: '.04' }], expenses: [{ expenseTypeId: 1, amount: '.01' }] }],
  });
  const estimate = estimateQuotationSelection(item.quotation, [{ detailId: 1, quantity: 2 }]);
  assert.deepEqual(estimate, { gross: .66, discount: .07, subtotal: .59, tax: .08, expenses: .02, expensesAutomatic: true, total: .69, previousTotal: .35, orderTotal: 1.04 });
});

test('recalcula gastos originales al ampliar pero conserva presupuestos manuales y documentados', () => {
  const item = offer(1, { quantity: 10 }, { expenses: [{ expenseTypeId: 1, description: 'Flete', amount: 10 }], orders: [{ status: 'draft', expenses: [{ expenseTypeId: 1, description: 'Flete', amount: 5 }] }] });
  assert.deepEqual(projectComparisonExpenses(item.quotation, 10, 10, 20), { automatic: true, previous: 5, total: 10, added: 5 });
  item.quotation.orders![0]!.expenses![0]!.amount = 7;
  assert.deepEqual(projectComparisonExpenses(item.quotation, 10, 10, 20), { automatic: false, previous: 7, total: 7, added: 0 });
  item.quotation.orders![0]!.expenses![0]!.amount = 5;
  item.quotation.orders![0]!.expenses![0]!.documents = [{}];
  assert.deepEqual(projectComparisonExpenses(item.quotation, 10, 10, 20), { automatic: false, previous: 5, total: 5, added: 0 });
});

test('al ampliar conserva el centavo de gasto adjudicado con una proporción de un sexto', () => {
  const item = offer(1, { quantity: 1, availableQuantity: 1, unitPrice: 1 }, {
    expenses: [{ expenseTypeId: 1, amount: '.03' }],
    orders: [{ status: 'draft', details: [{ quotationDetailId: 1, quantity: 1, subtotal: 1, discount: 0, taxAmount: 0 }], expenses: [{ expenseTypeId: 1, amount: '.01' }] }],
  });
  item.quotation.details.push({ id: 2, quantity: 5, availableQuantity: 5, unitPrice: 1 });
  assert.deepEqual(projectComparisonExpenses(item.quotation, 1, 3, 6), { automatic: true, previous: .01, total: .02, added: .01 });
  const estimate = estimateQuotationSelection(item.quotation, [{ detailId: 2, quantity: 3 }]);
  assert.equal(estimate.expensesAutomatic, true);
  assert.equal(estimate.expenses, .01);
  assert.equal(estimate.previousTotal, 1.01);
  assert.equal(estimate.total, 3.01);
  assert.equal(estimate.orderTotal, 4.02);
});

test('gastos manuales sin gastos en la cotización permanecen en el presupuesto', () => {
  const item = offer(1, {}, { expenses: [], orders: [{ status: 'draft', expenses: [{ expenseTypeId: 1, amount: 12 }] }] });
  assert.deepEqual(projectComparisonExpenses(item.quotation, 100, 100, 200), { automatic: false, previous: 12, total: 12, added: 0 });
});

test('muestra la entrega más rápida sin convertir un dato ausente en cero días', () => {
  const unknown = offer(1), slow = offer(2, { deliveryDays: 7 }), fastPartial = offer(3, { deliveryDays: 2, availableQuantity: 5 });
  const result = recommendComparisonOffer([unknown, slow, fastPartial], 10, today);
  assert.equal(result.fastest?.offer.detail.id, 3);
  assert.equal(result.recommendation?.offer.detail.id, 2, 'en empate económico entre coberturas completas prefiere plazo conocido');
  assert.equal(result.evaluations[0]!.deliveryDays, null);
});

test('sin cantidad pendiente no sugiere ni altera las ofertas originales', () => {
  const item = offer(1);
  const previous = structuredClone(item);
  assert.equal(recommendComparisonOffer([item], 0, today).recommendation, null);
  recommendComparisonOffer([item], 10, today);
  assert.deepEqual(item, previous);
});
