import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

export type CostBalance = { quantity: Prisma.Decimal; value: Prisma.Decimal; average: Prisma.Decimal };

/** Valores y promedios se redondean como se almacenan: 2 decimales el valor, 4 el costo unitario. */
const balance = (quantity: Prisma.Decimal, value: Prisma.Decimal, average: Prisma.Decimal): CostBalance => ({
  quantity, value: value.toDecimalPlaces(2), average: average.toDecimalPlaces(4),
});

/** RN-INV-014: (valor anterior + valor de entrada) / (cantidad anterior + cantidad de entrada). */
export function applyEntry(current: CostBalance, quantity: Prisma.Decimal.Value, unitCost: Prisma.Decimal.Value): CostBalance {
  const qty = D(quantity);
  const total = current.quantity.add(qty);
  const value = current.value.add(qty.mul(unitCost));
  return balance(total, value, total.gt(0) ? value.div(total) : current.average);
}

/** Una salida se valora al promedio vigente; el promedio no cambia, salvo que el saldo quede en cero. */
export function applyExit(current: CostBalance, quantity: Prisma.Decimal.Value): CostBalance {
  const qty = D(quantity);
  const remaining = current.quantity.sub(qty);
  if (remaining.lt(0)) throw new ConflictException('Existencias insuficientes para registrar la salida');
  return balance(remaining, remaining.isZero() ? D(0) : current.value.sub(qty.mul(current.average)), current.average);
}

/** Ajusta el valor de las unidades que siguen en existencia (por ejemplo, al cerrarse el retaceo). */
export function applyRevaluation(current: CostBalance, delta: Prisma.Decimal.Value): CostBalance {
  const value = current.value.add(delta);
  return balance(current.quantity, value, current.quantity.gt(0) ? value.div(current.quantity) : current.average);
}

export type LotSlice = { lotId: number; locationId: number; quantity: Prisma.Decimal };
export type LotAvailability = { lotId: number; locationId: number; available: Prisma.Decimal; receivedAt: Date };

/** Toma primero el lote más antiguo (FIFO físico); un lote solicitado explícitamente tiene prioridad. */
export function allocateFifo(rows: LotAvailability[], quantity: Prisma.Decimal.Value, preferredLotId?: number): LotSlice[] {
  let pending = D(quantity);
  const ordered = [...rows].filter(row => row.available.gt(0) && (preferredLotId === undefined || row.lotId === preferredLotId))
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.lotId - b.lotId);
  const slices: LotSlice[] = [];
  for (const row of ordered) {
    if (pending.lte(0)) break;
    const take = Prisma.Decimal.min(pending, row.available);
    slices.push({ lotId: row.lotId, locationId: row.locationId, quantity: take });
    pending = pending.sub(take);
  }
  if (pending.gt(0)) throw new ConflictException('Existencias insuficientes en la ubicación seleccionada');
  return slices;
}

/** Código de lote legible y estable: la recepción confirmada que lo origina. */
export const lotCodeForReceipt = (purchaseItemId: number) => `LT-${String(purchaseItemId).padStart(6, '0')}`;
export const lotCodeForOpening = (lotId: number) => `LT-INI-${String(lotId).padStart(6, '0')}`;
