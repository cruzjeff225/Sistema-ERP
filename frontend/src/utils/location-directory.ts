export type LocationDirectoryRow = {
  id: number;
  warehouseId: number;
  code: string;
  aisle: string;
  rack: string;
  level: string;
  position: string;
  notes?: string | null;
  isActive: boolean;
};

export type LocationDirectoryStatus = 'all' | 'active' | 'inactive';
const coordinateOrder = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export function locationDirectoryContext<T extends { id: number; branchId: number }>(warehouses: T[], branchId: number | null, warehouseId: number | null) {
  const requestedWarehouse = warehouses.find(item => item.id === warehouseId) ?? null;
  const resolvedBranchId = branchId ?? requestedWarehouse?.branchId ?? null;
  return {
    branchId: resolvedBranchId,
    warehouse: requestedWarehouse?.branchId === resolvedBranchId ? requestedWarehouse : null,
  };
}

export function locationDirectoryRows<T extends LocationDirectoryRow>(locations: T[], warehouseId: number | null, filters: { search?: string; status?: LocationDirectoryStatus; aisle?: string | null } = {}): T[] {
  if (warehouseId === null) return [];
  const term = filters.search?.trim().toLocaleLowerCase('es') ?? '';
  return locations.filter(item => item.warehouseId === warehouseId
    && (filters.status !== 'active' || item.isActive)
    && (filters.status !== 'inactive' || !item.isActive)
    && (filters.aisle == null || item.aisle === filters.aisle)
    && (!term || [item.code, item.aisle, item.rack, item.level, item.position, item.notes ?? ''].join(' ').toLocaleLowerCase('es').includes(term)))
    .sort((a, b) => coordinateOrder.compare(a.aisle, b.aisle)
      || coordinateOrder.compare(a.rack, b.rack)
      || coordinateOrder.compare(a.level, b.level)
      || coordinateOrder.compare(a.position, b.position)
      || coordinateOrder.compare(a.code, b.code)
      || a.id - b.id);
}

export function locationDirectoryGroups<T extends LocationDirectoryRow>(rows: T[]) {
  const groups = new Map<string, { key: string; aisle: string; rack: string; rows: T[] }>();
  for (const row of rows) {
    const key = JSON.stringify([row.aisle, row.rack]);
    if (!groups.has(key)) groups.set(key, { key, aisle: row.aisle, rack: row.rack, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()];
}

export function locationDirectoryAisles(rows: LocationDirectoryRow[]) {
  return [...new Set(rows.map(row => row.aisle))].sort(coordinateOrder.compare);
}

export function locationDirectoryFormOptions<T extends { id: number; isActive?: boolean; branch?: { isActive?: boolean } }>(rows: T[], selectedId: string | number | null): T[] {
  // Nested names in /locations may omit status. The write API validates parents.
  return rows.filter(row => (row.isActive !== false && row.branch?.isActive !== false)
    || String(row.id) === String(selectedId));
}
