import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CreateRetaceoDto, QueryRetaceosDto, UpdateRetaceoDto } from "../dto/purchase-process.dto";

import { purchaseTransaction } from "./purchase-transaction";
import { allocateCost } from "./cost-allocation";
import { withReceiptLifecycle } from './receipt-lifecycle';

const purchaseInclude = {
  actualExpenses: { include: { allocations: true, expenseType: true } },
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  purchaseOrder: {
    include: {
      quotation: {
        include: {
          requestLinks: { include: { request: { select: { id: true, code: true } } } },
        },
      },
    },
  },
  items: {
    include: {
      product: { select: { id: true, sku: true, internalCode: true, name: true, unitCost: true } },
      location: { select: { id: true, code: true } },
      purchaseOrderDetail: { select: { id: true, unitId: true, unitPrice: true } },
    },
    orderBy: { id: "asc" as const },
  },
  retaceos: { select: { id: true, code: true, status: true, deletedAt: true }, orderBy: { id: 'desc' as const } },
};

const retaceoInclude = {
  expenseAllocations: { include: { expense: true } },
  supplier: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, username: true } },
  purchase: { include: purchaseInclude },
  details: {
    include: {
      product: { select: { id: true, sku: true, internalCode: true, name: true } },
      purchaseItem: { include: { location: { select: { id: true, code: true } } } },
    },
    orderBy: { id: "asc" as const },
  },
};

type RetaceoRecord = Prisma.RetaceoGetPayload<{ include: typeof retaceoInclude }>;

