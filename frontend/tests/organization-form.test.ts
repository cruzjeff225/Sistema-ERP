import assert from 'node:assert/strict';
import { test } from 'node:test';
import { organizationLocations, organizationPayload } from '../src/utils/organization-form';

test('una sucursal sin almacenes nunca muestra espacios de otras sucursales', () => {
  const warehouses = [{ id: 10, branchId: 1 }, { id: 20, branchId: 2 }];
  const locations = [{ id: 1, warehouseId: 10 }, { id: 2, warehouseId: 20 }];
  assert.deepEqual(organizationLocations(locations, warehouses, 3, null), []);
  assert.deepEqual(organizationLocations(locations, warehouses, 1, null), [locations[0]]);
  assert.deepEqual(organizationLocations(locations, warehouses, null, null), locations);
  assert.deepEqual(organizationLocations(locations, warehouses, 2, 20), [locations[1]]);
});

test('edicion envia null para borrar datos opcionales y normaliza espacios', () => {
  assert.deepEqual(organizationPayload({ name: ' Bodega ', email: ' ', notes: '', capacity: 12 }, ['email', 'notes']),
    { name: 'Bodega', email: null, notes: null, capacity: 12 });
  assert.deepEqual(organizationPayload({ name: '   ' }, []), { name: '' });
});
