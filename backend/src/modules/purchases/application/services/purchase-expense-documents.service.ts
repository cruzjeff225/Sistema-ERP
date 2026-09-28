import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { purchaseTransaction } from "./purchase-transaction";

@Injectable()
export class PurchaseExpenseDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    expenseId: number,
    file: { originalname: string; mimetype: string; filename: string },
    userId: number,
    companyId: number,
  ) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const expense = await tx.purchaseOrderExpense.findFirst({ where: { id: expenseId, order: { companyId, deletedAt: null } }, include: { order: true } });
      if (!expense) throw new NotFoundException("Gasto de orden no encontrado");
      if (expense.order.status === "cancelled") throw new ConflictException("No se pueden adjuntar documentos a una orden cancelada");
      const document = await tx.purchaseOrderExpenseDocument.create({
        data: {
          expenseId,
          fileName: file.originalname,
          filePath: `/uploads/purchase-expenses/${file.filename}`,
          fileType: file.mimetype,
        },
      });
      await this.audit.record(tx, { controller: "purchase_order_expense_documents", action: "CREATE", recordId: document.id, modifiedData: document, userId });
      return document;
    });
  }

  async remove(id: number, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
    const document = await tx.purchaseOrderExpenseDocument.findFirst({
      where: { id, expense: { order: { companyId, deletedAt: null } } },
      include: { expense: { include: { order: { select: { status: true } } } } },
    });
    if (!document) throw new NotFoundException("Documento de gasto no encontrado");
    if (document.expense.order.status === "cancelled") throw new ConflictException("No se pueden modificar documentos de una orden cancelada");
      await tx.purchaseOrderExpenseDocument.delete({ where: { id } });
      await this.audit.record(tx, { controller: "purchase_order_expense_documents", action: "DELETE", recordId: id, originalData: document, modifiedData: null, userId });
      return document;
    });
  }

  async findOne(id: number, companyId: number) {
    const document = await this.prisma.purchaseOrderExpenseDocument.findFirst({ where: { id, expense: { order: { companyId, deletedAt: null } } } });
    if (!document) throw new NotFoundException("Documento de gasto no encontrado");
    return document;
  }
}
