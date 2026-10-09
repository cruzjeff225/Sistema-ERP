import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';
import { AuditService } from '../../../audit/application/services/audit.service';
import { InventoryService } from '../../../inventory/inventory.service';
import { AuthenticatedUser } from '../../../auth/presentation/decorators/current-user.decorator';
import { PurchasesService } from './purchases.service';
import { purchaseTransaction } from './purchase-transaction';
import { generalWarehouse } from './general-warehouse';
import { comparePurchase,purchaseComparisonHash } from './purchase-comparison';
import { assertQuantitiesApproved } from './quantity-review';
import { ActualExpenseDto, AwardDto, ConsolidationDto, ConsolidationLineDto, QuantityReviewDto, PlacementDto, RfqDto, TransferDto, TransferReceiptDto } from '../dto/supply-workflow.dto';

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
      details: { include: { product: true, unit: true, consolidationSources: { include: { line: { select: { consolidationId: true, quotationDetails: { select: { orderDetails: { select: { receivedQuantity: true } } } } } } } }, transferItems: true, quotationLinks: { include: { quotationDetail: { include: { quotation: true } } } } } } }, orderBy: { requestDate: 'desc' } });
    return records.map(r => ({ ...r, details: r.details.map(d => ({ ...d,
      eligible: ['submitted','approved','in_quotation','partially_ordered','in_procurement'].includes(r.status) && !d.consolidationSources.length && !d.quotationLinks.some(q => !['cancelled','rejected','expired'].includes(q.quotationDetail.quotation.status)),
      // Stock already received from suppliers for this need, so the UI can point to the branch delivery instead of quoting again.
      receivedFromPurchases: sum(d.consolidationSources.flatMap(src => src.line.quotationDetails.flatMap(q => q.orderDetails.map(o => o.receivedQuantity)))),
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
      const manager = actor?.roles?.includes('superadmin') || actor?.permissions?.includes('purchase_orders.approve');
      if (current.quantityReviewStatus === 'approved') throw new ConflictException('Las cantidades están autorizadas. Devuelva la propuesta antes de modificarlas');
      if (current.quantityReviewStatus === 'pending_review' && !manager) throw new ForbiddenException('Gerencia está revisando las cantidades; espere su decisión');
      if (current.quantityReviewStatus !== 'pending_review' && actor && !actor.roles?.includes('superadmin') && !actor.permissions?.includes('purchase_quotations.update')) throw new ForbiddenException('Compras prepara la propuesta; Gerencia modifica las cantidades durante su revisión');
      if (!dto.reason.trim()) throw new BadRequestException('Indique el motivo de la decision de compra');
      if (current.orders.some(o=>['sent','partially_received','received','closed'].includes(o.status))) throw new ConflictException('No puede cambiar las cantidades después de enviar o recibir la compra');
      const allocated=current.lines.find(l=>l.productId===dto.productId)?.purchasedQuantity??new Prisma.Decimal(0);
      if(allocated.gt(dto.purchaseQuantity)) throw new ConflictException('La propuesta no puede quedar por debajo de las cantidades ya asignadas a órdenes; corrija primero esas órdenes');
      const product = await tx.product.findFirst({ where: { id: dto.productId, companyId, isActive: true, deletedAt: null }, include: { purchaseUnit: true } });
      if (!product || !product.purchaseUnit.isActive || product.purchaseUnit.type !== 'purchase') throw new BadRequestException('Producto o unidad de compra no disponible');
      const line = await tx.purchaseConsolidationLine.upsert({ where: { consolidationId_productId: { consolidationId: id, productId: dto.productId } },
        create: { consolidationId: id, productId: dto.productId, unitId: product.purchaseUnitId, requestedQuantity: 0, purchaseQuantity: dto.purchaseQuantity, reason: dto.reason.trim(),decidedBy:userId,decidedAt:new Date() },
        update: { purchaseQuantity: dto.purchaseQuantity, reason: dto.reason.trim(),decidedBy:userId,decidedAt:new Date() } });
      await tx.purchaseConsolidation.update({ where: { id }, data: { quantityRevision: { increment: 1 }, quantityApprovedRevision: null, quantityApprovedBy: null, quantityApprovedAt: null } });
      await this.log(tx, 'DECIDE_QUANTITY', id, userId, { before: current.lines.find(l => l.productId === dto.productId), after: line });
      return this.one(id, companyId, tx);
    });
  }
  reviewQuantities(id: number, action: 'submit' | 'approve' | 'return', dto: QuantityReviewDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const current = await this.one(id, companyId, tx);
      if (current.quantityRevision !== dto.expectedRevision) throw new ConflictException('La propuesta cambió. Actualice y revise las cantidades antes de continuar');
      if (await tx.purchaseRfq.count({ where: { consolidationId: id } }) || current.orders.length) throw new ConflictException('La revisión de cantidades debe realizarse antes de consultar proveedores');
      const expected = action === 'submit' ? ['draft', 'returned'] : action === 'approve' ? ['pending_review'] : ['pending_review', 'approved'];
      if (!expected.includes(current.quantityReviewStatus)) throw new ConflictException('La propuesta no está disponible para esta acción');
      if (action === 'return' && !dto.notes?.trim()) throw new BadRequestException('Indique las observaciones para devolver las cantidades');
      if (action !== 'return' && !current.lines.some(line => line.purchaseQuantity.gt(0))) throw new BadRequestException('Debe proponerse al menos un producto con cantidad mayor a cero');
      if (action !== 'return' && current.lines.some(line => !line.purchaseQuantity.eq(line.requestedQuantity) && !line.reason?.trim())) throw new BadRequestException('Registre el motivo de cada diferencia respecto a lo solicitado');
      const after = await tx.purchaseConsolidation.update({ where: { id }, data: {
        quantityReviewStatus: action === 'submit' ? 'pending_review' : action === 'approve' ? 'approved' : 'returned',
        quantityApprovedRevision: action === 'approve' ? current.quantityRevision : null,
        quantityApprovedBy: action === 'approve' ? userId : null,
        quantityApprovedAt: action === 'approve' ? new Date() : null,
        quantityReviewNotes: dto.notes?.trim() || (action === 'return' ? null : current.quantityReviewNotes),
      } });
      await this.audit.record(tx, { controller: 'purchase_consolidations', action: 'QUANTITIES_' + action.toUpperCase(), recordId: id, userId, originalData: current, modifiedData: after });
      return this.one(id, companyId, tx);
    });
  }
  rfq(id: number, dto: RfqDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const current = await this.one(id, companyId, tx);
      assertQuantitiesApproved(current);
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
    assertQuantitiesApproved(rfq.consolidation);
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
      assertQuantitiesApproved(current);
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
        await tx.purchaseOrder.update({where:{id:order.id},data:{comparisonSnapshot:JSON.parse(JSON.stringify({processId:id,quantityAuthorization:{revision:current.quantityApprovedRevision,userId:current.quantityApprovedBy,approvedAt:current.quantityApprovedAt},selected:dto.details,comparison,proposal:current.lines.map(l=>({productId:l.productId,requestedQuantity:l.requestedQuantity,purchaseQuantity:l.purchaseQuantity,reason:l.reason,decidedBy:l.decidedBy,decidedAt:l.decidedAt,sources:l.sources})),partialAccepted:dto.acceptPartialComparison??false}))}});
        orders.push(dto.submitForApproval?await this.purchases.submitOrder(order.id,user.sub,companyId,tx):order);
      }
      const updated = await this.one(id, companyId, tx);
      await tx.purchaseConsolidation.update({ where: { id }, data: { status: updated.lines.some(line => line.purchasedQuantity.lt(line.purchaseQuantity)) ? 'partially_ordered' : 'ordered' } });
      await this.log(tx, 'AWARD', id, user.sub, { requestId, requestHash, requestPayload, details: dto.details, orders });
      return this.one(id, companyId, tx);
    });
  }
  async pendingPlacement(companyId: number) {
    return this.prisma.purchaseItem.findMany({ where: { locationId: null, purchase: { companyId, deletedAt: null, status: { not: 'CANCELLED' } } }, include: { product: true, unit: true, purchase: { include: { warehouse: { include: { locations: { where: { isActive: true, deletedAt: null } } } } } } }, orderBy: { id: 'asc' } });
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
      const slot = await tx.location.findFirst({ where: { id: dto.locationId, warehouseId: item.purchase.warehouseId ?? -1, isActive: true, deletedAt: null }, include: { stocks: { where: { quantity: { gt: 0 } }, include: { product: true } } } });
      if (!slot) throw new BadRequestException('Seleccione un espacio activo del almacen receptor');
      if (slot.stocks.some(s => s.product.purchaseUnitId !== item.unitId)) throw new ConflictException('La capacidad del espacio no se puede sumar con unidades diferentes');
      if (sum(slot.stocks.map(s => s.quantity)).add(item.quantity).gt(slot.capacity)) throw new ConflictException('El espacio no tiene capacidad suficiente');
      await this.inventory.post(tx, companyId, userId, { productId: item.productId, locationId: slot.id, quantity: item.quantity, key: `receipt:${item.id}`, type: 'RECEIPT', purchaseItemId: item.id, reason: `Recepcion ${item.purchase.documentNumber}` });
      const placed = await tx.purchaseItem.update({ where: { id }, data: { locationId: slot.id, placedAt: new Date(), placedBy: userId, barcodeConfirmed: true } });
      await this.audit.record(tx, { controller: 'purchases', action: 'CONFIRM_PLACEMENT', recordId: item.purchaseId, originalData: item, modifiedData: placed, userId });
      return placed;
    });
  }
  transfers(companyId: number) {
    return this.prisma.transfer.findMany({ where: { companyId, deletedAt: null }, include: { items: { include: { product: true, requestDetail: { include: { request: { include: { branch: true } } } } } } }, orderBy: { id: 'desc' } });
  }
  dispatch(dto: TransferDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const requestId = dto.requestId.toLowerCase();
      const previous = await tx.transfer.findFirst({ where: { uuid: { equals: requestId, mode: 'insensitive' } }, include: { items: true } });
      if (previous) {
        if (previous.companyId !== companyId || previous.items.length !== dto.items.length || !dto.items.every(i => previous.items.some(p => p.requestDetailId === i.requestDetailId && p.fromLocationId === i.fromLocationId && p.toLocationId === i.toLocationId && p.quantity.eq(i.quantity)))) throw new ConflictException('Referencia de despacho reutilizada con otros datos');
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
      const record = await tx.transfer.create({ data: { uuid: requestId, companyId, userId, documentNumber: `TR-${randomUUID().slice(0, 8).toUpperCase()}`, fromWarehouseId, toWarehouseId, status: 'IN_TRANSIT', dispatchedAt: new Date(), items: { create: items } }, include: { items: true } });
      for (const i of record.items) await this.inventory.post(tx, companyId, userId, { productId: i.productId, locationId: i.fromLocationId, quantity: i.quantity.negated(), type: 'TRANSFER_OUT', key: `transfer-out:${i.id}`, reason: `Despacho ${record.documentNumber}` });
      await this.audit.record(tx, { controller: 'inventory', action: 'DISPATCH', recordId: record.id, modifiedData: record, userId });
      return record;
    });
  }
  receiveTransfer(id: number, dto: TransferReceiptDto, companyId: number, userId: number) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const record = await tx.transfer.findFirst({ where: { id, companyId, deletedAt: null }, include: { items: true } });
      if (!record) throw new NotFoundException('Traslado no encontrado');
      const prefix = `transfer-in:${companyId}:${dto.requestId.toLowerCase()}:`;
      const prior = await tx.inventoryMovement.findMany({ where: { key: { startsWith: prefix, mode: 'insensitive' } }, include: { stock: true } });
      if (prior.length) {
        if (prior.length !== dto.items.length || !dto.items.every(i => prior.some(p => p.key.toLowerCase() === `${prefix}${i.itemId}` && p.quantity.eq(i.quantity) && p.stock.locationId === i.locationId && p.reason === `Recepcion ${record.documentNumber}`))) throw new ConflictException('Referencia de recepcion reutilizada con otros datos');
        return record;
      }
      if (!['IN_TRANSIT','PARTIALLY_RECEIVED'].includes(record.status)) throw new ConflictException('El traslado no esta pendiente de recibir');
      for (const line of dto.items) {
        const item = record.items.find(i => i.id === line.itemId);
        if (!item || item.receivedQuantity.add(line.quantity).gt(item.quantity)) throw new BadRequestException('La cantidad recibida supera el despacho pendiente');
        const slot = await tx.location.findFirst({ where: { id: line.locationId, warehouseId: record.toWarehouseId, isActive: true, deletedAt: null }, include: { stocks: { where: { quantity: { gt: 0 } }, include: { product: true } } } });
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
        if (!slot || slot.stocks.some(s => s.product.purchaseUnitId !== product.purchaseUnitId) || sum(slot.stocks.map(s => s.quantity)).add(line.quantity).gt(slot.capacity)) throw new ConflictException('Espacio de destino no disponible o sin capacidad');
        await this.inventory.post(tx, companyId, userId, { productId: item.productId, locationId: slot.id, quantity: line.quantity, type: 'TRANSFER_IN', key: `${prefix}${item.id}`, reason: `Recepcion ${record.documentNumber}` });
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
