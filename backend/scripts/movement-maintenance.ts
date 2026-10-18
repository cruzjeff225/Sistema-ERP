import { Prisma } from '@prisma/client';

// RN-INV-007: la base de datos rechaza editar o borrar movimientos de inventario. Solo los scripts de mantenimiento y
// de pruebas que limpian sus propios datos abren una ventana, dentro de su transacción, con esta variable de sesión.
export const allowMovementChanges = (tx: Prisma.TransactionClient) => tx.$executeRaw`SELECT set_config('erp.allow_movement_changes', 'on', true)`;

export async function withMovementChanges<T>(db: { $transaction<R>(work: (tx: Prisma.TransactionClient) => Promise<R>): Promise<R> }, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => { await allowMovementChanges(tx); return work(tx); });
}
