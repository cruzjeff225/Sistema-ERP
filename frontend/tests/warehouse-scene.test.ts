import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWarehouseScene, fillRatio, type AisleInput, type MapSlot } from '../src/utils/warehouse-scene';

const slot = (id: number, state: MapSlot['state'], used: string | null, capacity = 100): MapSlot => ({ id, code: `S${id}`, aisle: 'A', rack: '1', level: '1', position: String(id), capacity, state, usedCapacity: used, freeCapacity: null, stocks: [] });
const aisle = (name: string, racks: AisleInput['racks']): AisleInput => ({ name, racks });

test('the scene contains exactly the real slots, with no invented cells', () => {
  const data = [
    aisle('A', [{ name: '1', positions: ['1', '2'], levels: [{ name: '2', cells: [slot(1, 'AVAILABLE', null), undefined] }, { name: '1', cells: [slot(2, 'OCCUPIED', '40'), slot(3, 'FULL', '100')] }] }]),
    aisle('B', [{ name: '1', positions: ['1'], levels: [{ name: '1', cells: [slot(4, 'INACTIVE', null)] }] }, { name: '2', positions: ['1'], levels: [{ name: '1', cells: [slot(5, 'OCCUPIED', null)] }] }]),
  ];
  const scene = buildWarehouseScene(data);
  const ids = scene.aisles.flatMap(item => item.racks.flatMap(rack => rack.cells.map(cell => cell.slot.id))).sort();
  assert.deepEqual(ids, [1, 2, 3, 4, 5]);
  assert.deepEqual(scene.aisles.map(item => item.racks.length), [1, 2]);
  assert.equal(scene.aisles[0]!.racks[0]!.levelCount, 2);
});

test('fill proportions exist only with a capacity and a comparable quantity', () => {
  assert.equal(fillRatio(slot(1, 'OCCUPIED', '25')), 0.25);
  assert.equal(fillRatio(slot(1, 'OCCUPIED', null)), null, 'mixed units are never added together');
  assert.equal(fillRatio(slot(1, 'OCCUPIED', '25', 0)), null, 'no capacity means no proportion');
  const scene = buildWarehouseScene([aisle('A', [{ name: '1', positions: ['1', '2'], levels: [{ name: '1', cells: [slot(1, 'OCCUPIED', null), slot(2, 'AVAILABLE', null)] }] }])]);
  const cells = scene.aisles[0]!.racks[0]!.cells;
  assert.ok(cells.every(cell => cell.ratio === null && cell.fill === null));
  assert.equal(scene.hasRatio, false);
});

test('an empty warehouse still produces a valid floor and no racks', () => {
  const scene = buildWarehouseScene([]);
  assert.equal(scene.aisles.length, 0);
  assert.ok(scene.svgW > 0 && scene.svgH > 0);
});

test('every aisle and rack gets its own horizontal label data', () => {
  const scene = buildWarehouseScene([
    aisle('A', [{ name: '1', positions: ['1'], levels: [{ name: '1', cells: [slot(1, 'AVAILABLE', null)] }] }]),
    aisle('B', [{ name: '3', positions: ['1'], levels: [{ name: '1', cells: [slot(2, 'AVAILABLE', null)] }] }]),
  ]);
  assert.deepEqual(scene.aisles.map(item => item.name), ['A', 'B']);
  assert.deepEqual(scene.aisles.map(item => item.racks[0]!.tag.text), ['Estante 1', 'Estante 3']);
});
