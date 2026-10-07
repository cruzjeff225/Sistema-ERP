import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterQuotationProcesses, quotationProcessDay } from '../src/utils/quotation-process-inbox';

const now = new Date('2026-10-03T18:00:00Z');
const documents = [
  { id: 1, code: 'CON-A', dateFrom: '2026-09-15T00:00:00Z', dateTo: '2026-09-16T00:00:00Z', createdAt: '2026-09-17T12:00:00Z' },
  { id: 2, code: 'CON-B', dateFrom: '2026-09-15T00:00:00Z', dateTo: '2026-09-16T00:00:00Z', createdAt: '2026-09-28T06:00:00Z' },
  { id: 3, code: 'CON-C', dateFrom: '2026-10-01T00:00:00Z', dateTo: '2026-10-03T00:00:00Z', createdAt: '2026-10-03T10:00:00Z' },
];
const filters = { period: 'week' as const, search: '', from: '', to: '' };

test('gestiones: la semana corresponde a la creación local, sin confundir el rango de solicitudes', () => {
  assert.deepEqual(filterQuotationProcesses(documents, filters, now).map(d => d.id), [3, 2]);
  assert.equal(quotationProcessDay({ ...documents[1]!, createdAt: '2026-09-28T05:59:59Z' }), '2026-09-27');
});

test('gestiones: Anteriores contiene todas y permite combinar búsqueda con fechas inclusivas', () => {
  assert.deepEqual(filterQuotationProcesses(documents, { ...filters, period: 'all' }, now).map(d => d.id), [3, 2, 1]);
  assert.deepEqual(filterQuotationProcesses(documents, { ...filters, period: 'all', from: '2026-09-28', to: '2026-10-03', search: 'con-b' }, now).map(d => d.id), [2]);
  assert.deepEqual(filterQuotationProcesses(documents, { ...filters, period: 'all', search: '3' }, now).map(d => d.id), [3]);
});

test('gestiones históricas: fecha de rango guardada como UTC conserva el día si no hay creación', () => {
  assert.equal(quotationProcessDay({ ...documents[2]!, createdAt: undefined }), '2026-10-03');
  assert.deepEqual(filterQuotationProcesses([{ ...documents[2]!, createdAt: 'invalida' }], filters, now), []);
});
