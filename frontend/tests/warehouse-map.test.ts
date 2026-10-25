import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesMapSearch, resolveMapWarehouse, warehouseBranches, type MapWarehouse } from '../src/utils/warehouse-map';

const warehouse = (id: number, branchId?: number, branchName = 'Central'): MapWarehouse => ({ id, name: `Almacén ${id}`, branchId, branch: { name: branchName }, locations: [] });

test('mapa: conserva un almacén válido y no elige arbitrariamente entre varios', () => {
  const options = [warehouse(1, 10), warehouse(2, 20)];
  assert.equal(resolveMapWarehouse(options), 0);
  assert.equal(resolveMapWarehouse(options, 99, 2), 2);
  assert.equal(resolveMapWarehouse(options, 1, 2), 1);
  assert.equal(resolveMapWarehouse([warehouse(3, 30)], 1, 2), 3);
  assert.equal(resolveMapWarehouse([], 1, 2), 0);
});

test('mapa: distingue sucursales homónimas y agrupa varios almacenes del mismo ID', () => {
  assert.deepEqual(warehouseBranches([warehouse(1, 10), warehouse(2, 10), warehouse(3, 20)]).map(branch => branch.key), ['branch:10', 'branch:20']);
  assert.equal(warehouseBranches([warehouse(1), warehouse(2)]).length, 2);
});

test('mapa: búsqueda sin tildes incluye producto, SKU y coordenadas físicas', () => {
  const slot = { code: 'A-1', aisle: 'Norte', rack: 'R2', level: 'Superior', position: 'P8', stocks: [{ product: { name: 'Lámina metálica', sku: 'LAM-04' } }] };
  for (const value of ['  lamina ', 'METÁLICA', 'lam-04', 'superior', 'p8', 'norte', '']) assert.equal(matchesMapSearch(slot, value), true);
  assert.equal(matchesMapSearch(slot, 'sur'), false);
});
