import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import {
  CreateExpenseTypeDto,
  CreatePurchaseQuotationDto,
  CreatePurchaseRequestDto,
  GeneratePurchaseOrderDto,
  QueryPurchaseDocumentsDto,
  ReceivePurchaseOrderDto,
  UpdateExpenseTypeDto,
  UpdateExpenseTypeStatusDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseQuotationDto,
  UpdatePurchaseRequestDto,
} from "../dto/purchase-process.dto";

import { purchaseTransaction } from "./purchase-transaction";
import { InventoryService } from "../../../inventory/inventory.service";
import { allocateLocation } from "../../../inventory/location-allocation";
import { AuthenticatedUser } from '../../../auth/presentation/decorators/current-user.decorator';

type Tx = Prisma.TransactionClient;
type SequenceName = "request" | "quotation" | "order" | "receipt";

const requestInclude = {
  branch: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  user: { select: { id: true, username: true, email: true } },
  details: {
    include: {
      product: { select: { id: true, sku: true, internalCode: true, name: true } },
      unit: { select: { id: true, name: true, type: true } },
    },
    orderBy: { id: "asc" as const },
  },
  quotationLinks: {
    include: { quotation: { select: { id: true, code: true, status: true, total: true, supplier: { select: { id: true, name: true } } } } },
  },
};

const quotationInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, username: true } },
  requestLinks: { include: { request: { select: { id: true, code: true, status: true, branchId: true, warehouseId: true } } } },
  details: {
    include: {
      product: { select: { id: true, sku: true, internalCode: true, name: true } },
      unit: { select: { id: true, name: true, type: true } },
      requestDetailLinks: {
        include: { requestDetail: { include: { request: { select: { id: true, code: true } } } } },
      },
    },
    orderBy: { id: "asc" as const },
  },
  expenses: { include: { expenseType: true }, orderBy: { id: "asc" as const } },
  orders: { select: { id: true, code: true, status: true, total: true, details: { select: { quotationDetailId: true, quantity: true } } } },
};

const orderInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  quotation: { select: { id: true, code: true, status: true } },
  user: { select: { id: true, username: true } },
  details: {
    include: {
      product: { select: { id: true, sku: true, internalCode: true, name: true } },
      unit: { select: { id: true, name: true, type: true } },
    },
    orderBy: { id: "asc" as const },
  },
  expenses: {
    include: { expenseType: true, documents: true },
    orderBy: { id: "asc" as const },
  },
  purchases: {
    select: {
      id: true,
      documentNumber: true,
      status: true,
      total: true,
      purchaseDate: true,
      supplierInvoiceNumber: true,
      retaceos: { where: { deletedAt: null }, select: { id: true, code: true, status: true } },
    },
    orderBy: { purchaseDate: "desc" as const },
  },
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  async catalogs(companyId: number) {
    const [branches, products, suppliers, expenseTypes] = await Promise.all([
      this.prisma.branch.findMany({
        where: { companyId, isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          warehouses: {
            where: { isActive: true, deletedAt: null },
            select: {
              id: true,
              name: true,
              locations: { where: { isActive: true, deletedAt: null }, select: { id: true, code: true, aisle: true, rack: true, level: true, position: true }, orderBy: { code: "asc" } },
            },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.product.findMany({
        where: { companyId, isActive: true, deletedAt: null, purchaseUnit: { isActive: true, type: "purchase" } },
        select: { id: true, sku: true, internalCode: true, name: true, purchaseUnit: { select: { id: true, name: true } } },
        orderBy: { name: "asc" },
      }),
      this.prisma.supplier.findMany({
        where: { companyId, isActive: true, deletedAt: null },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.expenseType.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: { name: "asc" } }),
    ]);
    return { branches, products, suppliers, expenseTypes };
  }

  requests(query: QueryPurchaseDocumentsDto, companyId: number) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" as const } },
                { justification: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: requestInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async request(id: number, companyId: number, db: Tx = this.prisma) {
    const request = await db.purchaseRequest.findFirst({ where: { id, companyId, deletedAt: null }, include: requestInclude });
    if (!request) throw new NotFoundException("Solicitud de compra no encontrada");
    return request;
  }

  async createRequest(dto: CreatePurchaseRequestDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      this.assertFutureDate(dto.requiredDate, "La fecha requerida no puede ser anterior a hoy");
      await this.assertBranchWarehouse(dto.branchId, dto.warehouseId, companyId, tx);
      await this.assertRequestDetails(dto.details, companyId, tx);
      const code = await this.nextCode(tx, "request");
      const request = await tx.purchaseRequest.create({
        data: {
          code,
          companyId,
          branchId: dto.branchId,
          warehouseId: dto.warehouseId,
          userId,
          requiredDate: new Date(dto.requiredDate),
          justification: dto.justification,
          purpose: dto.purpose,
          notes: dto.notes || null,
          details: {
            create: dto.details.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitId: line.unitId,
              description: line.description || null,
              notes: line.notes || null,
            })),
          },
        },
        include: requestInclude,
      });
      await this.audit.record(tx, { controller: "purchase_requests", action: "CREATE", recordId: request.id, modifiedData: request, userId });
      return request;
    });
  }

  async updateRequest(id: number, dto: UpdatePurchaseRequestDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.request(id, companyId, tx);
      if (!["draft", "rejected"].includes(current.status)) throw new ConflictException("Solo se puede editar una solicitud en borrador o rechazada");
      const branchId = dto.branchId ?? current.branchId;
      const warehouseId = dto.warehouseId ?? current.warehouseId;
      await this.assertBranchWarehouse(branchId, warehouseId, companyId, tx);
      if (dto.requiredDate) this.assertFutureDate(dto.requiredDate, "La fecha requerida no puede ser anterior a hoy");
      if (dto.details) await this.assertRequestDetails(dto.details, companyId, tx);
      if (dto.details) await tx.purchaseRequestDetail.deleteMany({ where: { requestId: id } });
      const request = await tx.purchaseRequest.update({
        where: { id },
        data: {
          ...(dto.branchId !== undefined ? { branchId } : {}),
          ...(dto.warehouseId !== undefined ? { warehouseId } : {}),
          ...(dto.requiredDate !== undefined ? { requiredDate: new Date(dto.requiredDate) } : {}),
          ...(dto.justification !== undefined ? { justification: dto.justification } : {}),
          ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          ...(dto.details
            ? {
                details: {
                  create: dto.details.map((line) => ({
                    productId: line.productId,
                    quantity: line.quantity,
                    unitId: line.unitId,
                    description: line.description || null,
                    notes: line.notes || null,
                  })),
                },
              }
            : {}),
        },
        include: requestInclude,
      });
      await this.audit.record(tx, { controller: "purchase_requests", action: "UPDATE", recordId: id, originalData: current, modifiedData: request, userId });
      return request;
    });
  }

  submitRequest(id: number, userId: number, companyId: number) {
    return this.transitionRequest(id, ["draft", "rejected"], "submitted", "SUBMIT", userId, companyId);
  }

  approveRequest(id: number, userId: number, companyId: number) {
    return this.transitionRequest(id, ["submitted"], "approved", "APPROVE", userId, companyId);
  }

  rejectRequest(id: number, reason: string | undefined, userId: number, companyId: number) {
    return this.transitionRequest(id, ["submitted"], "rejected", "REJECT", userId, companyId, reason);
  }

  cancelRequest(id: number, reason: string | undefined, userId: number, companyId: number) {
    return this.transitionRequest(id, ["draft", "submitted", "approved", "in_quotation", "partially_ordered"], "cancelled", "CANCEL", userId, companyId, reason);
  }

  quotations(query: QueryPurchaseDocumentsDto, companyId: number) {
    return this.prisma.purchaseQuotation.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.requestId ? { requestLinks: { some: { requestId: query.requestId } } } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" as const } },
                { supplier: { name: { contains: query.search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: quotationInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async quotation(id: number, companyId: number, db: Tx = this.prisma) {
    const quotation = await db.purchaseQuotation.findFirst({ where: { id, companyId, deletedAt: null }, include: quotationInclude });
    if (!quotation) throw new NotFoundException("Cotización de compra no encontrada");
    return quotation;
  }

  async createQuotation(dto: CreatePurchaseQuotationDto, userId: number, companyId: number, actor?: AuthenticatedUser) {
    if (dto.expenses?.length) this.assertExpensePermission(actor, 'create');
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      await this.assertQuotationDto(dto, companyId, tx);
      const totals = this.quotationTotals(dto.details, dto.expenses ?? []);
      const code = await this.nextCode(tx, "quotation");
      const quotation = await tx.purchaseQuotation.create({
        data: {
          code,
          companyId,
          supplierId: dto.supplierId,
          quotationDate: new Date(dto.quotationDate),
          validUntil: new Date(dto.validUntil),
          currency: dto.currency ?? "USD",
          paymentTerms: dto.paymentTerms || null,
          deliveryDays: dto.deliveryDays ?? 0,
          notes: dto.notes || null,
          userId,
          ...totals.header,
          requestLinks: { create: dto.requestIds.map((requestId) => ({ requestId })) },
          details: {
            create: totals.details.map((line, index) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitId: line.unitId,
              unitPrice: line.unitPrice,
              discount: line.discount,
              subtotal: line.subtotal,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              total: line.total,
              deliveryDays: dto.details[index].deliveryDays ?? null,
              availableQuantity: dto.details[index].availableQuantity,
              notes: dto.details[index].notes || null,
              requestDetailLinks: { create: dto.details[index].sources.map((source) => ({ requestDetailId: source.requestDetailId, quantity: source.quantity })) },
            })),
          },
          expenses: { create: (dto.expenses ?? []).map((expense) => ({ expenseTypeId: expense.expenseTypeId, description: expense.description || null, amount: expense.amount })) },
        },
        include: quotationInclude,
      });
      await this.refreshRequestOrderingStatuses(tx, dto.requestIds, userId);
      await this.audit.record(tx, { controller: "purchase_quotations", action: "CREATE", recordId: quotation.id, modifiedData: quotation, userId });
      return quotation;
    });
  }

  async updateQuotation(id: number, dto: UpdatePurchaseQuotationDto, userId: number, companyId: number, actor?: AuthenticatedUser) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.quotation(id, companyId, tx);
      if (!["draft", "received"].includes(current.status)) throw new ConflictException("Solo se puede editar una cotización en borrador o recibida");
      const merged = this.mergeQuotation(current, dto);
      if (dto.expenses && JSON.stringify(dto.expenses.map(e => [e.expenseTypeId, e.description || '', Number(e.amount)])) !== JSON.stringify(current.expenses.map(e => [e.expenseTypeId, e.description || '', Number(e.amount)]))) {
        this.assertExpensePermission(actor, current.expenses.length ? 'update' : 'create');
        if (dto.expenses.length > current.expenses.length) this.assertExpensePermission(actor, 'create');
      }
      await this.assertQuotationDto(merged, companyId, tx);
      const totals = this.quotationTotals(merged.details, merged.expenses ?? []);
      await tx.purchaseQuotationRequestDetail.deleteMany({ where: { quotationDetail: { quotationId: id } } });
      await tx.purchaseQuotationDetail.deleteMany({ where: { quotationId: id } });
      await tx.purchaseQuotationRequest.deleteMany({ where: { quotationId: id } });
      await tx.purchaseQuotationExpense.deleteMany({ where: { quotationId: id } });
      const quotation = await tx.purchaseQuotation.update({
        where: { id },
        data: {
          supplierId: merged.supplierId,
          quotationDate: new Date(merged.quotationDate),
          validUntil: new Date(merged.validUntil),
          currency: merged.currency ?? "USD",
          paymentTerms: merged.paymentTerms || null,
          deliveryDays: merged.deliveryDays ?? 0,
          notes: merged.notes || null,
          ...totals.header,
          requestLinks: { create: merged.requestIds.map((requestId) => ({ requestId })) },
          details: {
            create: totals.details.map((line, index) => ({
              ...line,
              deliveryDays: merged.details[index].deliveryDays ?? null,
              availableQuantity: merged.details[index].availableQuantity,
              notes: merged.details[index].notes || null,
              requestDetailLinks: { create: merged.details[index].sources.map((source) => ({ requestDetailId: source.requestDetailId, quantity: source.quantity })) },
            })),
          },
          expenses: { create: (merged.expenses ?? []).map((expense) => ({ expenseTypeId: expense.expenseTypeId, description: expense.description || null, amount: expense.amount })) },
        },
        include: quotationInclude,
      });
      await this.refreshRequestOrderingStatuses(tx, [...current.requestLinks.map(link => link.requestId), ...merged.requestIds], userId);
      await this.audit.record(tx, { controller: "purchase_quotations", action: "UPDATE", recordId: id, originalData: current, modifiedData: quotation, userId });
      return quotation;
    });
  }

  receiveQuotation(id: number, userId: number, companyId: number) {
    return this.transitionQuotation(id, ["draft"], "received", "RECEIVE", userId, companyId);
  }

  reviewQuotation(id: number, userId: number, companyId: number) {
    return this.transitionQuotation(id, ["received"], "under_review", "REVIEW", userId, companyId);
  }

  selectQuotation(id: number, userId: number, companyId: number) {
    return this.transitionQuotation(id, ["received", "under_review"], "selected", "SELECT", userId, companyId, undefined, true);
  }

  rejectQuotation(id: number, reason: string | undefined, userId: number, companyId: number) {
    return this.transitionQuotation(id, ["received", "under_review"], "rejected", "REJECT", userId, companyId, reason);
  }

  cancelQuotation(id: number, reason: string | undefined, userId: number, companyId: number) {
    return this.transitionQuotation(id, ["draft", "received", "under_review"], "cancelled", "CANCEL", userId, companyId, reason);
  }

  async comparison(requestId: number, companyId: number) {
    const request = await this.request(requestId, companyId);
    const quotations = await this.prisma.purchaseQuotation.findMany({
      where: { companyId, deletedAt: null, requestLinks: { some: { requestId } }, status: { notIn: ["cancelled"] } },
      include: quotationInclude,
      orderBy: [{ total: "asc" }, { deliveryDays: "asc" }],
    });
    return {
      request,
      quotations: quotations.map((quotation) => ({
        ...quotation,
        isExpired: this.isExpired(quotation.validUntil),
        availabilityPercent: this.availabilityPercent(quotation.details),
      })),
    };
  }

  comparisonOptions(companyId: number) {
    return this.prisma.purchaseRequest.findMany({ where: { companyId, deletedAt: null, quotationLinks: { some: {} } }, select: { id: true, code: true }, orderBy: { id: "desc" } });
  }

  orders(query: QueryPurchaseDocumentsDto, companyId: number) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" as const } },
                { supplier: { name: { contains: query.search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async order(id: number, companyId: number, db: Tx = this.prisma) {
    const order = await db.purchaseOrder.findFirst({ where: { id, companyId, deletedAt: null }, include: orderInclude });
    if (!order) throw new NotFoundException("Orden de compra no encontrada");
    return order;
  }

  async generateOrder(quotationId: number, dto: GeneratePurchaseOrderDto, userId: number, companyId: number, actor?: AuthenticatedUser) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const quotation = await this.quotation(quotationId, companyId, tx);
      if (quotation.expenses.length) this.assertExpensePermission(actor, 'create');
      if (quotation.status !== "selected") throw new ConflictException("La cotización debe estar seleccionada antes de generar la orden");
      if (this.isExpired(quotation.validUntil)) throw new ConflictException("La cotización seleccionada está vencida");
      if (!await tx.supplier.count({ where: { id: quotation.supplierId, companyId, isActive: true, deletedAt: null } })) throw new BadRequestException("El proveedor esta inactivo o no esta disponible");
      await this.assertRequestDetails(quotation.details.map((line) => ({ productId: line.productId, unitId: line.unitId, quantity: Number(line.quantity) })), companyId, tx);
      await this.assertExpenses(quotation.expenses.map((expense) => ({ expenseTypeId: expense.expenseTypeId, amount: Number(expense.amount) })), companyId, tx);
      this.assertFutureDate(dto.expectedDate, "La fecha esperada no puede ser anterior a hoy");
      await this.assertBranchWarehouse(dto.branchId, dto.warehouseId, companyId, tx);

      const existing = await tx.purchaseOrderDetail.groupBy({
        by: ["quotationDetailId"],
        where: { quotationDetailId: { in: quotation.details.map((detail) => detail.id) }, order: { status: { not: "cancelled" } } },
      _sum: { quantity: true, subtotal: true, discount: true, taxAmount: true },
      });
      const alreadyOrdered = new Map(existing.map((row) => [row.quotationDetailId, Number(row._sum.quantity ?? 0)]));
      const requested = new Map((dto.details ?? []).map((line) => [line.quotationDetailId, line.quantity]));
      const selections = quotation.details
      .map((detail) => ({ detail, quantity: dto.details ? requested.get(detail.id) ?? 0 : Math.max(0, Number(detail.availableQuantity) - (alreadyOrdered.get(detail.id) ?? 0)) }))
        .filter((row) => row.quantity > 0);
      if (!selections.length) throw new ConflictException("La cotización no tiene cantidades disponibles pendientes de ordenar");
      if (dto.details?.some((line) => !quotation.details.some((detail) => detail.id === line.quotationDetailId))) throw new BadRequestException("La selección contiene productos ajenos a la cotización");
      for (const row of selections) {
        const pending = Number(row.detail.availableQuantity) - (alreadyOrdered.get(row.detail.id) ?? 0);
        if (row.quantity > pending) throw new BadRequestException(`La cantidad de ${row.detail.product.name} supera la disponibilidad pendiente`);
      }

      const sources = await tx.purchaseQuotationRequestDetail.findMany({
        where: { requestDetailId: { in: selections.flatMap(({ detail }) => detail.requestDetailLinks.map((link) => link.requestDetailId)) } },
        include: { requestDetail: { include: { request: true } }, quotationDetail: { include: { orderDetails: { where: { order: { status: { not: "cancelled" } } } } } } },
      });
      for (const { detail, quantity } of selections) {
        for (const link of detail.requestDetailLinks) {
          const related = sources.filter((source) => source.requestDetailId === link.requestDetailId);
          const sourceDetail = related[0]?.requestDetail;
          if (!sourceDetail || sourceDetail.request.status === "cancelled") throw new ConflictException("La solicitud de origen ya no está disponible");
          const ordered = related.reduce((sum, source) => sum + Number(source.quantity) * source.quotationDetail.orderDetails.reduce((total, line) => total + Number(line.quantity), 0) / Number(source.quotationDetail.quantity), 0);
          const selectedQuantity = Number(link.quantity) * quantity / Number(detail.quantity);
          if (ordered + selectedQuantity > Number(sourceDetail.quantity) + 0.000001) throw new ConflictException(`La solicitud ${sourceDetail.request.code} ya tiene cantidades ordenadas con otra cotización`);
        }
      }

      const detailData = selections.map(({ detail, quantity }) => this.orderLineFromQuotation(detail, quantity, existing.find((row) => row.quotationDetailId === detail.id)?._sum));
      const quoteSubtotal = Math.max(Number(quotation.subtotal), 0.01);
      const selectedSubtotal = detailData.reduce((sum, line) => sum + line.gross, 0);
      const expenseRatio = Math.min(1, selectedSubtotal / quoteSubtotal);
      const expenses = quotation.expenses.map((expense) => ({
        expenseTypeId: expense.expenseTypeId,
        description: expense.description,
        amount: this.round(Number(expense.amount) * expenseRatio),
      })).filter((expense) => expense.amount > 0);
      const header = this.orderHeader(detailData, expenses);

      const code = await this.nextCode(tx, "order");
      const order = await tx.purchaseOrder.create({
        data: {
          code,
          companyId,
          supplierId: quotation.supplierId,
          branchId: dto.branchId,
          warehouseId: dto.warehouseId,
          quotationId: quotation.id,
          userId,
          expectedDate: new Date(dto.expectedDate),
          currency: quotation.currency,
          paymentTerms: quotation.paymentTerms,
          notes: dto.notes || null,
          ...header,
          details: { create: detailData.map(({ gross: _gross, ...line }) => line) },
          expenses: { create: expenses },
        },
        include: orderInclude,
      });
      await this.refreshRequestOrderingStatuses(tx, quotation.requestLinks.map((link) => link.requestId), userId);
      await this.audit.record(tx, { controller: "purchase_orders", action: "CREATE_FROM_QUOTATION", recordId: order.id, modifiedData: order, userId });
      return order;
    });
  }

  async updateOrder(id: number, dto: UpdatePurchaseOrderDto, userId: number, companyId: number, actor?: AuthenticatedUser) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.order(id, companyId, tx);
      if (current.status !== "draft") throw new ConflictException("Solo se puede editar una orden en borrador");
      if (dto.expenses) {
        if (dto.expenses.some(expense => !expense.id)) this.assertExpensePermission(actor, 'create');
        if (current.expenses.some(previous => {
          const next = dto.expenses!.find(expense => expense.id === previous.id);
          return !next || next.expenseTypeId !== previous.expenseTypeId || (next.description || '') !== (previous.description || '') || !previous.amount.eq(next.amount);
        })) this.assertExpensePermission(actor, 'update');
      }
      if (dto.expectedDate) this.assertFutureDate(dto.expectedDate, "La fecha esperada no puede ser anterior a hoy");
      if (dto.expenses) await this.assertExpenses(dto.expenses, companyId, tx);
      const expenses = dto.expenses ?? current.expenses.map((expense) => ({ expenseTypeId: expense.expenseTypeId, description: expense.description ?? undefined, amount: Number(expense.amount) }));
      const header = this.orderHeader(current.details.map((line) => ({
        gross: Number(line.subtotal) + Number(line.discount),
        discount: Number(line.discount),
        taxAmount: Number(line.taxAmount),
      })), expenses);
      if (dto.expenses) {
        const ids = dto.expenses.flatMap((expense) => expense.id ? [expense.id] : []);
        if (new Set(ids).size !== ids.length || ids.some((expenseId) => !current.expenses.some((expense) => expense.id === expenseId))) throw new BadRequestException("Los gastos deben pertenecer a esta orden y no repetirse");
        const removed = current.expenses.filter((expense) => !ids.includes(expense.id));
        if (removed.some((expense) => expense.documents.length)) throw new ConflictException("Retire los documentos del gasto antes de eliminarlo");
        await tx.purchaseOrderExpense.deleteMany({ where: { id: { in: removed.map((expense) => expense.id) }, orderId: id } });
        for (const expense of dto.expenses) {
          const data = { expenseTypeId: expense.expenseTypeId, description: expense.description || null, amount: expense.amount };
          if (expense.id) await tx.purchaseOrderExpense.update({ where: { id: expense.id }, data });
          else await tx.purchaseOrderExpense.create({ data: { ...data, orderId: id } });
        }
      }
      const order = await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(dto.expectedDate ? { expectedDate: new Date(dto.expectedDate) } : {}),
          ...(dto.paymentTerms !== undefined ? { paymentTerms: dto.paymentTerms || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          ...header,
        },
        include: orderInclude,
      });
      await this.audit.record(tx, { controller: "purchase_orders", action: "UPDATE", recordId: id, originalData: current, modifiedData: order, userId });
      return order;
    });
  }

  submitOrder(id: number, userId: number, companyId: number) {
    return this.transitionOrder(id, ["draft"], "pending_approval", "SUBMIT", userId, companyId);
  }

  approveOrder(id: number, userId: number, companyId: number) {
    return this.transitionOrder(id, ["pending_approval"], "approved", "APPROVE", userId, companyId);
  }

  sendOrder(id: number, userId: number, companyId: number) {
    return this.transitionOrder(id, ["approved"], "sent", "SEND", userId, companyId);
  }

  cancelOrder(id: number, reason: string | undefined, userId: number, companyId: number) {
    return this.transitionOrder(id, ["draft", "pending_approval", "approved", "sent"], "cancelled", "CANCEL", userId, companyId, reason);
  }

  async receiveOrder(id: number, dto: ReceivePurchaseOrderDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      // The existing receipt UUID also identifies a client retry, without an extra ledger.
      if (dto.requestId) {
        const previous = await tx.purchase.findUnique({ where: { uuid: dto.requestId }, include: { items: true } });
        if (previous) {
          const same = previous.companyId === companyId && previous.purchaseOrderId === id &&
            previous.supplierInvoiceNumber === (dto.supplierInvoiceNumber?.trim() || null) &&
            (previous.supplierInvoiceDate?.toISOString().slice(0, 10) ?? null) === (dto.supplierInvoiceDate ? new Date(dto.supplierInvoiceDate).toISOString().slice(0, 10) : null) &&
            previous.notes === (dto.notes?.trim() || null) && previous.items.length === dto.items.length &&
            new Set(dto.items.map(item => item.orderDetailId)).size === dto.items.length &&
            dto.items.every(item => previous.items.some(line => line.purchaseOrderDetailId === item.orderDetailId && line.quantity.eq(item.quantity) && (item.locationId === undefined || line.locationId === item.locationId)));
          if (!same || previous.status === 'CANCELLED') throw new ConflictException('Esta referencia ya pertenece a una recepcion diferente, modificada o cancelada. Revise el historial de la orden antes de continuar.');
          return this.order(id, companyId, tx);
        }
      }
      const current = await this.order(id, companyId, tx);
      if (!["approved", "sent", "partially_received"].includes(current.status)) throw new ConflictException("La orden no está disponible para recepción");
      await this.assertBranchWarehouse(current.branchId, current.warehouseId, companyId, tx);
      await this.assertRequestDetails(current.details.map(line => ({ productId: line.productId, unitId: line.unitId, quantity: Number(line.quantity) })), companyId, tx);
      const supplier = await tx.supplier.findFirst({ where: { id: current.supplierId, companyId, isActive: true, deletedAt: null } });
      if (!supplier) throw new BadRequestException("El proveedor de la orden esta inactivo o no esta disponible");
      const detailIds = new Set(current.details.map((detail) => detail.id));
      if (new Set(dto.items.map((item) => item.orderDetailId)).size !== dto.items.length) throw new BadRequestException("No repita una línea de la orden en la recepción");
      if (dto.items.some((item) => !detailIds.has(item.orderDetailId))) throw new BadRequestException("La recepción contiene líneas ajenas a la orden");
      const slots = await tx.location.findMany({ where: { warehouseId: current.warehouseId, isActive: true, deletedAt: null },
        select: { id: true, code: true, aisle: true, rack: true, level: true, position: true, capacity: true,
          stocks: { select: { productId: true, quantity: true, product: { select: { purchaseUnitId: true } } } } } });
      const productUnits = await tx.product.findMany({ where: { id: { in: current.details.map(line => line.productId) }, companyId }, select: { id: true, purchaseUnitId: true } });
      // Reserve manual destinations first, then allocate automatic lines under the company lock.
      for (const item of dto.items.filter(line => line.locationId !== undefined)) {
        const slot = slots.find(location => location.id === item.locationId);
        if (!slot) throw new BadRequestException("Todas las ubicaciones deben estar activas y pertenecer al almacen de la orden");
        const detail = current.details.find(line => line.id === item.orderDetailId)!;
        const product = productUnits.find(row => row.id === detail.productId);
        if (!product) throw new BadRequestException('Producto no disponible');
        const stock = slot.stocks.find(row => row.productId === detail.productId);
        if (stock) stock.quantity = stock.quantity.add(item.quantity);
        else slot.stocks.push({ productId: detail.productId, quantity: new Prisma.Decimal(item.quantity), product: { purchaseUnitId: product.purchaseUnitId } });
      }
      const resolvedItems = dto.items.map(item => {
        if (item.locationId !== undefined) return { ...item, locationId: item.locationId };
        const detail = current.details.find(line => line.id === item.orderDetailId)!;
        const product = productUnits.find(row => row.id === detail.productId);
        if (!product) throw new BadRequestException('Producto no disponible');
        return { ...item, locationId: allocateLocation(slots, detail.productId, product.purchaseUnitId, item.quantity) };
      });
      for (const item of dto.items) {
        const detail = current.details.find((line) => line.id === item.orderDetailId)!;
        const pending = Number(detail.quantity) - Number(detail.receivedQuantity);
        if (item.quantity > pending) throw new BadRequestException(`La recepción de ${detail.product.name} supera la cantidad pendiente`);
      }

      const documentNumber = await this.nextCode(tx, "receipt");
      const itemData = resolvedItems.map((item) => {
        const detail = current.details.find((line) => line.id === item.orderDetailId)!;
        const previous = Number(detail.receivedQuantity);
        const cumulative = this.round(previous + item.quantity);
        const priorRatio = previous / Number(detail.quantity);
        const ratio = cumulative / Number(detail.quantity);
        const gross = this.round(this.round(cumulative * Number(detail.unitPrice)) - this.round(previous * Number(detail.unitPrice)));
        const discount = this.round(this.round(Number(detail.discount) * ratio) - this.round(Number(detail.discount) * priorRatio));
        const subtotal = this.round(gross - discount);
        const tax = this.round(this.round(Number(detail.taxAmount) * ratio) - this.round(Number(detail.taxAmount) * priorRatio));
        return {
          purchaseOrderDetailId: detail.id,
          productId: detail.productId,
          locationId: item.locationId,
          quantity: item.quantity,
          unitCost: new Prisma.Decimal(subtotal).div(item.quantity).toDecimalPlaces(4),
          lineTotal: subtotal,
          quantityOrdered: detail.quantity,
          receivedBefore: detail.receivedQuantity,
          unitId: detail.unitId,
          unitPrice: detail.unitPrice,
          taxRate: detail.taxRate,
          taxAmount: tax,
          total: new Prisma.Decimal(subtotal).add(tax),
          gross,
          discount,
          tax,
        };
      });
      const subtotal = this.round(itemData.reduce((sum, item) => sum + item.gross, 0));
      const discount = this.round(itemData.reduce((sum, item) => sum + item.discount, 0));
      const tax = this.round(itemData.reduce((sum, item) => sum + item.tax, 0));
      const purchase = await tx.purchase.create({
        data: {
          ...(dto.requestId ? { uuid: dto.requestId } : {}),
          companyId,
          purchaseOrderId: id,
          supplierId: current.supplierId,
          branchId: current.branchId,
          warehouseId: current.warehouseId,
          userId,
          documentNumber,
          supplierInvoiceNumber: dto.supplierInvoiceNumber?.trim() || null,
          supplierInvoiceDate: dto.supplierInvoiceDate ? new Date(dto.supplierInvoiceDate) : null,
          currency: current.currency,
          subtotal,
          discount,
          tax,
          status: "RECEIVED",
          total: this.round(subtotal - discount + tax),
          notes: dto.notes?.trim() || null,
          items: { create: itemData.map(({ gross: _gross, tax: _tax, ...item }) => item) },
        },
        include: { items: true },
      });
      for (const item of purchase.items) {
        await this.inventory.post(tx, companyId, userId, { productId: item.productId, locationId: item.locationId, quantity: item.quantity, type: 'RECEIPT', key: `receipt:${item.id}`, purchaseItemId: item.id, reason: `Recepcion ${purchase.documentNumber}` });
      }
      for (const item of itemData) {
        await tx.purchaseOrderDetail.update({ where: { id: item.purchaseOrderDetailId }, data: { receivedQuantity: { increment: item.quantity } } });
      }
      const balances = await tx.purchaseOrderDetail.findMany({ where: { orderId: id }, select: { quantity: true, receivedQuantity: true } });
      const fullyReceived = balances.every((line) => Number(line.receivedQuantity) >= Number(line.quantity));
      const status = fullyReceived ? "received" : "partially_received";
      await tx.purchaseOrder.update({ where: { id }, data: { status } });
      await this.audit.record(tx, { controller: "purchase_orders", action: "RECEIVE", recordId: id, originalData: current, modifiedData: { purchase, status, supplierInvoiceNumber: dto.supplierInvoiceNumber ?? null }, userId });
      await this.audit.record(tx, { controller: "purchases", action: "CREATE", recordId: purchase.id, modifiedData: purchase, userId });
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  expenseTypes(companyId: number) {
    return this.prisma.expenseType.findMany({ where: { companyId, deletedAt: null }, orderBy: { name: "asc" } });
  }

  async createExpenseType(dto: CreateExpenseTypeDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const duplicate = await tx.expenseType.findFirst({ where: { companyId, name: { equals: dto.name, mode: "insensitive" }, deletedAt: null } });
      if (duplicate) throw new ConflictException("Ya existe un tipo de gasto con ese nombre");
      const result = await tx.expenseType.create({ data: { companyId, name: dto.name, description: dto.description || null } });
      await this.audit.record(tx, { controller: "expense_types", action: "CREATE", recordId: result.id, modifiedData: result, userId });
      return result;
    });
  }

  async updateExpenseType(id: number, dto: UpdateExpenseTypeDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await tx.expenseType.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!current) throw new NotFoundException("Tipo de gasto no encontrado");
      if (dto.name && dto.name.toLowerCase() !== current.name.toLowerCase()) {
        const duplicate = await tx.expenseType.findFirst({ where: { companyId, name: { equals: dto.name, mode: "insensitive" }, deletedAt: null, id: { not: id } } });
        if (duplicate) throw new ConflictException("Ya existe un tipo de gasto con ese nombre");
      }
      const result = await tx.expenseType.update({ where: { id }, data: { ...dto, ...(dto.description !== undefined ? { description: dto.description || null } : {}) } });
      await this.audit.record(tx, { controller: "expense_types", action: "UPDATE", recordId: id, originalData: current, modifiedData: result, userId });
      return result;
    });
  }

  async updateExpenseTypeStatus(id: number, dto: UpdateExpenseTypeStatusDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await tx.expenseType.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!current) throw new NotFoundException("Tipo de gasto no encontrado");
      const result = await tx.expenseType.update({ where: { id }, data: { isActive: dto.isActive } });
      await this.audit.record(tx, { controller: "expense_types", action: dto.isActive ? "ACTIVATE" : "DEACTIVATE", recordId: id, originalData: current, modifiedData: result, userId });
      return result;
    });
  }

  private async transitionRequest(id: number, from: string[], status: string, action: string, userId: number, companyId: number, reason?: string) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.request(id, companyId, tx);
      if (!from.includes(current.status)) throw new ConflictException(`No se puede cambiar una solicitud ${current.status} a ${status}`);
      this.assertReason(action, reason);
      if (["submitted", "approved"].includes(status)) {
        if (status === "submitted" && !current.purpose) throw new BadRequestException("Edite la solicitud y seleccione la finalidad de compra antes de solicitar aprobacion");
        if (status === "submitted") this.assertFutureDate(current.requiredDate.toISOString(), "Actualice la fecha requerida antes de enviar la solicitud");
        await this.assertBranchWarehouse(current.branchId, current.warehouseId, companyId, tx);
        await this.assertRequestDetails(current.details.map((line) => ({ ...line, quantity: Number(line.quantity), description: line.description ?? undefined, notes: line.notes ?? undefined })), companyId, tx);
      }
      if (status === "cancelled" && current.quotationLinks.some((link) => !["cancelled", "rejected"].includes(link.quotation.status))) throw new ConflictException("Cancele primero las cotizaciones activas de esta solicitud");
      const result = await tx.purchaseRequest.update({ where: { id }, data: { status, ...(reason ? { notes: this.appendReason(current.notes, reason) } : {}) }, include: requestInclude });
      await this.audit.record(tx, { controller: "purchase_requests", action, recordId: id, originalData: current, modifiedData: result, userId });
      return result;
    });
  }

  private async transitionQuotation(id: number, from: string[], status: string, action: string, userId: number, companyId: number, reason?: string, checkValidity = false) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.quotation(id, companyId, tx);
      if (!from.includes(current.status)) throw new ConflictException(`No se puede cambiar una cotización ${current.status} a ${status}`);
      this.assertReason(action, reason);
      if (["selected", "received"].includes(status) && current.requestLinks.some((link) => link.request.status === "cancelled")) throw new ConflictException("La cotización contiene una solicitud cancelada");
      if (["selected", "received"].includes(status) && !await tx.supplier.count({ where: { id: current.supplierId, companyId, isActive: true, deletedAt: null } })) throw new BadRequestException("El proveedor esta inactivo o no esta disponible");
      if (["selected", "received"].includes(status)) await this.assertRequestDetails(current.details.map(line => ({ productId: line.productId, unitId: line.unitId, quantity: Number(line.quantity) })), companyId, tx);
      if (checkValidity && this.isExpired(current.validUntil)) throw new ConflictException("No se puede seleccionar una cotización vencida");
      const result = await tx.purchaseQuotation.update({ where: { id }, data: { status, ...(reason ? { notes: this.appendReason(current.notes, reason) } : {}) }, include: quotationInclude });
      await this.refreshRequestOrderingStatuses(tx, current.requestLinks.map(link => link.requestId), userId);
      await this.audit.record(tx, { controller: "purchase_quotations", action, recordId: id, originalData: current, modifiedData: result, userId });
      return result;
    });
  }

  private async transitionOrder(id: number, from: string[], status: string, action: string, userId: number, companyId: number, reason?: string) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.order(id, companyId, tx);
      if (!from.includes(current.status)) throw new ConflictException(`No se puede cambiar una orden ${current.status} a ${status}`);
      this.assertReason(action, reason);
      const result = await tx.purchaseOrder.update({ where: { id }, data: { status, ...(reason ? { notes: this.appendReason(current.notes, reason) } : {}) }, include: orderInclude });
      if (status === "cancelled" && current.quotationId) {
        const links = await tx.purchaseQuotationRequest.findMany({ where: { quotationId: current.quotationId }, select: { requestId: true } });
        await this.refreshRequestOrderingStatuses(tx, links.map((link) => link.requestId), userId);
      }
      await this.audit.record(tx, { controller: "purchase_orders", action, recordId: id, originalData: current, modifiedData: result, userId });
      return result;
    });
  }

  private async assertRequestDetails(details: CreatePurchaseRequestDto["details"], companyId: number, db: Tx = this.prisma) {
    if (new Set(details.map((line) => line.productId)).size !== details.length) throw new BadRequestException("No repita un producto dentro de la solicitud");
    const products = await db.product.findMany({
      where: { id: { in: details.map((line) => line.productId) }, companyId, isActive: true, deletedAt: null },
      select: { id: true, purchaseUnitId: true, purchaseUnit: { select: { type: true, isActive: true } } },
    });
    if (products.length !== details.length) throw new BadRequestException("Todos los productos deben existir, estar activos y pertenecer a la empresa actual");
    for (const line of details) {
      const product = products.find((item) => item.id === line.productId)!;
      if (product.purchaseUnitId !== line.unitId || product.purchaseUnit.type !== "purchase" || !product.purchaseUnit.isActive) throw new BadRequestException("Cada producto debe utilizar su unidad de compra activa");
    }
  }

  private async assertQuotationDto(dto: CreatePurchaseQuotationDto, companyId: number, db: Tx = this.prisma) {
    if (new Date(dto.validUntil).getTime() < new Date(dto.quotationDate).getTime()) throw new BadRequestException("La vigencia no puede ser anterior a la fecha de cotización");
    const supplier = await db.supplier.findFirst({ where: { id: dto.supplierId, companyId, isActive: true, deletedAt: null } });
    if (!supplier) throw new BadRequestException("El proveedor no existe, está inactivo o pertenece a otra empresa");
    const requests = await db.purchaseRequest.findMany({ where: { id: { in: dto.requestIds }, companyId, deletedAt: null, status: { in: ["approved", "in_quotation", "partially_ordered"] } }, include: { details: true } });
    if (requests.length !== dto.requestIds.length) throw new BadRequestException("Todas las solicitudes deben estar aprobadas y pertenecer a la empresa actual");
    if (new Set(dto.details.map((line) => line.productId)).size !== dto.details.length) throw new BadRequestException("No repita un producto dentro de la cotización");
    await this.assertRequestDetails(dto.details, companyId, db);
    const representedRequests = new Set<number>();
    const requestDetails = new Map(requests.flatMap((request) => request.details.map((detail) => [detail.id, { ...detail, requestId: request.id }] as const)));
    for (const line of dto.details) {
      const sourceTotal = this.round(line.sources.reduce((sum, source) => sum + source.quantity, 0));
      if (Math.abs(sourceTotal - line.quantity) > 0.001) throw new BadRequestException("La cantidad cotizada debe coincidir con la suma de sus solicitudes de origen");
      if (line.availableQuantity > line.quantity) throw new BadRequestException("La cantidad disponible no puede superar la cantidad cotizada");
      for (const source of line.sources) {
        const detail = requestDetails.get(source.requestDetailId);
        if (!detail || !dto.requestIds.includes(detail.requestId)) throw new BadRequestException("La trazabilidad contiene un detalle ajeno a las solicitudes seleccionadas");
        representedRequests.add(detail.requestId);
        if (detail.productId !== line.productId || detail.unitId !== line.unitId) throw new BadRequestException("El producto y la unidad cotizados deben coincidir con su detalle de solicitud");
        if (source.quantity > Number(detail.quantity)) throw new BadRequestException("La cantidad relacionada supera lo solicitado");
      }
    }
    if (dto.requestIds.some(id => !representedRequests.has(id))) throw new BadRequestException('Cada solicitud vinculada debe aportar al menos un producto a la cotizacion');
    await this.assertExpenses(dto.expenses ?? [], companyId, db);
  }

  private async assertExpenses(expenses: Array<{ expenseTypeId: number; amount: number }>, companyId: number, db: Tx = this.prisma) {
    if (!expenses.length) return;
    const ids = [...new Set(expenses.map((expense) => expense.expenseTypeId))];
    const count = await db.expenseType.count({ where: { id: { in: ids }, companyId, isActive: true, deletedAt: null } });
    if (count !== ids.length) throw new BadRequestException("Todos los gastos deben utilizar un tipo activo de la empresa actual");
  }

  private assertExpensePermission(actor: AuthenticatedUser | undefined, action: 'create' | 'update') {
    if (!actor || (!actor.roles.includes('superadmin') && !actor.permissions.includes(`purchase_expenses.${action}`))) {
      throw new ForbiddenException(`Se requiere purchase_expenses.${action} para modificar los gastos del documento`);
    }
  }

  private async assertBranchWarehouse(branchId: number, warehouseId: number, companyId: number, db: Tx = this.prisma) {
    const warehouse = await db.warehouse.findFirst({ where: { id: warehouseId, branchId, isActive: true, deletedAt: null, branch: { companyId, isActive: true, deletedAt: null } } });
    if (!warehouse) throw new BadRequestException("La sucursal y el almacén deben estar activos, relacionados y pertenecer a la empresa actual");
  }

  private quotationTotals(details: CreatePurchaseQuotationDto["details"], expenses: Array<{ amount: number }>) {
    const lines = details.map((line) => {
      const gross = this.round(line.quantity * line.unitPrice);
      const discount = this.round(line.discount ?? 0);
      if (discount > gross) throw new BadRequestException("El descuento no puede superar el importe de la línea");
      const subtotal = this.round(gross - discount);
      const taxRate = this.round(line.taxRate ?? 0);
      const taxAmount = this.round(subtotal * (taxRate / 100));
      return { productId: line.productId, quantity: line.quantity, unitId: line.unitId, unitPrice: line.unitPrice, discount, subtotal, taxRate, taxAmount, total: this.round(subtotal + taxAmount), gross };
    });
    const subtotal = this.round(lines.reduce((sum, line) => sum + line.gross, 0));
    const discount = this.round(lines.reduce((sum, line) => sum + line.discount, 0));
    const tax = this.round(lines.reduce((sum, line) => sum + line.taxAmount, 0));
    const additionalExpenses = this.round(expenses.reduce((sum, expense) => sum + expense.amount, 0));
    return {
      header: { subtotal, discount, tax, additionalExpenses, total: this.round(subtotal - discount + tax + additionalExpenses) },
      details: lines.map(({ gross: _gross, ...line }) => line),
    };
  }

  private orderLineFromQuotation(detail: any, quantity: number, consumed?: { quantity: Prisma.Decimal | null; subtotal: Prisma.Decimal | null; discount: Prisma.Decimal | null; taxAmount: Prisma.Decimal | null }) {
    const previousQuantity = Number(consumed?.quantity ?? 0);
    const previousDiscount = Number(consumed?.discount ?? 0);
    const previousSubtotal = Number(consumed?.subtotal ?? 0);
    const ratio = (previousQuantity + quantity) / Number(detail.quantity);
    const gross = this.round(Math.max(0, this.round((previousQuantity + quantity) * Number(detail.unitPrice)) - previousSubtotal - previousDiscount));
    const discount = this.round(Math.min(gross, Math.max(0, this.round(Number(detail.discount) * ratio) - previousDiscount)));
    const subtotal = this.round(gross - discount);
    const taxRate = Number(detail.taxRate);
    const taxAmount = this.round(Math.max(0, this.round((previousSubtotal + subtotal) * (taxRate / 100)) - Number(consumed?.taxAmount ?? 0)));
    return {
      gross,
      quotationDetailId: detail.id,
      productId: detail.productId,
      quantity,
      unitId: detail.unitId,
      unitPrice: Number(detail.unitPrice),
      discount,
      subtotal,
      taxRate,
      taxAmount,
      total: this.round(subtotal + taxAmount),
      notes: detail.notes,
    };
  }

  private orderHeader(details: Array<{ gross: number; discount: number; taxAmount: number }>, expenses: Array<{ amount: number }>) {
    const subtotal = details.reduce((sum, line) => sum.add(line.gross).sub(line.discount), new Prisma.Decimal(0)).toDecimalPlaces(2);
    const discount = details.reduce((sum, line) => sum.add(line.discount), new Prisma.Decimal(0)).toDecimalPlaces(2);
    const tax = details.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
    const additionalExpenses = expenses.reduce((sum, expense) => sum.add(expense.amount), new Prisma.Decimal(0)).toDecimalPlaces(2);
    return { subtotal, discount, tax, additionalExpenses, total: subtotal.add(tax).add(additionalExpenses) };
  }

  private mergeQuotation(current: any, dto: UpdatePurchaseQuotationDto): CreatePurchaseQuotationDto {
    return {
      supplierId: dto.supplierId ?? current.supplierId,
      requestIds: dto.requestIds ?? current.requestLinks.map((link: any) => link.requestId),
      quotationDate: dto.quotationDate ?? current.quotationDate.toISOString(),
      validUntil: dto.validUntil ?? current.validUntil.toISOString(),
      currency: dto.currency ?? current.currency,
      paymentTerms: dto.paymentTerms ?? current.paymentTerms ?? undefined,
      deliveryDays: dto.deliveryDays ?? current.deliveryDays,
      notes: dto.notes ?? current.notes ?? undefined,
      details: dto.details ?? current.details.map((line: any) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitId: line.unitId,
        unitPrice: Number(line.unitPrice),
        discount: Number(line.discount),
        taxRate: Number(line.taxRate),
        deliveryDays: line.deliveryDays ?? undefined,
        availableQuantity: Number(line.availableQuantity),
        notes: line.notes ?? undefined,
        sources: line.requestDetailLinks.map((source: any) => ({ requestDetailId: source.requestDetailId, quantity: Number(source.quantity) })),
      })),
      expenses: dto.expenses ?? current.expenses.map((expense: any) => ({ expenseTypeId: expense.expenseTypeId, description: expense.description ?? undefined, amount: Number(expense.amount) })),
    };
  }

  private async refreshRequestOrderingStatuses(tx: Tx, requestIds: number[], userId: number) {
    for (const requestId of [...new Set(requestIds)]) {
      const request = await tx.purchaseRequest.findUnique({
        where: { id: requestId },
        include: {
          quotationLinks: { where: { quotation: { deletedAt: null, status: { notIn: ['cancelled', 'rejected', 'expired'] } } }, select: { quotationId: true } },
          details: {
            include: {
              quotationLinks: {
                include: { quotationDetail: { include: { orderDetails: { where: { order: { status: { not: "cancelled" } } } } } } },
              },
            },
          },
        },
      });
      if (!request || !['approved', 'in_quotation', 'partially_ordered', 'completed'].includes(request.status)) continue;
      let anyOrdered = false;
      const complete = request.details.map((detail) => {
        let ordered = 0;
        for (const link of detail.quotationLinks) {
          const quoted = Number(link.quotationDetail.quantity);
          const orderedFromQuote = link.quotationDetail.orderDetails.reduce((sum, row) => sum + Number(row.quantity), 0);
          ordered += quoted > 0 ? Number(link.quantity) * Math.min(1, orderedFromQuote / quoted) : 0;
        }
        anyOrdered ||= ordered > 0;
        return ordered + 0.001 >= Number(detail.quantity);
      }).every(Boolean);
      const status = complete ? 'completed' : anyOrdered ? 'partially_ordered' : request.quotationLinks.length ? 'in_quotation' : 'approved';
      if (status !== request.status) {
        await tx.purchaseRequest.update({ where: { id: requestId }, data: { status } });
        await this.audit.record(tx, { controller: 'purchase_requests', action: 'SYNC_STATUS', recordId: requestId, originalData: { status: request.status }, modifiedData: { status }, userId });
      }
    }
  }

  private async nextCode(tx: Tx, name: SequenceName) {
    const config = {
      request: ["purchase_request_code_seq", "PR"],
      quotation: ["purchase_quotation_code_seq", "COT"],
      order: ["purchase_order_code_seq", "OC"],
      receipt: ["purchase_receipt_code_seq", "RC"],
    } as const;
    const [sequence, prefix] = config[name];
    const rows = await tx.$queryRawUnsafe<Array<{ value: bigint }>>(`SELECT nextval('${sequence}') AS value`);
    return `${prefix}-${Number(rows[0].value).toString().padStart(5, "0")}`;
  }

  private assertFutureDate(value: string, message: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || this.isExpired(date)) throw new BadRequestException(message);
  }

  private isExpired(date: Date) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return date.toISOString().slice(0, 10) < today;
  }

  private availabilityPercent(details: Array<{ quantity: Prisma.Decimal; availableQuantity: Prisma.Decimal }>) {
    const quoted = details.reduce((sum, line) => sum + Number(line.quantity), 0);
    const available = details.reduce((sum, line) => sum + Number(line.availableQuantity), 0);
    return quoted ? Math.round((available / quoted) * 100) : 0;
  }

  private appendReason(notes: string | null, reason: string) {
    return [notes, `Motivo: ${reason}`].filter(Boolean).join("\n");
  }

  private assertReason(action: string, reason?: string) {
    if (["CANCEL", "REJECT"].includes(action) && !reason?.trim()) throw new BadRequestException("Indique el motivo de la cancelación o rechazo");
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
