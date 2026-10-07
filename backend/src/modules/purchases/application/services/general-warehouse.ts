import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function generalWarehouse(tx: Prisma.TransactionClient, companyId: number) {
  const config = await tx.erpConfiguration.findFirst({ where: { companyId }, include: { generalWarehouse: { include: { branch: true } } } });
  const warehouse = config?.generalWarehouse;
  if (!warehouse) throw new ConflictException('Configure el centro general de almacenaje antes de crear solicitudes u ordenes');
  if (!warehouse.isActive || warehouse.deletedAt || warehouse.branch.companyId !== companyId || !warehouse.branch.isActive || warehouse.branch.deletedAt) throw new BadRequestException('El centro general de almacenaje debe estar activo y pertenecer a la empresa');
  return warehouse;
}
