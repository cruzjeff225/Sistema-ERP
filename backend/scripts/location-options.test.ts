import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { describeSlots, type AllocationSlot } from '../src/modules/inventory/location-allocation';

const stock = (productId: number, unitId: number, quantity: number, name = 'Otro') => ({ productId, quantity: new Prisma.Decimal(quantity), product: { purchaseUnitId: unitId, name } });
const slot = (id: number, code: string, capacity: number, stocks: ReturnType<typeof stock>[] = []): AllocationSlot & { stocks: ReturnType<typeof stock>[] } => ({ id, code, aisle: 'A', rack: '1', level: '1', position: String(id), capacity, stocks });
const options = (slots: ReturnType<typeof slot>[], quantity = 50) => describeSlots(slots, 7, 3, 'Caja', quantity);

test('un espacio con otra unidad no se ofrece y dice por qué', () => {
  const [metal, free] = [slot(1, 'METAL', 500, [stock(9, 4, 20, 'Lámina')]), slot(2, 'LIBRE', 500)];
  const result = options([metal, free]);
  assert.deepEqual(result.map(option => option.code), ['LIBRE', 'METAL'], 'los utilizables van primero');
  const blocked = result.find(option => option.code === 'METAL')!;
  assert.equal(blocked.compatible, false); assert.equal(blocked.availability, 'other_unit'); assert.match(blocked.reason!, /Lámina.*otra unidad.*Caja/);
});

test('sin capacidad suficiente tampoco se ofrece', () => {
  const [tight] = options([slot(1, 'JUSTO', 100, [stock(7, 3, 80)])]);
  assert.equal(tight.compatible, false); assert.equal(tight.availability, 'full'); assert.equal(tight.free, 20); assert.match(tight.reason!, /quedan 20 de 100 y se necesitan 50/);
});

test('se prefiere el espacio que ya guarda el mismo producto, luego uno libre y al final uno con otros productos', () => {
  const result = options([slot(1, 'OTROS', 500, [stock(9, 3, 10)]), slot(2, 'LIBRE', 500), slot(3, 'MISMO', 500, [stock(7, 3, 10)])]);
  assert.deepEqual(result.map(option => [option.code, option.availability]), [['MISMO', 'same_product'], ['LIBRE', 'free'], ['OTROS', 'other_product']]);
  assert.ok(result.every(option => option.compatible));
});

test('el stock en cero no ocupa el espacio', () => {
  const [empty] = options([slot(1, 'VACIO', 500, [stock(9, 4, 0)])]);
  assert.equal(empty.compatible, true); assert.equal(empty.availability, 'free'); assert.equal(empty.free, 500);
});

test('la lista conserva todos los espacios aunque ninguno sirva', () => {
  const result = options([slot(1, 'A', 10), slot(2, 'B', 500, [stock(9, 4, 1)])]);
  assert.equal(result.length, 2); assert.equal(result.some(option => option.compatible), false);
});
