import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

export function companyTransaction<T>(prisma: PrismaService, companyId: number, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    // Procurement, stock and structural changes must validate the same committed state.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(68431, ${companyId}::integer)::text`;
    return work(tx);
  }, { maxWait: 10000, timeout: 20000 });
}
