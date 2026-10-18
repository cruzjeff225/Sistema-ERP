import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';
import { AuditService } from '../../../audit/application/services/audit.service';
import { InventoryService } from '../../../inventory/inventory.service';
import { describeSlots } from '../../../inventory/location-allocation';
import { AuthenticatedUser } from '../../../auth/presentation/decorators/current-user.decorator';
import { PurchasesService } from './purchases.service';
import { purchaseTransaction } from './purchase-transaction';
import { generalWarehouse } from './general-warehouse';
import { comparePurchase,purchaseComparisonHash } from './purchase-comparison';
import { ActualExpenseDto, AwardDto, ConsolidationDto, ConsolidationLineDto, PlacementDto, RfqDto, TransferConfirmDto, TransferDto, TransferIncidentDto, TransferReceiptDto } from '../dto/supply-workflow.dto';

const include = {
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, internalCode: true } },
      unit: true,
      sources: { include: { requestDetail: { include: { request: { include: { branch: true } }, transferItems: true } } } },
      quotationDetails: { include: { orderDetails: { where: { order: { status: { notIn: ['cancelled','rejected'] } } } } } },
    },
    orderBy: { id: 'asc' as const },
  },
  rfqs: { where: { deletedAt: null }, include: { supplier: true, lines: { include: { line: { include: { product: true, unit: true } } } }, quotation: { include: { details: true, orders: { include: { details: true, expenses: { include: { documents: { where: { deletedAt: null } } }, orderBy: { id: 'asc' as const } } } }, expenses: { include: { expenseType: true }, orderBy: { id: 'asc' as const } } } } } },
  orders: { select: { id: true, code: true, supplierId: true, quotationId: true, status: true, deletedAt: true } },
} satisfies Prisma.PurchaseConsolidationInclude;
type Tx = Prisma.TransactionClient;
const sum = (values: Prisma.Decimal[]) => values.reduce((a, b) => a.add(b), new Prisma.Decimal(0));

