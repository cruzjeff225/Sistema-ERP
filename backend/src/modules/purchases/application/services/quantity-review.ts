import { ConflictException } from '@nestjs/common';

export function assertQuantitiesApproved(process: { quantityReviewStatus: string; quantityRevision: number; quantityApprovedRevision: number | null }) {
  if (process.quantityReviewStatus !== 'approved' || process.quantityApprovedRevision !== process.quantityRevision) {
    throw new ConflictException('Gerencia debe autorizar las cantidades antes de consultar a los proveedores');
  }
}
