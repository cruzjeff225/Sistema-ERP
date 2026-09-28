import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type AllocationSlot = {
  id: number; code: string; aisle: string; rack: string; level: string; position: string; capacity: number;
  stocks: { productId: number; quantity: Prisma.Decimal; product: { purchaseUnitId: number } }[];
};

// Capacity is expressed in purchase units, never kilograms or inferred dimensions.
// Do not add quantities with different units when estimating free capacity.
export function allocateLocation(slots: AllocationSlot[], productId: number, unitId: number, quantity: number): number {
  const amount = new Prisma.Decimal(quantity);
  const candidates = slots.flatMap(slot => {
    const occupied = slot.stocks.filter(stock => stock.quantity.gt(0));
    const sameProduct = occupied.some(stock => stock.productId === productId);
    if (occupied.some(stock => stock.product.purchaseUnitId !== unitId) || (!sameProduct && occupied.length)) return [];
    const used = occupied.reduce((sum, stock) => sum.add(stock.quantity), new Prisma.Decimal(0));
    if (used.add(amount).gt(slot.capacity)) return [];
    return [{ slot, priority: sameProduct ? 0 : 1 }];
  }).sort((a, b) => a.priority - b.priority ||
    [a.slot.aisle, a.slot.rack, a.slot.level, a.slot.position, a.slot.code].join('|').localeCompare(
      [b.slot.aisle, b.slot.rack, b.slot.level, b.slot.position, b.slot.code].join('|'), 'es', { numeric: true }) || a.slot.id - b.slot.id);
  const selected = candidates[0]?.slot;
  if (!selected) throw new ConflictException('No hay espacio compatible con capacidad suficiente para esta linea. Configure una ubicacion disponible o seleccione el destino manualmente tras verificarlo.');
  const stock = selected.stocks.find(row => row.productId === productId);
  if (stock) stock.quantity = stock.quantity.add(amount);
  else selected.stocks.push({ productId, quantity: amount, product: { purchaseUnitId: unitId } });
  return selected.id;
}