@Injectable()
export class RetaceosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async purchases(companyId: number) {
    const purchases = await this.prisma.purchase.findMany({
      where: { companyId, deletedAt: null, status: { notIn: ["CANCELLED", "CLOSED"] } },
      include: purchaseInclude,
      orderBy: { purchaseDate: "desc" },
    });
    return purchases.map(withReceiptLifecycle);
  }

  async findAll(query: QueryRetaceosDto, companyId: number) {
    const records = await this.prisma.retaceo.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.purchaseId ? { purchaseId: query.purchaseId } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" as const } },
                { importInvoiceNumber: { contains: query.search, mode: "insensitive" as const } },
                { supplier: { name: { contains: query.search, mode: "insensitive" as const } } },
                { purchase: { documentNumber: { contains: query.search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: retaceoInclude,
      orderBy: { createdAt: "desc" },
    });
    return records.map((record) => this.withRates(record));
  }

  async findOne(id: number, companyId: number) {
    const record = await this.prisma.retaceo.findFirst({ where: { id, companyId, deletedAt: null }, include: retaceoInclude });
    if (!record) throw new NotFoundException("Retaceo no encontrado");
    return this.withRates(record);
  }

  async create(dto: CreateRetaceoDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const purchase = await this.purchaseForRetaceo(dto.purchaseId, companyId, tx);
      if (await tx.retaceo.count({ where: { purchaseId: purchase.id, status: { not: "cancelled" } } })) throw new ConflictException("La recepción ya posee un retaceo; si está eliminado, restáurelo desde la papelera");
      const details = this.prepareDetails(dto.details, purchase.items);
      const costs = this.actualCosts(purchase.actualExpenses) ?? { totalFreight: dto.totalFreight ?? 0, totalExpenses: dto.totalExpenses ?? 0, totalDai: dto.totalDai ?? 0 };

      const code = await this.nextCode(tx);
      const record = await tx.retaceo.create({
        data: {
          code,
          companyId,
          supplierId: purchase.supplierId,
          purchaseId: purchase.id,
          userId,
          retaceoDate: dto.retaceoDate ? new Date(dto.retaceoDate) : new Date(),
          originCountry: dto.originCountry || null,
          importInvoiceNumber: dto.importInvoiceNumber || purchase.supplierInvoiceNumber || null,
          importInvoiceDate: dto.importInvoiceDate ? new Date(dto.importInvoiceDate) : purchase.supplierInvoiceDate,
          importPolicyNumber: dto.importPolicyNumber || null,
          importPolicyDate: dto.importPolicyDate ? new Date(dto.importPolicyDate) : null,
          totalFob: this.round(details.reduce((sum, detail) => sum + detail.costFob, 0)),
          totalCost: this.round(details.reduce((sum, detail) => sum + detail.costFob, 0) + costs.totalFreight + costs.totalExpenses + costs.totalDai),
          ...costs,
          importVat: dto.importVat ?? 0,
          notes: dto.notes || null,
          details: { create: details },
        },
        include: retaceoInclude,
      });
      await this.audit.record(tx, { controller: "retaceos", action: "CREATE", recordId: record.id, modifiedData: record, userId });
      return this.withRates(record);
    });
  }

  async update(id: number, dto: UpdateRetaceoDto, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.findOneRecord(id, companyId, tx);
      if (!["draft", "calculated"].includes(current.status)) throw new ConflictException("Solo se puede modificar un retaceo en borrador o calculado");
      if (dto.purchaseId && dto.purchaseId !== current.purchaseId) throw new BadRequestException("No se puede cambiar la compra de origen del retaceo");
      const details = this.prepareDetails(dto.details ?? current.details.map((detail) => ({ purchaseItemId: detail.purchaseItemId, costFob: Number(detail.costFob) })), current.purchase.items);

      if (details) await tx.retaceoDetail.deleteMany({ where: { retaceoId: id } });
      const totalFob = details ? this.round(details.reduce((sum, detail) => sum + detail.costFob, 0)) : Number(current.totalFob);
      const costs = this.actualCosts(current.purchase.actualExpenses) ?? { totalFreight: dto.totalFreight ?? Number(current.totalFreight), totalExpenses: dto.totalExpenses ?? Number(current.totalExpenses), totalDai: dto.totalDai ?? Number(current.totalDai) };
      const record = await tx.retaceo.update({
        where: { id },
        data: {
          ...(dto.retaceoDate ? { retaceoDate: new Date(dto.retaceoDate) } : {}),
          status: "draft",
          ...(dto.originCountry !== undefined ? { originCountry: dto.originCountry || null } : {}),
          ...(dto.importInvoiceNumber !== undefined ? { importInvoiceNumber: dto.importInvoiceNumber || null } : {}),
          ...(dto.importInvoiceDate !== undefined ? { importInvoiceDate: dto.importInvoiceDate ? new Date(dto.importInvoiceDate) : null } : {}),
          ...(dto.importPolicyNumber !== undefined ? { importPolicyNumber: dto.importPolicyNumber || null } : {}),
          ...(dto.importPolicyDate !== undefined ? { importPolicyDate: dto.importPolicyDate ? new Date(dto.importPolicyDate) : null } : {}),
          ...costs,
          ...(dto.importVat !== undefined ? { importVat: dto.importVat } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          totalFob,
          totalCost: this.round(totalFob + costs.totalFreight + costs.totalExpenses + costs.totalDai),
          ...(details ? { details: { create: details } } : {}),
        },
        include: retaceoInclude,
      });
      await this.audit.record(tx, { controller: "retaceos", action: "UPDATE", recordId: id, originalData: current, modifiedData: record, userId });
      return this.withRates(record);
    });
  }

  async calculate(id: number, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.findOneRecord(id, companyId, tx);
      if (!["draft", "calculated"].includes(current.status)) throw new ConflictException("El retaceo no está disponible para cálculo");
      const fobs = current.details.map((detail) => Number(detail.costFob));
      const totalFob = this.round(fobs.reduce((sum, value) => sum + value, 0));
      const actual = await tx.purchaseActualExpense.findMany({ where: { purchaseId: current.purchaseId }, include: { allocations: true } });
      const capitalized = actual.filter(e => e.capitalizable);
      if (capitalized.some(e => e.allocations.some(a => a.retaceoId !== id))) throw new ConflictException('Un gasto real ya fue incluido en otro retaceo');
      // Actual documents replace estimates and manually entered aggregate costs.
      const categoryTotal = (category: string) => capitalized.filter(e => e.category === category).reduce((total, e) => total.add(e.amount), new Prisma.Decimal(0)).toNumber();
      const freight = actual.length ? categoryTotal('freight') : Number(current.totalFreight);
      const expenses = actual.length ? categoryTotal('expense') : Number(current.totalExpenses);
      const dai = actual.length ? categoryTotal('dai') : Number(current.totalDai);
      await tx.purchaseExpenseAllocation.deleteMany({ where: { retaceoId: id } });
      for (const expense of capitalized) await tx.purchaseExpenseAllocation.create({ data: { expenseId: expense.id, retaceoId: id, amount: expense.amount } });
      if (totalFob <= 0 && freight + expenses + dai > 0) throw new BadRequestException("El FOB total debe ser mayor que cero para distribuir gastos");

      const freightAllocation = allocateCost(freight, fobs);
      const expenseAllocation = allocateCost(expenses, fobs);
      const daiAllocation = allocateCost(dai, fobs);

      for (let index = 0; index < current.details.length; index += 1) {
        const detail = current.details[index];
        const totalCost = this.round(fobs[index] + freightAllocation[index] + expenseAllocation[index] + daiAllocation[index]);
        const quantity = Number(detail.quantity);
        await tx.retaceoDetail.update({
          where: { id: detail.id },
          data: {
            freightAmount: freightAllocation[index],
            expenseAmount: expenseAllocation[index],
            daiAmount: daiAllocation[index],
            totalCost,
            unitCost: quantity > 0 ? this.round4(totalCost / quantity) : 0,
          },
        });
      }
      const record = await tx.retaceo.update({
        where: { id },
        data: { totalFob, totalFreight: freight, totalExpenses: expenses, totalDai: dai, totalCost: this.round(totalFob + freight + expenses + dai), status: "calculated" },
        include: retaceoInclude,
      });
      await this.audit.record(tx, { controller: "retaceos", action: "CALCULATE", recordId: id, originalData: current, modifiedData: record, userId });
      return this.withRates(record);
    });
  }

  verify(id: number, userId: number, companyId: number) {
    return this.transition(id, ["calculated"], "verified", "VERIFY", userId, companyId);
  }

  async close(id: number, userId: number, companyId: number) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.findOneRecord(id, companyId, tx);
      if (current.status !== "verified") throw new ConflictException("El retaceo debe estar verificado antes de cerrarse");
      if (current.purchase.purchaseOrderId && (current.purchase.status !== 'VERIFIED' || current.purchase.items.some((item) => item.locationId === null))) throw new ConflictException('Ubique y verifique la recepción antes de cerrar el retaceo');
      // Inventory reads this closed cost through the receipt; no stock is posted again.
      const purchase = await tx.purchase.update({ where: { id: current.purchaseId }, data: { status: "COSTED" } });
      await this.audit.record(tx, { controller: "purchases", action: "COST", recordId: purchase.id, originalData: current.purchase, modifiedData: purchase, userId });
      const record = await tx.retaceo.update({ where: { id }, data: { status: "closed" }, include: retaceoInclude });
      await this.audit.record(tx, { controller: "retaceos", action: "CLOSE", recordId: id, originalData: current, modifiedData: record, userId });
      return this.withRates(record);
    });
  }

  cancel(id: number, reason: string | undefined, userId: number, companyId: number) {
    return this.transition(id, ["draft", "calculated", "verified"], "cancelled", "CANCEL", userId, companyId, reason);
  }

  private async transition(id: number, from: string[], status: string, action: string, userId: number, companyId: number, reason?: string) {
    return purchaseTransaction(this.prisma, companyId, async (tx) => {
      const current = await this.findOneRecord(id, companyId, tx);
      if (!from.includes(current.status)) throw new ConflictException(`No se puede cambiar un retaceo ${current.status} a ${status}`);
      if (status === "cancelled" && !reason?.trim()) throw new BadRequestException("Indique el motivo de la cancelación");
      if (status === 'cancelled') await tx.purchaseExpenseAllocation.deleteMany({ where: { retaceoId: id } });
      const record = await tx.retaceo.update({
        where: { id },
        data: { status, ...(reason ? { notes: current.notes ? `${current.notes}\n${reason}` : reason } : {}) },
        include: retaceoInclude,
      });
      await this.audit.record(tx, { controller: "retaceos", action, recordId: id, originalData: current, modifiedData: record, userId });
      return this.withRates(record);
    });
  }

  private async findOneRecord(id: number, companyId: number, db: Prisma.TransactionClient = this.prisma) {
    const record = await db.retaceo.findFirst({ where: { id, companyId, deletedAt: null }, include: retaceoInclude });
    if (!record) throw new NotFoundException("Retaceo no encontrado");
    return record;
  }

  private async purchaseForRetaceo(id: number, companyId: number, db: Prisma.TransactionClient = this.prisma) {
    const purchase = await db.purchase.findFirst({ where: { id, companyId, deletedAt: null, status: { notIn: ["CANCELLED", "CLOSED"] } }, include: purchaseInclude });
    if (!purchase) throw new NotFoundException("Compra o recepción no encontrada");
    if (!purchase.purchaseOrderId || purchase.items.some(item => !item.purchaseOrderDetailId)) throw new ConflictException('La compra debe conservar su orden y los detalles de origen');
    if (!['VERIFIED', 'COSTED'].includes(purchase.status)) throw new ConflictException('Verifique la recepción antes de preparar el retaceo');
    if (!purchase.items.length) throw new BadRequestException("La compra no contiene productos recibidos");
    return purchase;
  }

  private prepareDetails(lines: CreateRetaceoDto["details"], items: Array<{ id: number; productId: number; quantity: Prisma.Decimal; lineTotal: Prisma.Decimal }>) {
    if (lines.length !== items.length) throw new BadRequestException("Debe indicar el FOB de todos los productos recibidos");
    const lineMap = new Map(lines.map((line) => [line.purchaseItemId, line.costFob]));
    if (items.some((item) => !lineMap.has(item.id))) throw new BadRequestException("El detalle FOB contiene productos ajenos o incompletos");
    return items.map((item) => {
      const costFob = this.round(lineMap.get(item.id) ?? Number(item.lineTotal));
      const quantity = Number(item.quantity);
      return {
        purchaseItemId: item.id,
        productId: item.productId,
        quantity,
        costFob,
        totalCost: costFob,
        unitCost: quantity > 0 ? this.round4(costFob / quantity) : 0,
      };
    });
  }

  private withRates(record: RetaceoRecord) {
    const totalFob = Number(record.totalFob);
    return {
      ...record,
      purchase: withReceiptLifecycle(record.purchase),
      excludesImportVat: true,
      details: record.details.map((detail) => ({
        ...detail,
        distributionPercent: totalFob > 0 ? this.round4((Number(detail.costFob) / totalFob) * 100) : 0,
        freightRate: totalFob > 0 ? new Prisma.Decimal(record.totalFreight).div(record.totalFob).times(100).toDecimalPlaces(4).toNumber() : 0,
        expenseRate: totalFob > 0 ? new Prisma.Decimal(record.totalExpenses).div(record.totalFob).times(100).toDecimalPlaces(4).toNumber() : 0,
        daiRate: totalFob > 0 ? new Prisma.Decimal(record.totalDai).div(record.totalFob).times(100).toDecimalPlaces(4).toNumber() : 0,
      })),
    };
  }

  private async nextCode(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('retaceo_code_seq')::bigint AS value`;
    return `RET-${Number(row.value).toString().padStart(5, "0")}`;
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
  private actualCosts(actual: Array<{ category: string; capitalizable: boolean; amount: Prisma.Decimal }>) {
    if (!actual.length) return null;
    const total = (category: string) => actual.filter(e => e.capitalizable && e.category === category).reduce((sum, e) => sum.add(e.amount), new Prisma.Decimal(0)).toNumber();
    return { totalFreight: total('freight'), totalExpenses: total('expense'), totalDai: total('dai') };
  }

  private round4(value: number) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }
}
