import test from 'node:test';
import assert from 'node:assert/strict';
import { retaceoStepError } from '../src/utils/retaceo-validation';
const draft = () => ({ purchaseId: 1, retaceoDate: '2026-09-28', totalFreight: 10, totalExpenses: 0, totalDai: 0, importVat: 13, details: [{ costFob: 100 }] });
test('receipt step requires source, products and date', () => {
  assert.ok(retaceoStepError({ ...draft(), purchaseId: 0 }, 1));
  assert.ok(retaceoStepError({ ...draft(), details: [] }, 1));
  assert.ok(retaceoStepError({ ...draft(), retaceoDate: '' }, 1));
  assert.equal(retaceoStepError(draft(), 1), '');
});
test('cost review rejects blank, negative and non-finite amounts', () => {
  for (const invalid of ['', -1, NaN, Infinity, 'abc']) {
    assert.ok(retaceoStepError({ ...draft(), totalFreight: invalid }, 2));
    assert.ok(retaceoStepError({ ...draft(), details: [{ costFob: invalid }] }, 2));
  }
  assert.equal(retaceoStepError(draft(), 3), '');
});
test('expenses need a positive basis and import VAT is excluded', () => {
  assert.ok(retaceoStepError({ ...draft(), details: [{ costFob: 0 }] }, 2));
  assert.equal(retaceoStepError({ ...draft(), details: [{ costFob: 0 }], totalFreight: 0 }, 2), '');
});
