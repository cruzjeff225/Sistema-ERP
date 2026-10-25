import { Prisma } from "@prisma/client";

export function allocateCost(total: number, bases: number[]): number[] {
  const cents = (value: number) => BigInt(new Prisma.Decimal(value).times(100).toFixed(0));
  const amount = cents(total);
  const weights = bases.map(cents);
  const denominator = weights.reduce((sum, weight) => sum + weight, 0n);
  if (amount < 0n || weights.some((weight) => weight < 0n)) throw new Error("Los costos no pueden ser negativos");
  if (!denominator) {
    if (amount) throw new Error("Se requiere una base FOB para distribuir costos");
    return bases.map(() => 0);
  }
  const allocated = weights.map((weight) => amount * weight / denominator);
  const remainders = weights.map((weight, index) => ({ index, remainder: amount * weight % denominator }));
  remainders.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const remaining = Number(amount - allocated.reduce((sum, value) => sum + value, 0n));
  // Largest remainders preserve every cent without making the final line negative.
  for (let index = 0; index < remaining; index += 1) allocated[remainders[index].index] += 1n;
  return allocated.map((value) => Number(value) / 100);
}
