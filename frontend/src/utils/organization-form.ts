export function organizationPayload(source: Record<string, unknown>, optional: string[]) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => {
    const normalized = typeof value === 'string' ? value.trim() : value;
    return [key, optional.includes(key) && normalized === '' ? null : normalized];
  }));
}

export function organizationLocations<T extends { warehouseId: number }>(locations: T[], warehouses: { id: number; branchId: number }[], branchId: number | null, warehouseId: number | null): T[] {
  if (warehouseId !== null) return locations.filter(item => item.warehouseId === warehouseId);
  if (branchId === null) return locations;
  const ids = new Set(warehouses.filter(item => item.branchId === branchId).map(item => item.id));
  return locations.filter(item => ids.has(item.warehouseId));
}
