export type MapWarehouse = {
  id: number;
  name: string;
  branchId?: number;
  branch: { id?: number; name: string };
  locations: { id: number }[];
};

export function warehouseBranchKey(warehouse: MapWarehouse): string {
  const id = warehouse.branchId ?? warehouse.branch.id;
  // Legacy records without a branch id remain separate instead of merging namesakes.
  return id === undefined ? `warehouse:${warehouse.id}` : `branch:${id}`;
}

export function warehouseBranches(warehouses: MapWarehouse[]) {
  const branches = new Map<string, { key: string; name: string }>();
  for (const warehouse of warehouses) {
    const key = warehouseBranchKey(warehouse);
    branches.set(key, { key, name: warehouse.branch.name });
  }
  return [...branches.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

export function resolveMapWarehouse(warehouses: MapWarehouse[], preferredId = 0, currentId = 0): number {
  if (warehouses.some(warehouse => warehouse.id === preferredId)) return preferredId;
  if (warehouses.some(warehouse => warehouse.id === currentId)) return currentId;
  return warehouses.length === 1 ? warehouses[0]!.id : 0;
}

export type MapSearchSlot = {
  code: string; aisle: string; rack: string; level: string; position: string;
  stocks: { product: { name: string; sku: string } }[];
};

export function matchesMapSearch(slot: MapSearchSlot, query: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const value = normalize(query.trim());
  return !value || normalize([slot.code, slot.aisle, slot.rack, slot.level, slot.position,
    ...slot.stocks.flatMap(stock => [stock.product.name, stock.product.sku])].join(' ')).includes(value);
}
