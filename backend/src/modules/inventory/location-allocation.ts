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

export type SlotAvailability = 'free' | 'same_product' | 'other_product' | 'other_unit' | 'full';
export type SlotOption = {
  id: number; code: string; aisle: string; rack: string; level: string; position: string; capacity: number;
  /** Units still free in the space, counting only stock kept in the same unit. */
  free: number;
  availability: SlotAvailability;
  /** The server accepts the placement: same unit everywhere in the space and enough capacity. */
  compatible: boolean;
  /** Why the space cannot be used, in words a warehouse clerk understands. */
  reason: string | null;
};

/**
 * Every space of a warehouse as seen by one received line: whether it can take it and why not.
 * It mirrors the rules enforced when the placement is confirmed, so the screen never offers a space that will be rejected.
 */
export type DescribedSlot = Omit<AllocationSlot, 'stocks'> & { stocks: { productId: number; quantity: Prisma.Decimal; product: { purchaseUnitId: number; name?: string } }[] };
export function describeSlots(slots: DescribedSlot[], productId: number, unitId: number, unitName: string, quantity: number): SlotOption[] {
  const amount = new Prisma.Decimal(quantity);
  const rank: Record<SlotAvailability, number> = { same_product: 0, free: 1, other_product: 2, full: 3, other_unit: 4 };
  const options = slots.map<SlotOption>(slot => {
    const occupied = slot.stocks.filter(stock => stock.quantity.gt(0));
    const used = occupied.reduce((sum, stock) => sum.add(stock.quantity), new Prisma.Decimal(0));
    const base = { id: slot.id, code: slot.code, aisle: slot.aisle, rack: slot.rack, level: slot.level, position: slot.position, capacity: slot.capacity };
    const foreign = occupied.find(stock => stock.product.purchaseUnitId !== unitId);
    if (foreign) return { ...base, free: 0, availability: 'other_unit', compatible: false, reason: `Guarda ${foreign.product.name ?? 'otro producto'} en otra unidad; no se puede mezclar con ${unitName}` };
    const free = Math.max(0, Number(new Prisma.Decimal(slot.capacity).sub(used)));
    if (used.add(amount).gt(slot.capacity)) return { ...base, free, availability: 'full', compatible: false, reason: `Sin capacidad: quedan ${free} de ${slot.capacity} y se necesitan ${quantity}` };
    const availability: SlotAvailability = occupied.some(stock => stock.productId === productId) ? 'same_product' : occupied.length ? 'other_product' : 'free';
    return { ...base, free, availability, compatible: true, reason: null };
  });
  return options.sort((a, b) => Number(b.compatible) - Number(a.compatible) || rank[a.availability] - rank[b.availability] ||
    [a.aisle, a.rack, a.level, a.position, a.code].join('|').localeCompare([b.aisle, b.rack, b.level, b.position, b.code].join('|'), 'es', { numeric: true }) || a.id - b.id);
}
