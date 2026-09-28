import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retaceoSourceFields } from '../src/utils/retaceo-form';
import { comparisonRequestId } from '../src/utils/purchase-workflow';

test('cambiar recepcion elimina datos monetarios y documentales del origen anterior', () => {
  const form = { purchaseId: 1, ...retaceoSourceFields(), totalFreight: 55, totalExpenses: 12, totalDai: 8, importVat: 14,
    originCountry: 'Anterior', importPolicyNumber: 'POL-1', importPolicyDate: '2026-09-20', notes: 'Anterior' };
  Object.assign(form, { purchaseId: 2 }, retaceoSourceFields({ supplierInvoiceNumber: 'FAC-2', supplierInvoiceDate: '2026-09-28T00:00:00Z', items: [{ id: 23, lineTotal: '120.25' }] }));
  assert.equal(form.purchaseId, 2);
  assert.equal(form.importInvoiceNumber, 'FAC-2');
  assert.equal(form.importInvoiceDate, '2026-09-28');
  assert.deepEqual(form.details, [{ purchaseItemId: 23, costFob: 120.25 }]);
  for (const value of [form.totalFreight, form.totalExpenses, form.totalDai, form.importVat]) assert.equal(value, 0);
  for (const value of [form.originCountry, form.importPolicyNumber, form.importPolicyDate, form.notes]) assert.equal(value, '');
});

test('origen sin factura no hereda la factura anterior', () => {
  assert.equal(retaceoSourceFields({ items: [] }).importInvoiceNumber, '');
  assert.equal(retaceoSourceFields({ items: [] }).importInvoiceDate, '');
  assert.deepEqual(retaceoSourceFields().details, []);
});

test('comparacion no reemplaza un enlace invalido por otra solicitud', () => {
  const options = [{ id: 2 }, { id: 3 }];
  assert.equal(comparisonRequestId(options, '3'), 3);
  for (const invalid of ['9', '0', '-2', '2x', '', ['2']]) assert.equal(comparisonRequestId(options, invalid, 2), 0);
  assert.equal(comparisonRequestId(options, undefined), 0);
  assert.equal(comparisonRequestId([{ id: 2 }], undefined), 2);
  assert.equal(comparisonRequestId(options, undefined, 3), 3);
});
