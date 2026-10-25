import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quotationExpenseCapabilities, quotationExpenseUpdate } from '../src/utils/quotation-offer-expenses';

const original = [{ expenseTypeId: 3, amount: '120.00', description: 'Flete' }];

test('gastos ofertados: corregir precios conserva gastos cuando no se autorizó modificarlos', () => {
  assert.deepEqual(quotationExpenseUpdate([], original, { create: true, update: false }), {});
  assert.deepEqual(quotationExpenseUpdate(original, original, { create: false, update: false }), {});
  assert.deepEqual(quotationExpenseCapabilities(original.length, { create: true, update: false }), { edit: false, add: false });
});

test('gastos ofertados: omite valores iguales aunque la API entregue decimales como texto', () => {
  assert.deepEqual(quotationExpenseUpdate([{ ...original[0]!, amount: 120 }], original, { create: true, update: true }), {});
});

test('gastos ofertados: crear, modificar y eliminar requieren los permisos correspondientes', () => {
  assert.deepEqual(quotationExpenseUpdate(original, [], { create: true, update: false }), { expenses: [{ expenseTypeId: 3, amount: 120, description: 'Flete' }] });
  assert.deepEqual(quotationExpenseUpdate([{ ...original[0]!, amount: 130 }], original, { create: false, update: true }), { expenses: [{ expenseTypeId: 3, amount: 130, description: 'Flete' }] });
  assert.deepEqual(quotationExpenseUpdate([], original, { create: false, update: true }), { expenses: [] });
  assert.deepEqual(quotationExpenseUpdate([...original, { expenseTypeId: 4, amount: 20 }], original, { create: false, update: true }), {});
  assert.deepEqual(quotationExpenseCapabilities(0, { create: true, update: false }), { edit: true, add: true });
  assert.deepEqual(quotationExpenseCapabilities(1, { create: false, update: true }), { edit: true, add: false });
});
