import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { QueryReceiptsDto, UpdateReceiptDto } from "../dto/purchase-receipt.dto";
import { purchaseTransaction } from "./purchase-transaction";
import { InventoryService } from "../../../inventory/inventory.service";

const receiptInclude = {
  supplier: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  user: { select: { id: true, username: true } },
  purchaseOrder: { select: {
    id: true, code: true, status: true,
    quotation: { select: { id: true, code: true, requestLinks: { include: { request: { select: { id: true, code: true, justification: true, user: { select: { username: true } } } } } } } },
    expenses: { include: { expenseType: true, documents: true } },
  } },
  items: { include: {
    unit: { select: { id: true, name: true, type: true } },
    product: { select: { id: true, name: true, sku: true } },
    location: { select: { id: true, code: true, aisle: true, rack: true, level: true, position: true } },
    purchaseOrderDetail: { include: { unit: { select: { id: true, name: true } } } },
  }, orderBy: { id: "asc" as const } },
  retaceos: { where: { deletedAt: null }, select: { id: true, code: true, status: true, totalCost: true } },
} satisfies Prisma.PurchaseInclude;

@Injectable()
export class PurchaseReceiptsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly inventory: InventoryService) {}

  async findAll(query: QueryReceiptsDto, companyId: number) {
    const where: Prisma.PurchaseWhereInput = {
      companyId, ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim() ? { OR: [
        { documentNumber: { contains: query.search.trim(), mode: "insensitive" } },
        { supplierInvoiceNumber: { contains: query.search.trim(), mode: "insensitive" } },
        { supplier: { name: { contains: query.search.trim(), mode: "insensitive" } } },
        { purchaseOrder: { code: { contains: query.search.trim(), mode: 'insensitive' } } },
        { items: { some: { product: { OR: [{ name: { contains: query.search.trim(), mode: 'insensitive' } }, { sku: { contains: query.search.trim(), mode: 'insensitive' } }] } } } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({ where, include: receiptInclude, orderBy: [{ purchaseDate: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.purchase.count({ where }),
    ]);
    return { items, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async findOne(id: number, companyId: number, db: Prisma.TransactionClient = this.prisma) {
    const receipt = await db.purchase.findFirst({ where: { id, companyId }, include: receiptInclude });
    if (!receipt) throw new NotFoundException("Recepcion no encontrada");
    return receipt;
  }

  update(id: number, dto: UpdateReceiptDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.findOne(id, companyId, tx);
      if (current.status !== "RECEIVED" || current.retaceos.some((r) => r.status !== "cancelled")) throw new ConflictException("Solo se pueden corregir datos documentales antes de verificar o retacear la recepcion");
      const result = await tx.purchase.update({ where: { id }, data: {
        ...(dto.supplierInvoiceNumber !== undefined ? { supplierInvoiceNumber: dto.supplierInvoiceNumber.trim() || null } : {}),
        ...(dto.supplierInvoiceDate !== undefined ? { supplierInvoiceDate: dto.supplierInvoiceDate ? new Date(dto.supplierInvoiceDate) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      }, include: receiptInclude });
      await this.audit.record(tx, { controller: "purchases", action: "UPDATE", recordId: id, originalData: current, modifiedData: result, userId });
      return result;
    });
  }

  transition(id: number, action: "verify" | "close" | "cancel", reason: string | undefined, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.findOne(id, companyId, tx);
      const allowed = action === "verify" ? ["RECEIVED"] : action === "close" ? ["VERIFIED", "COSTED"] : ["RECEIVED", "VERIFIED"];
      if (!allowed.includes(current.status)) throw new ConflictException("La accion no esta disponible para el estado actual de la compra");
      if (action === "cancel" && !reason?.trim()) throw new BadRequestException("Indique el motivo de cancelacion");
      const activeRetaceos = current.retaceos.filter((r) => r.status !== "cancelled");
      if (action === "cancel" && activeRetaceos.length) throw new ConflictException("Cancele primero el retaceo; un retaceo cerrado no puede revertirse");
      if (action === "close" && activeRetaceos.some((r) => r.status !== "closed")) throw new ConflictException("Cierre el retaceo antes de cerrar la compra");
      if (action === "cancel") {
        if (!current.purchaseOrderId || current.items.some((item) => !item.purchaseOrderDetailId)) throw new ConflictException("La compra historica no tiene trazabilidad suficiente para revertirla");
        for (const item of current.items) {
          const posted = await tx.inventoryMovement.findUnique({ where: { key: `receipt:${item.id}` } });
          if (posted) await this.inventory.post(tx, companyId, userId, { productId: item.productId, locationId: item.locationId, quantity: item.quantity.negated(), type: 'REVERSAL', key: `reversal:${item.id}`, purchaseItemId: item.id, reason: `Cancelacion ${current.documentNumber}: ${reason}` });
          const changed = await tx.purchaseOrderDetail.updateMany({ where: { id: item.purchaseOrderDetailId!, orderId: current.purchaseOrderId, receivedQuantity: { gte: item.quantity } }, data: { receivedQuantity: { decrement: item.quantity } } });
          if (changed.count !== 1) throw new ConflictException("El saldo recibido no coincide con la orden");
        }
        const lines = await tx.purchaseOrderDetail.findMany({ where: { orderId: current.purchaseOrderId } });
        const status = lines.every((line) => line.receivedQuantity.gte(line.quantity)) ? "received" : lines.some((line) => line.receivedQuantity.gt(0)) ? "partially_received" : "approved";
        const order = await tx.purchaseOrder.update({ where: { id: current.purchaseOrderId }, data: { status } });
        await this.audit.record(tx, { controller: "purchase_orders", action: "REVERSE_RECEIPT", recordId: order.id, originalData: current.purchaseOrder, modifiedData: order, userId });
      }
      const status = action === "verify" ? "VERIFIED" : action === "close" ? "CLOSED" : "CANCELLED";
      const result = await tx.purchase.update({ where: { id }, data: { status, ...(reason?.trim() ? { notes: [current.notes, reason.trim()].filter(Boolean).join("\n") } : {}) }, include: receiptInclude });
      await this.audit.record(tx, { controller: "purchases", action: action.toUpperCase(), recordId: id, originalData: current, modifiedData: result, userId });
      return result;
    });
  }
}
