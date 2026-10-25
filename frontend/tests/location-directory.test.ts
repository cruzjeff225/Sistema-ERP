import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locationDirectoryAisles, locationDirectoryContext, locationDirectoryFormOptions, locationDirectoryGroups, locationDirectoryRows } from '../src/utils/location-directory';

const warehouses = [{ id: 10, branchId: 1 }, { id: 20, branchId: 2 }];
const row = (id: number, warehouseId: number, aisle: string, rack: string, level: string, position: string, isActive = true) => ({ id, warehouseId, code: `ESP-${id}`, aisle, rack, level, position, isActive, notes: '' });
const rows = [row(1, 10, 'A10', 'E2', '1', '2'), row(2, 10, 'A2', 'E10', '1', '1'), row(3, 10, 'A2', 'E2', '2', '10'), row(4, 10, 'A2', 'E2', '2', '2', false), row(5, 20, 'A1', 'E1', '1', '1')];

test('sin almacén explícito y válido no aparecen espacios de otra sucursal', () => {
  assert.deepEqual(locationDirectoryRows(rows, null), []);
  assert.deepEqual(locationDirectoryContext(warehouses, 3, null), { branchId: 3, warehouse: null });
  assert.deepEqual(locationDirectoryContext(warehouses, 1, 20), { branchId: 1, warehouse: null });
  assert.deepEqual(locationDirectoryContext(warehouses, null, 99), { branchId: null, warehouse: null });
  assert.deepEqual(locationDirectoryContext(warehouses, null, 20), { branchId: 2, warehouse: warehouses[1] });
});

test('ordena coordenadas naturalmente y filtra estado, pasillo y código sin cambiar registros', () => {
  assert.deepEqual(locationDirectoryRows(rows, 10).map(item => item.id), [4, 3, 2, 1]);
  assert.deepEqual(locationDirectoryRows(rows, 10, { status: 'inactive', aisle: 'A2', search: ' ESP-4 ' }).map(item => item.id), [4]);
  assert.deepEqual(locationDirectoryRows(rows, 10, { status: 'active' }).map(item => item.id), [3, 2, 1]);
  assert.deepEqual(rows.map(item => item.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(locationDirectoryRows([...rows, row(6, 10, '', 'E1', '1', '1')], 10, { aisle: '' }).map(item => item.id), [6]);
});

test('agrupa exactamente pasillo y estante y mantiene cada espacio una sola vez', () => {
  const filtered = locationDirectoryRows(rows, 10);
  const groups = locationDirectoryGroups(filtered);
  assert.deepEqual(groups.map(group => [group.aisle, group.rack, group.rows.map(item => item.id)]), [['A2', 'E2', [4, 3]], ['A2', 'E10', [2]], ['A10', 'E2', [1]]]);
  assert.deepEqual(locationDirectoryAisles(filtered), ['A2', 'A10']);
  assert.equal(locationDirectoryGroups([row(6, 10, 'A-B', 'C', '1', '1'), row(7, 10, 'A', 'B-C', '1', '1')]).length, 2);
});

test('el editor admite nombres heredados de espacios sin permisos de lectura sobre padres y conserva selección original inactiva', () => {
  const parents = [{ id: 1, name: 'Sucursal heredada' }, { id: 2, name: 'Activa', isActive: true }, { id: 3, name: 'Inactiva', isActive: false }, { id: 4, name: 'Almacén con sucursal inactiva', isActive: true, branch: { isActive: false } }];
  assert.deepEqual(locationDirectoryFormOptions(parents, null).map(item => item.id), [1, 2]);
  assert.deepEqual(locationDirectoryFormOptions(parents, '3').map(item => item.id), [1, 2, 3]);
  assert.deepEqual(locationDirectoryFormOptions(parents, '4').map(item => item.id), [1, 2, 4]);
});