@Injectable()
export class SupplyWorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly inventory: InventoryService, private readonly purchases: PurchasesService) {}

  async configuration(companyId: number) {
    const config = await this.prisma.erpConfiguration.findFirst({ where: { companyId }, include: { generalWarehouse: { include: { branch: true } } } });
    return { generalWarehouse: config?.generalWarehouse ?? null };
  }
  configure(warehouseId: number, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, isActive: true, deletedAt: null, branch: { companyId, isActive: true, deletedAt: null } } });
      if (!warehouse) throw new BadRequestException('Centro general no disponible');
      const before = await tx.erpConfiguration.findFirstOrThrow({ where: { companyId } });
      if (before.generalWarehouseId && before.generalWarehouseId !== warehouseId && (await tx.inventoryStock.count({ where: { location: { warehouseId: before.generalWarehouseId }, quantity: { gt: 0 } } }) || await tx.purchaseItem.count({ where: { locationId: null, purchase: { warehouseId: before.generalWarehouseId, status: { not: 'CANCELLED' } } } }))) throw new ConflictException('El centro general tiene existencias o recepciones pendientes de ubicar');
      if (before.generalWarehouseId && before.generalWarehouseId !== warehouseId && await tx.purchaseOrder.count({ where: { companyId, warehouseId: before.generalWarehouseId, status: { notIn: ['cancelled','received','closed'] } } })) throw new ConflictException('Complete las ordenes del centro general antes de cambiar su configuracion');
      const config = await tx.erpConfiguration.update({ where: { id: before.id }, data: { generalWarehouseId: warehouseId } });
      await this.audit.record(tx, { controller: 'warehouses', action: 'CONFIGURE_GENERAL', recordId: warehouseId, originalData: before, modifiedData: config, userId });
      return config;
    });
  }

  async list(companyId: number) {
    return this.prisma.purchaseConsolidation.findMany({ where: { companyId, deletedAt: null }, select: { id: true, code: true, status: true, quantityReviewStatus: true, quantityRevision: true, dateFrom: true, dateTo: true, createdAt: true }, orderBy: { id: 'desc' } });
  }
  async one(id: number, companyId: number, tx: Tx = this.prisma) {
    const record = await tx.purchaseConsolidation.findFirst({ where: { id, companyId, deletedAt: null }, include });
    if (!record) throw new NotFoundException('Consolidado no encontrado');
    return { ...record, rfqs: record.rfqs.map(r => ({ ...r, quotation: r.quotation?.deletedAt ? null : r.quotation })), orders: record.orders.filter(o => !o.deletedAt), lines: record.lines.map(line => {
      const orders = line.quotationDetails.flatMap(q => q.orderDetails);
      return { ...line, purchasedQuantity: sum(orders.map(o => o.quantity)), receivedQuantity: sum(orders.map(o => o.receivedQuantity)),
        distributedQuantity: sum(line.sources.flatMap(s => s.requestDetail.transferItems.map(t => t.receivedQuantity))),
        sources: line.sources.map(s => ({ ...s, dispatchedQuantity: sum(s.requestDetail.transferItems.map(t => t.quantity)),
          distributedQuantity: sum(s.requestDetail.transferItems.map(t => t.receivedQuantity)),
          pendingQuantity: Prisma.Decimal.max(0, s.quantity.sub(sum(s.requestDetail.transferItems.map(t => t.receivedQuantity)))) })) };
    }) };
  }
  async requests(companyId: number) {
    const records = await this.prisma.purchaseRequest.findMany({ where: { companyId, deletedAt: null, status: { notIn: ['draft','rejected','cancelled'] } }, include: { branch: true,
      details: { include: { product: true, unit: true, consolidationSources: { include: { line: { select: { consolidationId: true } } } }, transferItems: true, quotationLinks: { include: { quotationDetail: { include: { quotation: true } } } } } } }, orderBy: { requestDate: 'desc' } });
    return records.map(r => ({ ...r, details: r.details.map(d => ({ ...d,
      eligible: ['submitted','approved','in_quotation','partially_ordered','in_procurement'].includes(r.status) && !d.consolidationSources.length && !d.quotationLinks.some(q => !['cancelled','rejected','expired'].includes(q.quotationDetail.quotation.status)),
      dispatchedQuantity: sum(d.transferItems.map(t => t.quantity)), distributedQuantity: sum(d.transferItems.map(t => t.receivedQuantity)),
      pendingQuantity: Prisma.Decimal.max(0, d.quantity.sub(sum(d.transferItems.map(t => t.receivedQuantity)))) })) }));
  }
  async comparison(id:number,companyId:number,details:{quotationDetailId:number;quantity:number}[]=[]) {
    const process=await this.one(id,companyId);
    for(const pick of details) if(!process.rfqs.some(r=>r.quotation?.details.some(d=>d.id===pick.quotationDetailId))) throw new BadRequestException('La oferta no pertenece a esta compra');
    return {processId:id,comparisonHash:purchaseComparisonHash(process,details),...comparePurchase(process,details,new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date()))};
  }
  create(dto: ConsolidationDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      if (dto.dateFrom > dto.dateTo) throw new BadRequestException('Rango de fechas invalido');
      const requests = await tx.purchaseRequest.findMany({ where: { id: { in: dto.requestIds }, companyId, deletedAt: null, status: { in: ['submitted','approved','in_quotation','partially_ordered','in_procurement'] },
        requestDate: { gte: new Date(`${dto.dateFrom}T00:00:00-06:00`), lt: new Date(new Date(`${dto.dateTo}T00:00:00-06:00`).getTime() + 86400000) } },
        include: { details: { include: { consolidationSources: true, quotationLinks: { include: { quotationDetail: { include: { quotation: true } } } } } } } });
      if (requests.length !== dto.requestIds.length) throw new BadRequestException('Seleccione solicitudes enviadas dentro del rango indicado');
      const lines = new Map<number, { productId: number; unitId: number; quantity: Prisma.Decimal; sources: { requestDetailId: number; quantity: Prisma.Decimal }[] }>();
      for (const request of requests) for (const d of request.details) {
        if (!d.quantity.isInteger()) throw new BadRequestException('Las solicitudes deben contener cantidades enteras de productos. Corrija la solicitud de origen');
        if (d.consolidationSources.length || d.quotationLinks.some(q => !['cancelled','rejected','expired'].includes(q.quotationDetail.quotation.status))) throw new ConflictException('Una solicitud ya tiene un proceso de compras activo');
        const current = lines.get(d.productId);
        if (current && current.unitId !== d.unitId) throw new BadRequestException('No se pueden sumar unidades diferentes del mismo producto');
        if (current) { current.quantity = current.quantity.add(d.quantity); current.sources.push({ requestDetailId: d.id, quantity: d.quantity }); }
        else lines.set(d.productId, { productId: d.productId, unitId: d.unitId, quantity: d.quantity, sources: [{ requestDetailId: d.id, quantity: d.quantity }] });
      }
      if (!lines.size) throw new BadRequestException('Las solicitudes no contienen productos');
      if ([...lines.values()].some(l => l.quantity.gt('9999999999.99'))) throw new BadRequestException('La cantidad consolidada supera el limite permitido');
      const record = await tx.purchaseConsolidation.create({ data: { code: `CON-${randomUUID().slice(0, 8).toUpperCase()}`, companyId, userId, dateFrom: new Date(dto.dateFrom), dateTo: new Date(dto.dateTo),
        lines: { create: [...lines.values()].map(l => ({ productId: l.productId, unitId: l.unitId, requestedQuantity: l.quantity, purchaseQuantity: l.quantity, sources: { create: l.sources } })) } } });
      for (const request of requests) {
        await tx.purchaseRequest.update({ where: { id: request.id }, data: { status: 'in_procurement' } });
        await this.audit.record(tx, { controller: 'purchase_requests', action: 'CONSOLIDATE', recordId: request.id, originalData: { status: request.status }, modifiedData: { status: 'in_procurement', consolidationId: record.id }, userId });
      }
      await this.log(tx, 'CREATE', record.id, userId, record);
      return this.one(record.id, companyId, tx);
    });
  }
  editLine(id: number, dto: ConsolidationLineDto, companyId: number, userId: number, actor?: AuthenticatedUser) {
    if (!Number.isSafeInteger(dto.purchaseQuantity) || dto.purchaseQuantity < 0) throw new BadRequestException('La cantidad propuesta debe ser un número entero');
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const current = await this.one(id, companyId, tx);
      if (dto.expectedRevision !== undefined && dto.expectedRevision !== current.quantityRevision) throw new ConflictException('Las cantidades cambiaron. Actualice la compra antes de guardar');
      if (await tx.purchaseRfq.count({ where: { consolidationId: id } }) || current.orders.length) throw new ConflictException('Las cantidades ya fueron consultadas al proveedor y no pueden modificarse en esta compra');
      if (actor && !actor.roles?.includes('superadmin') && !actor.permissions?.includes('purchase_quotations.update')) throw new ForbiddenException('Solo Compras modifica las cantidades de la compra');
      if (!dto.reason.trim()) throw new BadRequestException('Indique el motivo de la decision de compra');
      if (current.orders.some(o=>['sent','partially_received','received','closed'].includes(o.status))) throw new ConflictException('No puede cambiar las cantidades después de enviar o recibir la compra');
      const allocated=current.lines.find(l=>l.productId===dto.productId)?.purchasedQuantity??new Prisma.Decimal(0);
      if(allocated.gt(dto.purchaseQuantity)) throw new ConflictException('La propuesta no puede quedar por debajo de las cantidades ya asignadas a órdenes; corrija primero esas órdenes');
      const product = await tx.product.findFirst({ where: { id: dto.productId, companyId, isActive: true, deletedAt: null }, include: { purchaseUnit: true } });
      if (!product || !product.purchaseUnit.isActive || product.purchaseUnit.type !== 'purchase') throw new BadRequestException('Producto o unidad de compra no disponible');
      const line = await tx.purchaseConsolidationLine.upsert({ where: { consolidationId_productId: { consolidationId: id, productId: dto.productId } },
        create: { consolidationId: id, productId: dto.productId, unitId: product.purchaseUnitId, requestedQuantity: 0, purchaseQuantity: dto.purchaseQuantity, reason: dto.reason.trim(),decidedBy:userId,decidedAt:new Date() },
        update: { purchaseQuantity: dto.purchaseQuantity, reason: dto.reason.trim(),decidedBy:userId,decidedAt:new Date() } });
      await tx.purchaseConsolidation.update({ where: { id }, data: { quantityRevision: { increment: 1 } } });
      await this.log(tx, 'DECIDE_QUANTITY', id, userId, { before: current.lines.find(l => l.productId === dto.productId), after: line });
      return this.one(id, companyId, tx);
    });
  }
  rfq(id: number, dto: RfqDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const current = await this.one(id, companyId, tx);
      const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, companyId, isActive: true, deletedAt: null } });
      if (!supplier) throw new BadRequestException('Proveedor no disponible');
      if (await tx.purchaseRfq.count({ where: { consolidationId: id, supplierId: supplier.id } })) throw new ConflictException('Este proveedor ya tiene una solicitud en el proceso');
      const lines = current.lines.filter(l => dto.lineIds.includes(l.id));
      if (lines.length !== dto.lineIds.length || lines.some(l => l.purchaseQuantity.lte(0))) throw new BadRequestException('Seleccione productos con cantidad decidida mayor a cero');
      if (current.lines.some(l => l.sources.some(s => s.requestDetail.request.deletedAt || ['draft','rejected','cancelled'].includes(s.requestDetail.request.status)))) throw new ConflictException('Una solicitud de origen ya no esta disponible');
      const record = await tx.purchaseRfq.create({ data: { code: `SC-${randomUUID().slice(0, 8).toUpperCase()}`, consolidationId: id, supplierId: supplier.id,
        lines: { create: lines.map(l => ({ lineId: l.id, quantity: l.purchaseQuantity })) } } });
      await tx.purchaseConsolidation.update({ where: { id }, data: { status: 'quoting' } });
      await this.log(tx, 'REQUEST_QUOTATION', id, userId, record);
      return this.one(id, companyId, tx);
    });
  }
  async rfqDocument(id: number, companyId: number) {
    const rfq = await this.prisma.purchaseRfq.findFirst({ where: { id, deletedAt: null, consolidation: { companyId, deletedAt: null } }, include: { supplier: true, consolidation: { include: { company: true } }, lines: { include: { line: { include: { product: true, unit: true } } }, orderBy: { id: 'asc' } } } });
    if (!rfq) throw new NotFoundException('Solicitud de cotizacion no encontrada');
    return rfq;
  }
  award(id: number, dto: AwardDto, companyId: number, user: AuthenticatedUser) {
    if(dto.submitForApproval && !user.roles?.includes('superadmin') && !user.permissions?.includes('purchase_orders.update')) throw new ForbiddenException('Se requiere permiso de enviar órdenes a aprobación');
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const current = await this.one(id, companyId, tx);
      const requestId = dto.requestId?.toLowerCase();
      const requestPayload = {
        submitForApproval:dto.submitForApproval??false,acceptPartialComparison:dto.acceptPartialComparison??false,
        branchId: dto.branchId,
        warehouseId: dto.warehouseId,
        details: dto.details.map(line => ({ quotationDetailId: line.quotationDetailId, quantity: line.quantity })).sort((a, b) => a.quotationDetailId - b.quotationDetailId),
      };
      const requestHash = createHash('sha256').update(JSON.stringify(requestPayload)).digest('hex');
      if (requestId) {
        // The company lock and the audit event commit together, including updates to an existing draft.
        const previous = await tx.log.findFirst({ where: { controller: 'purchase_consolidations', recordId: id, action: 'AWARD', modifiedData: { path: ['requestId'], equals: requestId } } });
        if (previous) {
          const data = previous.modifiedData as Record<string, unknown> | null;
          const legacyHash=createHash('sha256').update(JSON.stringify({branchId:dto.branchId,warehouseId:dto.warehouseId,details:requestPayload.details})).digest('hex');
          if (data?.requestHash !== requestHash && (dto.submitForApproval || dto.acceptPartialComparison || data?.requestHash!==legacyHash)) throw new ConflictException('Referencia de adjudicacion reutilizada con otros datos');
          return current;
        }
      }
      const groups = new Map<number, AwardDto['details']>();
      if(dto.expectedComparisonHash&&dto.expectedComparisonHash!==purchaseComparisonHash(current,dto.details))throw new ConflictException('Las ofertas o cantidades cambiaron. Actualice la comparación antes de enviar a Gerencia');
      const comparison=comparePurchase(current,dto.details,new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date()));
      if(dto.submitForApproval&&comparison.selection.some(g=>g.partial||g.totalUsd==null)&&!dto.acceptPartialComparison) throw new BadRequestException('La comparación tiene gastos, condiciones o cambio sin confirmar; revise y acepte expresamente la comparación parcial');
      const warehouse = await generalWarehouse(tx, companyId);
      if (dto.warehouseId !== warehouse.id || dto.branchId !== warehouse.branchId) throw new BadRequestException('Las compras deben recibirse en el centro general configurado');
      const suppliers = new Map<number, number>();
      for (const selected of dto.details) {
        const rfq = current.rfqs.find(r => r.quotation?.details.some(d => d.id === selected.quotationDetailId));
        if (!rfq?.quotation || !['received','under_review','selected'].includes(rfq.quotation.status)) throw new BadRequestException('Seleccione productos de ofertas recibidas del consolidado');
        if (suppliers.has(rfq.supplierId) && suppliers.get(rfq.supplierId) !== rfq.quotation.id) throw new BadRequestException('Solo se permite una oferta por proveedor en cada adjudicacion');
        suppliers.set(rfq.supplierId, rfq.quotation.id);
        const lines = groups.get(rfq.quotation.id) ?? []; lines.push(selected); groups.set(rfq.quotation.id, lines);
      }
      const orders: unknown[] = [];
      for (const [quotationId, details] of groups) {
        const before = await tx.purchaseQuotation.findUniqueOrThrow({ where: { id: quotationId } });
        await tx.purchaseQuotation.update({ where: { id: quotationId }, data: { status: 'selected' } });
        await this.audit.record(tx, { controller: 'purchase_quotations', action: 'SELECT_LINES', recordId: quotationId, originalData: before, modifiedData: details, userId: user.sub });
        const quotation = current.rfqs.find(r => r.quotation?.id === quotationId)!.quotation!;
        const deliveryDays = Math.max(...details.map(selected => quotation.details.find(line => line.id === selected.quotationDetailId)?.deliveryDays ?? quotation.deliveryDays));
        const order=await this.purchases.generateOrder(quotationId, { ...dto, details, expectedDate: new Date(Date.now() + deliveryDays * 86400000).toISOString() }, user.sub, companyId, user, tx);
        await tx.purchaseOrder.update({where:{id:order.id},data:{comparisonSnapshot:JSON.parse(JSON.stringify({processId:id,selected:dto.details,comparison,proposal:current.lines.map(l=>({productId:l.productId,requestedQuantity:l.requestedQuantity,purchaseQuantity:l.purchaseQuantity,reason:l.reason,decidedBy:l.decidedBy,decidedAt:l.decidedAt,sources:l.sources})),partialAccepted:dto.acceptPartialComparison??false}))}});
        orders.push(dto.submitForApproval?await this.purchases.submitOrder(order.id,user.sub,companyId,tx):order);
      }
      const updated = await this.one(id, companyId, tx);
      await tx.purchaseConsolidation.update({ where: { id }, data: { status: updated.lines.some(line => line.purchasedQuantity.lt(line.purchaseQuantity)) ? 'partially_ordered' : 'ordered' } });
      await this.log(tx, 'AWARD', id, user.sub, { requestId, requestHash, requestPayload, details: dto.details, orders });
      return this.one(id, companyId, tx);
    });
  }
  /** Received lines waiting for a physical space, each with the spaces of its warehouse that can (or cannot) take it. */
  async pendingPlacement(companyId: number) {
    const items = await this.prisma.purchaseItem.findMany({ where: { locationId: null, purchase: { companyId, deletedAt: null, status: { not: 'CANCELLED' } } },
      include: { product: true, unit: true, purchase: { include: { warehouse: { include: { locations: { where: { isActive: true, deletedAt: null, locationType: 'STORAGE' }, include: { stocks: { where: { quantity: { gt: 0 } }, include: { product: true } } } } } } } } }, orderBy: { id: 'asc' } });
    return items.map(item => {
      const warehouse = item.purchase.warehouse;
      const locationOptions = describeSlots(warehouse?.locations ?? [], item.productId, item.unitId, item.unit.name, Number(item.quantity));
      const suggested = locationOptions.find(option => option.id === item.suggestedLocationId && option.compatible);
      return { ...item, purchase: { ...item.purchase, warehouse: warehouse && { id: warehouse.id, name: warehouse.name } }, locationOptions,
        recommendedLocationId: suggested?.id ?? locationOptions.find(option => option.compatible)?.id ?? null };
    });
  }
  place(id: number, dto: PlacementDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const item = await tx.purchaseItem.findFirst({ where: { id, purchase: { companyId, deletedAt: null, status: { not: 'CANCELLED' } } }, include: { purchase: true, product: true } });
      if (!item) throw new NotFoundException('Producto recibido no disponible');
      if (!dto.confirmed || dto.barcode !== item.product.internalCode) throw new BadRequestException('Confirme la colocacion y lea el codigo de barras interno del producto');
      if (item.locationId !== null) {
        if (item.locationId === dto.locationId && item.barcodeConfirmed) return item;
        throw new ConflictException('Este producto ya fue ubicado');
      }
      const slot = await tx.location.findFirst({ where: { id: dto.locationId, warehouseId: item.purchase.warehouseId ?? -1, locationType: 'STORAGE', isActive: true, deletedAt: null }, include: { stocks: { where: { quantity: { gt: 0 } }, include: { product: true } } } });
      if (!slot) throw new BadRequestException('Seleccione un espacio activo del almacen receptor');
      if (slot.stocks.some(s => s.product.purchaseUnitId !== item.unitId)) throw new ConflictException('La capacidad del espacio no se puede sumar con unidades diferentes');
      if (sum(slot.stocks.map(s => s.quantity)).add(item.quantity).gt(slot.capacity)) throw new ConflictException('El espacio no tiene capacidad suficiente');
      await this.inventory.receive(tx, companyId, userId, { purchaseItemId: item.id, locationId: slot.id, reason: `Recepcion ${item.purchase.documentNumber}` });
      const placed = await tx.purchaseItem.update({ where: { id }, data: { locationId: slot.id, placedAt: new Date(), placedBy: userId, barcodeConfirmed: true } });
      await this.audit.record(tx, { controller: 'purchases', action: 'CONFIRM_PLACEMENT', recordId: item.purchaseId, originalData: item, modifiedData: placed, userId });
      return placed;
    });
  }
  transfers(companyId: number) {
    return this.prisma.transfer.findMany({ where: { companyId, deletedAt: null }, include: { items: { include: { product: true, lot: { select: { id: true, lotCode: true } }, requestDetail: { include: { request: { include: { branch: true } } } } } } }, orderBy: { id: 'desc' } });
  }
  dispatch(dto: TransferDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const requestId = dto.requestId.toLowerCase();
      const previous = await tx.transfer.findFirst({ where: { uuid: { equals: requestId, mode: 'insensitive' } }, include: { items: true } });
      if (previous) {
        const dispatched = (i: { requestDetailId: number | null; fromLocationId: number; toLocationId: number }) => `${i.requestDetailId}:${i.fromLocationId}:${i.toLocationId}`;
        if (previous.companyId !== companyId || !dto.items.every(i => sum(previous.items.filter(p => dispatched(p) === dispatched(i)).map(p => p.quantity)).eq(i.quantity)) || previous.items.some(p => !dto.items.some(i => dispatched(i) === dispatched(p)))) throw new ConflictException('Referencia de despacho reutilizada con otros datos');
        return previous;
      }
      const items: { requestDetailId: number; productId: number; quantity: number; fromLocationId: number; toLocationId: number }[] = [];
      const general = await generalWarehouse(tx, companyId);
      let fromWarehouseId = 0, toWarehouseId = 0;
      for (const line of dto.items) {
        const request = await tx.purchaseRequestDetail.findFirst({ where: { id: line.requestDetailId, request: { companyId, deletedAt: null, status: { notIn: ['draft','rejected','cancelled'] } } }, include: { request: true, transferItems: true } });
        if (!request) throw new BadRequestException('Solicitud original no disponible');
        const already = sum(request.transferItems.map(i => i.quantity)).add(items.filter(i => i.requestDetailId === request.id).reduce((a, i) => a.add(i.quantity), new Prisma.Decimal(0)));
        if (already.add(line.quantity).gt(request.quantity)) throw new ConflictException('El despacho supera el saldo de la solicitud');
        const locations = await tx.location.findMany({ where: { id: { in: [line.fromLocationId, line.toLocationId] }, warehouse: { isActive: true, deletedAt: null, branch: { companyId, isActive: true, deletedAt: null } }, isActive: true, deletedAt: null } });
        const from = locations.find(l => l.id === line.fromLocationId), to = locations.find(l => l.id === line.toLocationId);
        const destination = to ? await tx.warehouse.findUnique({ where: { id: to.warehouseId } }) : null;
        if (!from || !to || from.warehouseId !== general.id || from.warehouseId === to.warehouseId || destination?.branchId !== request.request.branchId) throw new BadRequestException('El origen debe ser el centro general y el destino un almacen de la sucursal solicitante');
        if (items.length && (fromWarehouseId !== from.warehouseId || toWarehouseId !== to.warehouseId)) throw new BadRequestException('Un traslado solo puede tener un almacen origen y un destino');
        fromWarehouseId = from.warehouseId; toWarehouseId = to.warehouseId;
        items.push({ ...line, productId: request.productId });
      }
      if (dto.vehicleLocationId && !await tx.location.count({ where: { id: dto.vehicleLocationId, locationType: 'VEHICLE', isActive: true, deletedAt: null, warehouse: { branch: { companyId } } } })) throw new BadRequestException('La ubicación de tránsito debe ser un vehículo activo de la empresa');
      const created = await tx.transfer.create({ data: { uuid: requestId, companyId, userId, documentNumber: `TR-${randomUUID().slice(0, 8).toUpperCase()}`, fromWarehouseId, toWarehouseId, vehicleLocationId: dto.vehicleLocationId ?? null, notes: dto.notes?.trim() || null, status: dto.prepareOnly ? 'PREPARING' : 'IN_TRANSIT', dispatchedAt: dto.prepareOnly ? null : new Date() } });
      // El despacho sale del lote mas antiguo de la ubicacion de origen; una linea puede repartirse en varios lotes.
      for (const line of items) {
        const slices = await this.inventory.allocate(tx, line.productId, line.fromLocationId, line.quantity);
        for (const slice of slices) {
          const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: slice.lotId } });
          const detail = await tx.transferItem.create({ data: { transferId: created.id, requestDetailId: line.requestDetailId, productId: line.productId, lotId: lot.id, fromLocationId: line.fromLocationId, toLocationId: line.toLocationId, quantity: slice.quantity, unitCost: lot.unitCost } });
          if (!dto.prepareOnly) await this.inventory.dispatchOut(tx, companyId, userId, { lotId: lot.id, productId: line.productId, locationId: line.fromLocationId, quantity: slice.quantity, key: `transfer-out:${detail.id}`, reason: `Despacho ${created.documentNumber}`, transferId: created.id });
        }
      }
      const record = await tx.transfer.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
      await this.audit.record(tx, { controller: 'inventory', action: dto.prepareOnly ? 'PREPARE' : 'DISPATCH', recordId: record.id, modifiedData: record, userId });
      return record;
    });
  }
  receiveTransfer(id: number, dto: TransferReceiptDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const record = await tx.transfer.findFirst({ where: { id, companyId, deletedAt: null }, include: { items: true } });
      if (!record) throw new NotFoundException('Traslado no encontrado');
      const prefix = `transfer-in:${companyId}:${dto.requestId.toLowerCase()}:`;
      const prior = await tx.inventoryMovement.findMany({ where: { key: { startsWith: prefix, mode: 'insensitive' } } });
      if (prior.length) {
        if (prior.length !== dto.items.length || !dto.items.every(i => prior.some(p => p.key.toLowerCase() === `${prefix}${i.itemId}` && p.quantityIn.eq(i.quantity) && p.locationId === i.locationId && p.reason === `Recepcion ${record.documentNumber}`))) throw new ConflictException('Referencia de recepcion reutilizada con otros datos');
        return record;
      }
      if (!['IN_TRANSIT','PARTIALLY_RECEIVED','INCIDENT'].includes(record.status)) throw new ConflictException('El traslado no esta pendiente de recibir');
      for (const line of dto.items) {
        const item = record.items.find(i => i.id === line.itemId);
        if (!item || item.receivedQuantity.add(line.quantity).gt(item.quantity)) throw new BadRequestException('La cantidad recibida supera el despacho pendiente');
        const slot = await tx.location.findFirst({ where: { id: line.locationId, warehouseId: record.toWarehouseId, locationType: 'STORAGE', isActive: true, deletedAt: null }, include: { stocks: { where: { quantity: { gt: 0 } }, include: { product: true } } } });
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
        if (!slot || slot.stocks.some(s => s.product.purchaseUnitId !== product.purchaseUnitId) || sum(slot.stocks.map(s => s.quantity)).add(line.quantity).gt(slot.capacity)) throw new ConflictException('Espacio de destino no disponible o sin capacidad');
        if (!item.lotId) throw new ConflictException('El traslado no conserva el lote de origen y no puede recibirse');
        await this.inventory.receiveIn(tx, companyId, userId, { lotId: item.lotId, productId: item.productId, locationId: slot.id, quantity: new Prisma.Decimal(line.quantity), key: `${prefix}${item.id}`, reason: `Recepcion ${record.documentNumber}`, transferId: record.id });
        await tx.transferItem.update({ where: { id: item.id }, data: { receivedQuantity: { increment: line.quantity }, toLocationId: slot.id } });
      }
      const items = await tx.transferItem.findMany({ where: { transferId: id } });
      const complete = items.every(i => i.receivedQuantity.eq(i.quantity));
      const result = await tx.transfer.update({ where: { id }, data: { status: complete ? 'COMPLETED' : 'PARTIALLY_RECEIVED', receivedAt: complete ? new Date() : null }, include: { items: true } });
      const origins = await tx.purchaseRequestDetail.findMany({ where: { id: { in: record.items.flatMap(i => i.requestDetailId ? [i.requestDetailId] : []) } }, select: { requestId: true } });
      for (const requestId of [...new Set(origins.map(o => o.requestId))]) {
        const original = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: requestId }, include: { details: { include: { transferItems: true } } } });
        const fulfilled = original.details.every(d => sum(d.transferItems.map(t => t.receivedQuantity)).gte(d.quantity));
        const status = fulfilled ? 'fulfilled' : 'partially_distributed';
        await tx.purchaseRequest.update({ where: { id: requestId }, data: { status } });
        await this.audit.record(tx, { controller: 'purchase_requests', action: 'DISTRIBUTION_PROGRESS', recordId: requestId, originalData: { status: original.status }, modifiedData: { status }, userId });
      }
      await this.audit.record(tx, { controller: 'inventory', action: 'RECEIVE_TRANSFER', recordId: id, originalData: record, modifiedData: result, userId });
      return result;
    });
  }
  /** EN PREPARACIÓN -> EN TRÁNSITO: recién aquí la mercancía sale del origen; si ya no alcanza, no sale nada. */
  confirmDispatch(id: number, dto: TransferConfirmDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const record = await tx.transfer.findFirst({ where: { id, companyId, deletedAt: null }, include: { items: true } });
      if (!record) throw new NotFoundException('Traslado no encontrado');
      if (record.status === 'IN_TRANSIT' && !!record.dispatchedAt) return record;
      if (record.status !== 'PREPARING') throw new ConflictException('Solo un traslado en preparación puede despacharse');
      const vehicleLocationId = dto.vehicleLocationId ?? record.vehicleLocationId;
      if (vehicleLocationId && !await tx.location.count({ where: { id: vehicleLocationId, locationType: 'VEHICLE', isActive: true, deletedAt: null, warehouse: { branch: { companyId } } } })) throw new BadRequestException('La ubicación de tránsito debe ser un vehículo activo de la empresa');
      for (const item of record.items) {
        if (!item.lotId) throw new ConflictException('El traslado no conserva el lote de origen y no puede despacharse');
        await this.inventory.dispatchOut(tx, companyId, userId, { lotId: item.lotId, productId: item.productId, locationId: item.fromLocationId, quantity: item.quantity, key: `transfer-out:${item.id}`, reason: `Despacho ${record.documentNumber}`, transferId: record.id })
          .catch(error => { if (error instanceof ConflictException) throw new ConflictException('Las existencias del origen cambiaron y ya no alcanzan para este despacho; cancele la preparación y vuelva a prepararlo'); throw error; });
      }
      const result = await tx.transfer.update({ where: { id }, data: { status: 'IN_TRANSIT', dispatchedAt: new Date(), vehicleLocationId: vehicleLocationId ?? null, ...(dto.notes?.trim() ? { notes: [record.notes, dto.notes.trim()].filter(Boolean).join('\n') } : {}) }, include: { items: true } });
      await this.audit.record(tx, { controller: 'inventory', action: 'DISPATCH', recordId: id, originalData: record, modifiedData: result, userId });
      return result;
    });
  }

  /** Una preparación aún no movió existencias: al cancelarla se libera lo reservado en la solicitud y queda el registro. */
  cancelPreparation(id: number, dto: TransferIncidentDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const record = await tx.transfer.findFirst({ where: { id, companyId, deletedAt: null }, include: { items: true } });
      if (!record) throw new NotFoundException('Traslado no encontrado');
      if (record.status === 'CANCELLED') return record;
      if (record.status !== 'PREPARING') throw new ConflictException('Solo un traslado en preparación puede cancelarse');
      if (!dto.reason.trim()) throw new BadRequestException('Indique el motivo de la cancelación');
      await tx.transferItem.deleteMany({ where: { transferId: id } });
      const result = await tx.transfer.update({ where: { id }, data: { status: 'CANCELLED', notes: [record.notes, `Cancelado en preparación: ${dto.reason.trim()}`].filter(Boolean).join('\n') }, include: { items: true } });
      await this.audit.record(tx, { controller: 'inventory', action: 'CANCEL_PREPARATION', recordId: id, originalData: record, modifiedData: result, userId });
      return result;
    });
  }

  /** Una diferencia al recibir (faltante, dano) deja el traslado en INCIDENCIA hasta que se complete la recepcion. */
  reportIncident(id: number, dto: TransferIncidentDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const record = await tx.transfer.findFirst({ where: { id, companyId, deletedAt: null }, include: { items: true } });
      if (!record) throw new NotFoundException('Traslado no encontrado');
      if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(record.status)) throw new ConflictException('Solo un traslado en transito puede registrar una incidencia');
      if (!dto.reason.trim()) throw new BadRequestException('Indique el motivo de la incidencia');
      const result = await tx.transfer.update({ where: { id }, data: { status: 'INCIDENT', notes: [record.notes, `Incidencia: ${dto.reason.trim()}`].filter(Boolean).join('\n') }, include: { items: true } });
      await this.audit.record(tx, { controller: 'inventory', action: 'TRANSFER_INCIDENT', recordId: id, originalData: record, modifiedData: result, userId });
      return result;
    });
  }
  actualExpenses(purchaseId: number, companyId: number) {
    return this.prisma.purchaseActualExpense.findMany({ where: { purchaseId, deletedAt: null, purchase: { companyId, deletedAt: null } }, include: { expenseType: true, plannedExpense: true, allocations: true } });
  }
  expense(purchaseId: number, dto: ActualExpenseDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const purchase = await tx.purchase.findFirst({ where: { id: purchaseId, companyId, deletedAt: null, status: { notIn: ['CANCELLED','CLOSED','COSTED'] } }, include: { retaceos: true } });
      if (!purchase || purchase.retaceos.some(r => !['cancelled','draft'].includes(r.status))) throw new ConflictException('La recepcion ya tiene costos fijados');
      if (!dto.reference.trim()) throw new BadRequestException('Indique la referencia del gasto real');
      if (!await tx.expenseType.count({ where: { id: dto.expenseTypeId, companyId, isActive: true, deletedAt: null } })) throw new BadRequestException('Tipo de gasto no disponible');
      if (dto.plannedExpenseId && !await tx.purchaseOrderExpense.count({ where: { id: dto.plannedExpenseId, orderId: purchase.purchaseOrderId, expenseTypeId: dto.expenseTypeId } })) throw new BadRequestException('El gasto previsto no pertenece a esta orden o tipo');
      const previous = await tx.purchaseActualExpense.findUnique({ where: { purchaseId_reference: { purchaseId, reference: dto.reference.trim() } } });
      if (previous) {
        if (!previous.amount.eq(dto.amount) || previous.category !== dto.category || previous.capitalizable !== dto.capitalizable || previous.plannedExpenseId !== (dto.plannedExpenseId ?? null) || previous.expenseTypeId !== dto.expenseTypeId) throw new ConflictException('Esta referencia de gasto ya fue registrada con otros datos');
        return previous;
      }
      if (await tx.purchaseActualExpense.count({ where: { reference: dto.reference.trim(), purchase: { purchaseOrderId: purchase.purchaseOrderId } } })) throw new ConflictException('Este gasto ya se registro en otra recepcion de la misma orden');
      const expense = await tx.purchaseActualExpense.create({ data: { ...dto, reference: dto.reference.trim(), purchaseId } });
      await this.audit.record(tx, { controller: 'purchase_expenses', action: 'ACTUAL', recordId: expense.id, modifiedData: expense, userId });
      return expense;
    });
  }
  private log(tx: Tx, action: string, id: number, userId: number, data: unknown) {
    return this.audit.record(tx, { controller: 'purchase_consolidations', action, recordId: id, modifiedData: data, userId });
  }
}
