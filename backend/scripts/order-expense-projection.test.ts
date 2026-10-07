import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectOrderExpenses } from '../src/modules/purchases/application/services/order-expense-projection';

const quotation = [{ expenseTypeId: 1, description: 'Flete', amount: '30' }, { expenseTypeId: 2, description: 'Seguro', amount: '10' }];
test('ampliar orden recalcula cada gasto proporcional sin duplicar filas originales', () => {
  const previous = [{ id: 4, expenseTypeId: 1, description: 'Flete', amount: '5' }, { id: 5, expenseTypeId: 2, description: 'Seguro', amount: '1.67' }];
  const projection = projectOrderExpenses(quotation, previous, 200, 400, 1200);
  assert.equal(projection.automatic, true);
  assert.deepEqual(projection.expenses.map(e => [e.id, e.amount]), [[4, 15], [5, 5]]);
});
test('presupuestos modificados o documentados se conservan al ampliar cantidades', () => {
  for (const previous of [
    [{ id: 4, expenseTypeId: 1, description: 'Flete', amount: 99 }, { id: 5, expenseTypeId: 2, description: 'Seguro', amount: 5 }],
    [{ id: 4, expenseTypeId: 1, description: 'Flete', amount: 15, documents: [{}] }, { id: 5, expenseTypeId: 2, description: 'Seguro', amount: 5 }],
  ]) {
    const projection = projectOrderExpenses(quotation, previous, 600, 600, 1200);
    assert.equal(projection.automatic, false);
    assert.deepEqual(projection.expenses.map(e => [e.id, e.amount]), previous.map(e => [e.id, e.amount]));
  }
  assert.equal(projectOrderExpenses(quotation, [], 600, 600, 1200).automatic, false, 'No restaurar gastos retirados por Compras');
});
test('gastos pequeños omitidos por redondeo aparecen una sola vez al ampliar', () => {
  const projection = projectOrderExpenses([{ expenseTypeId: 1, amount: '.01' }], [], 1, 99, 100);
  assert.equal(projection.automatic, true);
  assert.equal(projection.expenses.length, 1);
  assert.equal(projection.expenses[0].id, undefined);
  assert.equal(projection.expenses[0].amount, .01);
  assert.equal(projectOrderExpenses([], [{ id: 9, expenseTypeId: 3, amount: 100 }], 200, 100, 1200).expenses[0].amount, 100);
});
test('el medio centavo usa el mismo redondeo que la orden original al ampliar', () => {
  const projection = projectOrderExpenses([{ expenseTypeId: 1, amount: '.03' }], [{ id: 4, expenseTypeId: 1, amount: '.01' }], 1, 3, 6);
  assert.equal(projection.automatic, true, 'El gasto original no debe confundirse con un presupuesto manual');
  assert.deepEqual(projection.expenses.map(e => [e.id, e.amount]), [[4, .02]]);
});
