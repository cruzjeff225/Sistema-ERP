import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchPlanError, suggestDispatch, type DispatchDemand, type DispatchStock, type DispatchSpace } from '../src/utils/warehouse-dispatch';

const demand = (id = 1, quantity = 100, dispatchedQuantity = 0, productId = 1, unitId = 1): DispatchDemand => ({ id, productId, unitId, quantity, dispatchedQuantity, product: { name: `Producto ${productId}` }, unit: { name: `Unidad ${unitId}` } });
const stock = (id = 1, quantity = 100, productId = 1, unitId = 1): DispatchStock => ({ quantity, product: { id: productId, purchaseUnit: { id: unitId } }, location: { id, code: `A${id}` } });
const space = (id = 10, capacity = 100, stocks: DispatchSpace['stocks'] = []): DispatchSpace => ({ id, code: `B${id}`, capacity, stocks, isActive: true, deletedAt: null });

test('distribución: usa existencias confirmadas y excluye lo que ya está en tránsito', () => {
  const stocks = [stock(1, 30), stock(2, 90)], spaces = [space(10, 200)];
  const plan = suggestDispatch([demand(1, 100, 40)], stocks, spaces);
  assert.deepEqual(plan.lines.map(l => [l.fromLocationId, l.quantity]), [[1, 30], [2, 30]]);
  assert.deepEqual(plan.shortages, []);
  assert.equal(dispatchPlanError(plan.lines, [demand(1, 100, 40)], stocks, spaces), '');
  assert.equal(stocks[0]!.quantity, 30); assert.equal(spaces[0]!.stocks.length, 0);
});

test('distribución: respeta capacidad, separa unidades y conserva faltantes por producto', () => {
  const plan = suggestDispatch([demand(1, 50), demand(2, 20, 0, 2, 2)], [stock(1, 50), stock(2, 20, 2, 2)], [space(10, 30), space(11, 15)]);
  assert.equal(plan.lines.filter(l => l.productId === 1).reduce((n, l) => n + l.quantity, 0), 45);
  assert.equal(plan.lines.some(l => l.productId === 2), false);
  assert.deepEqual(plan.shortages.map(s => [s.productName, s.quantity, s.reason]), [['Producto 1', 5, 'space'], ['Producto 2', 20, 'space']]);
});

test('distribución: prioriza el mismo producto y un espacio fraccionario no divide una pieza', () => {
  const occupied = [{ productId: 1, quantity: '1', product: { purchaseUnit: { id: 1 } } }];
  const plan = suggestDispatch([demand(1, 3)], [stock(1, 3)], [space(10, 100), space(11, 2.4, occupied)]);
  assert.deepEqual(plan.lines.map(l => [l.toLocationId, l.quantity]), [[11, 1], [10, 2]]);
  assert(plan.lines.every(line=>Number.isInteger(line.quantity)));
  assert.equal(dispatchPlanError([{...plan.lines[0]!,quantity:1.2}],[demand(1,3)],[stock(1,3)],[space(11,2.4,occupied)]).includes('entera'),true);
});

test('distribución: no reutiliza el saldo de origen entre líneas y señala falta de existencias', () => {
  const plan = suggestDispatch([demand(1, 60), demand(2, 60)], [stock(1, 100)], [space(10, 200)]);
  assert.deepEqual(plan.lines.map(l => l.quantity), [60, 40]);
  assert.equal(plan.shortages[0]!.quantity, 20); assert.equal(plan.shortages[0]!.reason, 'stock');
  const invalid = plan.lines.map(l => ({ ...l, quantity: 60 }));
  assert.match(dispatchPlanError(invalid, [demand(1, 60), demand(2, 60)], [stock(1, 100)], [space(10, 200)]), /suficientes existencias/);
});

test('distribución: omite espacios inactivos, eliminados o con unidades incompatibles', () => {
  const slots = [{ ...space(10), isActive: false }, { ...space(11), deletedAt: '2026-10-03' }, space(12, 100, [{ productId: 2, quantity: 1, product: { purchaseUnit: { id: 2 } } }])];
  assert.equal(suggestDispatch([demand()], [stock()], slots).lines.length, 0);
});

test('distribución: revisar el formulario impide sobresolicitud y capacidad compartida', () => {
  const plan = suggestDispatch([demand(1, 100, 20)], [stock(1, 100)], [space(10, 100)]);
  assert.match(dispatchPlanError(plan.lines.map(l => ({ ...l, quantity: 81 })), [demand(1, 100, 20)], [stock(1, 100)], [space(10, 100)]), /tránsito/);
  assert.match(dispatchPlanError([{ ...plan.lines[0]!, quantity: 60 }, { ...plan.lines[0]!, fromLocationId: 2, quantity: 20 }], [demand(1, 100, 20)], [stock(1, 60), stock(2, 20)], [space(10, 70)]), /capacidad/);
});

test('distribución: una edición manual no mezcla unidades en un espacio previsto', () => {
  const demands = [demand(1, 10), demand(2, 10, 0, 2, 2)], stocks = [stock(1, 10), stock(2, 10, 2, 2)], spaces = [space(10, 20), space(11, 20)];
  const plan = suggestDispatch(demands, stocks, spaces);
  assert.equal(dispatchPlanError(plan.lines, demands, stocks, spaces), '');
  assert.match(dispatchPlanError(plan.lines.map(l => ({ ...l, toLocationId: 10 })), demands, stocks, spaces), /otra unidad/);
  assert.match(dispatchPlanError(plan.lines.map(l => ({ ...l, quantity: Number.POSITIVE_INFINITY })), demands, stocks, spaces), /cantidad entera/);
});

test('distribución: exige combinar líneas con la misma solicitud, origen y destino', () => {
  const demands = [demand(1, 100)], stocks = [stock(1, 50), stock(2, 50)], spaces = [space(10, 100), space(11, 100)];
  const plan = suggestDispatch(demands, stocks, spaces);
  assert.equal(dispatchPlanError(plan.lines, demands, stocks, spaces), '');
  assert.match(dispatchPlanError([{ ...plan.lines[0]!, quantity: 20 }, { ...plan.lines[0]!, quantity: 20 }], demands, stocks, spaces), /Combina o retira/);
  assert.equal(dispatchPlanError([{ ...plan.lines[0]!, quantity: 20 }, { ...plan.lines[0]!, toLocationId: 11, quantity: 20 }], demands, stocks, spaces), '');
});

test('distribución: una unidad de existencia desconocida no se puede sugerir ni validar', () => {
  const demands = [demand()], spaces = [space()], known = stock();
  for (const product of [{ id: 1 }, { id: 1, purchaseUnit: {} }]) {
    const unknown = { ...known, product };
    const plan = suggestDispatch(demands, [unknown], spaces);
    assert.equal(plan.lines.length, 0); assert.equal(plan.shortages[0]!.quantity, 100);
    const valid = suggestDispatch(demands, [known], spaces);
    assert.match(dispatchPlanError(valid.lines, demands, [unknown], spaces), /unidad conocida y compatible/);
  }
});
