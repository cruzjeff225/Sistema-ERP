import { Prisma } from '@prisma/client';

export function locationMapState(location: { isActive: boolean; deletedAt: Date | null; capacity: number;
  stocks: { quantity: Prisma.Decimal; product: { purchaseUnit: { id: number } } }[] }, warehouseActive: boolean) {
  const positive = location.stocks.filter(stock => stock.quantity.gt(0));
  const comparable = new Set(positive.map(stock => stock.product.purchaseUnit.id)).size <= 1;
  const used = comparable ? positive.reduce((sum, stock) => sum.add(stock.quantity), new Prisma.Decimal(0)) : null;
  const active = location.isActive && !location.deletedAt && warehouseActive;
  const state = !active ? 'INACTIVE' : used && used.gte(location.capacity) ? 'FULL' : positive.length ? 'OCCUPIED' : 'AVAILABLE';
  return { state, usedCapacity: used?.toString() ?? null,
    freeCapacity: used ? Prisma.Decimal.max(0, new Prisma.Decimal(location.capacity).sub(used)).toString() : null };
}
