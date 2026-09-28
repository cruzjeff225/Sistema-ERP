import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { locationMapState } from '../src/modules/inventory/location-map';

const stock = (quantity: string, unitId = 1) => ({ quantity: new Prisma.Decimal(quantity), product: { purchaseUnit: { id: unitId } } });
const slot = { isActive: true, deletedAt: null, capacity: 10, stocks: [] as ReturnType<typeof stock>[] };
assert.deepEqual(locationMapState(slot, true), { state: 'AVAILABLE', usedCapacity: '0', freeCapacity: '10' });
assert.equal(locationMapState({ ...slot, stocks: [stock('0')] }, true).state, 'AVAILABLE');
assert.deepEqual(locationMapState({ ...slot, stocks: [stock('0.1'), stock('0.2')] }, true), { state: 'OCCUPIED', usedCapacity: '0.3', freeCapacity: '9.7' });
assert.equal(locationMapState({ ...slot, stocks: [stock('10')] }, true).state, 'FULL');
assert.deepEqual(locationMapState({ ...slot, stocks: [stock('11')] }, true), { state: 'FULL', usedCapacity: '11', freeCapacity: '0' });
assert.equal(locationMapState({ ...slot, isActive: false, stocks: [stock('10')] }, true).state, 'INACTIVE');
assert.equal(locationMapState(slot, false).state, 'INACTIVE');
assert.equal(locationMapState({ ...slot, deletedAt: new Date() }, true).state, 'INACTIVE');
assert.deepEqual(locationMapState({ ...slot, stocks: [stock('6'), stock('6', 2)] }, true), { state: 'OCCUPIED', usedCapacity: null, freeCapacity: null });
assert.equal(locationMapState({ ...slot, capacity: 0 }, true).state, 'FULL');
console.log('PASS Mapa: vacio, ocupado, lleno, sobrecapacidad, inactivo, borrado, bodega inactiva y unidades mixtas');
