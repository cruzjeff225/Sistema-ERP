import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../audit/application/services/audit.service";
import { purchaseTransaction } from "../purchases/application/services/purchase-transaction";
import { InventoryAdjustmentDto, InventoryQueryDto, KardexExportQueryDto, KardexQueryDto, LabelPrintDto, LotQueryDto, OpeningBalanceDto, RelocationDto, ReturnDto, SaleDeliveryDto, SaleReversalDto, VehicleLocationDto } from "./inventory.dto";
import { applyEntry, applyExit, applyRevaluation, allocateFifo, lotCodeForAdjustment, lotCodeForOpening, lotCodeForReceipt, type CostBalance, type LotSlice } from './inventory-costing';
import { locationMapState } from './location-map';

type Tx = Prisma.TransactionClient;
type Reference = { type: string; id?: number | null };
type PlaceRef = { id: number; warehouseId: number };
const ZERO = new Prisma.Decimal(0);
// Un traslado en preparación todavía no sacó nada del origen; solo lo despachado está en tránsito.
const OPEN_TRANSFER = ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'INCIDENT'];

const stockInclude = {
  product: { select: { id: true, name: true, sku: true, purchaseUnit: { select: { id: true, name: true } } } },
  location: { include: { warehouse: { include: { branch: { select: { id: true, name: true } } } } } },
} satisfies Prisma.InventoryStockInclude;

const locationSelect = { id: true, code: true, aisle: true, rack: true, level: true, position: true, warehouse: { select: { id: true, name: true, branch: { select: { id: true, name: true } } } } } satisfies Prisma.LocationSelect;
const dayStart = (day: string) => new Date(`${day}T00:00:00-06:00`);
const dayAfter = (day: string) => new Date(dayStart(day).getTime() + 86400000);
const dateRange = (from?: string, to?: string) => from || to ? { ...(from ? { gte: dayStart(from) } : {}), ...(to ? { lt: dayAfter(to) } : {}) } : undefined;
const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.add(value), ZERO);

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ---------------------------------------------------------------- consultas

  async map(companyId: number, warehouseId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, branch: { companyId } },
      select: { id: true, name: true, isActive: true, deletedAt: true, branch: { select: { id: true, name: true, isActive: true, deletedAt: true } }, locations: {
        orderBy: { code: 'asc' },
        where: { locationType: 'STORAGE', OR: [{ deletedAt: null }, { stocks: { some: { quantity: { gt: 0 } } } }] },
        select: { id: true, code: true, aisle: true, rack: true, level: true, position: true, capacity: true, isActive: true, deletedAt: true,
          stocks: { where: { quantity: { gt: 0 }, product: { companyId } }, select: { productId: true, quantity: true,
            product: { select: { id: true, name: true, sku: true, purchaseUnit: { select: { id: true, name: true } } } } } },
      } } },
    });
    if (!warehouse) throw new NotFoundException('Almacen no disponible');
    const active = warehouse.isActive && !warehouse.deletedAt && warehouse.branch.isActive && !warehouse.branch.deletedAt;
    return { ...warehouse, locations: warehouse.locations.map(location => ({ ...location, ...locationMapState(location, active) })) };
  }

  private where(companyId: number, q: InventoryQueryDto): Prisma.InventoryStockWhereInput {
    return { product: { companyId, ...(q.search?.trim() ? { OR: [{ name: { contains: q.search.trim(), mode: 'insensitive' } }, { sku: { contains: q.search.trim(), mode: 'insensitive' } }] } : {}) },
      location: { warehouse: { branch: { companyId, ...(q.branchId ? { id: q.branchId } : {}) } }, ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}) },
      ...(q.productId ? { productId: q.productId } : {}), ...(q.locationId ? { locationId: q.locationId } : {}) };
  }

  async stocks(companyId: number, q: InventoryQueryDto) {
    const where = this.where(companyId, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryStock.findMany({ where, include: stockInclude, orderBy: [{ product: { name: 'asc' } }, { location: { warehouse: { name: 'asc' } } }, { location: { code: 'asc' } }, { id: 'asc' }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.inventoryStock.count({ where }),
    ]);
    return { items, total, page: q.page, totalPages: Math.ceil(total / q.limit) };
  }

  /** Almacenes de la empresa dentro del contexto elegido; los movimientos guardan el almacén, no la sucursal. */
  private async warehouseScope(companyId: number, branchId?: number, warehouseId?: number) {
    if (!branchId && !warehouseId) return undefined;
    const rows = await this.prisma.warehouse.findMany({ where: { branch: { companyId, ...(branchId ? { id: branchId } : {}) }, ...(warehouseId ? { id: warehouseId } : {}) }, select: { id: true } });
    return rows.map(row => row.id);
  }

  private async movementWhere(companyId: number, q: { search?: string; branchId?: number; warehouseId?: number; productId?: number; locationId?: number; lotId?: number; type?: string; dateFrom?: string; dateTo?: string }): Promise<Prisma.InventoryMovementWhereInput> {
    if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
    const warehouses = await this.warehouseScope(companyId, q.branchId, q.warehouseId);
    const search = q.search?.trim();
    return {
      product: { companyId, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } : {}) },
      ...(warehouses ? { warehouseId: { in: warehouses } } : {}),
      ...(q.productId ? { productId: q.productId } : {}), ...(q.locationId ? { locationId: q.locationId } : {}), ...(q.lotId ? { lotId: q.lotId } : {}),
      ...(q.type ? { movementType: q.type } : {}),
      ...(dateRange(q.dateFrom, q.dateTo) ? { movementDate: dateRange(q.dateFrom, q.dateTo) } : {}),
    };
  }

  private movementInclude = {
    product: { select: { id: true, name: true, sku: true, internalCode: true } },
    lot: { select: { id: true, lotCode: true, unitCost: true, purchaseItem: { select: { unitCost: true, lineTotal: true, quantity: true, unit: { select: { id: true, name: true } },
      purchase: { select: { id: true, documentNumber: true, purchaseDate: true, currency: true } },
      retaceoDetails: { where: { retaceo: { status: 'closed', deletedAt: null } }, select: { unitCost: true, totalCost: true, retaceo: { select: { id: true, code: true } } }, take: 1, orderBy: { id: 'desc' as const } } } } } },
    location: { select: locationSelect },
    user: { select: { username: true } },
  } satisfies Prisma.InventoryMovementInclude;

  async movements(companyId: number, q: InventoryQueryDto) {
    const where = await this.movementWhere(companyId, q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({ where, include: this.movementInclude, orderBy: { id: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return { items: rows.map(row => ({ ...row, quantity: row.quantityIn.sub(row.quantityOut), costReference: this.costReference(row.lot) })), total, page: q.page, totalPages: Math.ceil(total / q.limit) };
  }

  /** Costo de compra frente al costo final del retaceo; el lote conserva el costo con el que quedó valorizado. */
  private costReference(lot: { unitCost: Prisma.Decimal; purchaseItem: { unitCost: Prisma.Decimal; lineTotal: Prisma.Decimal; purchase: { purchaseDate: Date; currency: string }; retaceoDetails: { unitCost: Prisma.Decimal; totalCost: Prisma.Decimal; retaceo: { id: number; code: string } }[] } | null } | null) {
    const receipt = lot?.purchaseItem;
    if (!lot || !receipt) return null;
    const cost = receipt.retaceoDetails[0];
    return { unitCost: receipt.unitCost, realUnitCost: cost?.unitCost ?? null, valuationUnitCost: cost?.unitCost ?? receipt.unitCost,
      valuationTotal: cost?.totalCost ?? receipt.lineTotal, source: cost ? 'retaceo' : 'purchase', retaceo: cost?.retaceo ?? null,
      currency: receipt.purchase.currency, receiptDate: receipt.purchase.purchaseDate };
  }

  /** Datos que el art. 142-A pide por operación: documento que la respalda y proveedor con su país. */
  private kardexInclude = {
    product: { select: { id: true, name: true, sku: true, internalCode: true } },
    lot: { select: { id: true, lotCode: true, purchaseItem: { select: { purchase: { select: { id: true, documentNumber: true, supplierInvoiceNumber: true, supplierInvoiceDate: true, currency: true,
      supplier: { select: { id: true, code: true, name: true, country: { select: { name: true } } } } } } } } } },
    location: { select: locationSelect },
    user: { select: { username: true } },
  } satisfies Prisma.InventoryMovementInclude;

  /** Documentos que genera el proceso de compra hasta la recepción: solicitudes, cotización, orden, recepción y retaceo. */
  private async purchaseProcesses(purchaseIds: number[]) {
    const map = new Map<number, { requests: { id: number; code: string }[]; consolidation: { id: number; code: string } | null; quotation: { id: number; code: string } | null; order: { id: number; code: string } | null; receipt: { id: number; code: string }; retaceos: { id: number; code: string; status: string }[] }>();
    if (!purchaseIds.length) return map;
    const purchases = await this.prisma.purchase.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, documentNumber: true,
      retaceos: { where: { deletedAt: null, status: { not: 'cancelled' } }, select: { id: true, code: true, status: true }, orderBy: { id: 'asc' } },
      purchaseOrder: { select: { id: true, code: true,
        quotation: { select: { id: true, code: true, requestLinks: { select: { request: { select: { id: true, code: true } } } } } },
        consolidation: { select: { id: true, code: true, lines: { select: { sources: { select: { requestDetail: { select: { request: { select: { id: true, code: true } } } } } } } } } } } } } });
    for (const purchase of purchases) {
      const requests = new Map<number, { id: number; code: string }>();
      for (const link of purchase.purchaseOrder?.quotation?.requestLinks ?? []) requests.set(link.request.id, link.request);
      for (const line of purchase.purchaseOrder?.consolidation?.lines ?? []) for (const source of line.sources) requests.set(source.requestDetail.request.id, source.requestDetail.request);
      const order = purchase.purchaseOrder;
      map.set(purchase.id, { requests: [...requests.values()].sort((a, b) => a.code.localeCompare(b.code)),
        consolidation: order?.consolidation ? { id: order.consolidation.id, code: order.consolidation.code } : null,
        quotation: order?.quotation ? { id: order.quotation.id, code: order.quotation.code } : null,
        order: order ? { id: order.id, code: order.code } : null, receipt: { id: purchase.id, code: purchase.documentNumber }, retaceos: purchase.retaceos });
    }
    return map;
  }

  /**
   * Registro de control de inventarios (Código Tributario, art. 142-A) de un producto: se construye siempre desde los
   * movimientos, con unidades y costo de entradas, salidas y saldo. Sin filtro de almacén es el consolidado de la empresa y
   * deja fuera los traslados internos (no son entradas ni salidas de la empresa); al filtrar por sucursal o almacén se muestran.
   */
  async kardex(companyId: number, q: KardexQueryDto) {
    const [product, company] = await Promise.all([
      this.prisma.product.findFirst({ where: { id: q.productId, companyId }, select: { id: true, name: true, sku: true, internalCode: true, description: true, presentation: true, size: true, dimensions: true, originalCode: true, purchaseUnit: { select: { name: true } },
        category: { select: { name: true } }, subcategory: { select: { name: true } } } }),
      this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, commercialName: true, nit: true, nrc: true } }),
    ]);
    if (!product || !company) throw new NotFoundException('Producto no disponible');
    const scoped = !!(q.branchId || q.warehouseId);
    const base = await this.movementWhere(companyId, q);
    const consolidated = !scoped && !q.type;
    // Lo que ocurre dentro del establecimiento que se reporta no es entrada ni salida suya: en el consolidado, todos los
    // traslados; en una sucursal o almacén, las reubicaciones y los traslados cuyo origen y destino están dentro de él.
    let where: Prisma.InventoryMovementWhereInput = base;
    if (!q.type && !scoped) where = { ...base, movementType: { notIn: ['TRANSFER_OUT', 'TRANSFER_IN'] } };
    if (!q.type && scoped) {
      const inside = (await this.warehouseScope(companyId, q.branchId, q.warehouseId)) ?? [];
      const internal = await this.prisma.transfer.findMany({ where: { fromWarehouseId: { in: inside }, toWarehouseId: { in: inside } }, select: { id: true } });
      where = { ...base, NOT: [{ referenceType: 'relocation' }, ...(internal.length ? [{ referenceType: 'transfer', referenceId: { in: internal.map(transfer => transfer.id) } }] : [])] };
    }
    const [scopeBranch, scopeWarehouse] = await Promise.all([
      q.branchId ? this.prisma.branch.findFirst({ where: { id: q.branchId, companyId }, select: { id: true, name: true } }) : null,
      q.warehouseId ? this.prisma.warehouse.findFirst({ where: { id: q.warehouseId, branch: { companyId } }, select: { id: true, name: true, branch: { select: { id: true, name: true } } } }) : null,
    ]);
    const rangeLow = q.dateFrom ? dayStart(q.dateFrom) : undefined;
    const [qty, outValue, inValue] = rangeLow ? await Promise.all([
      this.prisma.inventoryMovement.aggregate({ where: { ...where, movementDate: { lt: rangeLow } }, _sum: { quantityIn: true, quantityOut: true } }),
      this.prisma.inventoryMovement.aggregate({ where: { ...where, movementDate: { lt: rangeLow }, quantityOut: { gt: 0 } }, _sum: { totalCost: true } }),
      this.prisma.inventoryMovement.aggregate({ where: { ...where, movementDate: { lt: rangeLow }, quantityOut: 0 }, _sum: { totalCost: true } }),
    ]) : [null, null, null];
    const openingQuantity = qty ? (qty._sum.quantityIn ?? ZERO).sub(qty._sum.quantityOut ?? ZERO) : ZERO;
    const openingValue = (inValue?._sum.totalCost ?? ZERO).sub(outValue?._sum.totalCost ?? ZERO);
    const rows = await this.prisma.inventoryMovement.findMany({ where, include: this.kardexInclude, orderBy: [{ movementDate: 'asc' }, { id: 'asc' }] });
    let runningQuantity = openingQuantity, runningValue = openingValue;
    let runningAverage = openingQuantity.gt(0) ? openingValue.div(openingQuantity).toDecimalPlaces(4) : ZERO;
    const all = rows.map((row, index) => {
      // Entradas (y ajustes de costo sin unidades) suman al saldo monetario; las salidas restan.
      const exit = row.quantityOut.gt(0);
      runningQuantity = runningQuantity.add(row.quantityIn).sub(row.quantityOut);
      runningValue = exit ? runningValue.sub(row.totalCost) : runningValue.add(row.totalCost);
      // Costo promedio resultante de la operación; sin existencias conserva el último.
      if (runningQuantity.gt(0)) runningAverage = runningValue.div(runningQuantity).toDecimalPlaces(4);
      const purchase = row.lot?.purchaseItem?.purchase ?? null;
      return { ...row, sequence: index + 1, runningQuantity, runningValue, runningAverage,
        entryCost: exit ? null : row.totalCost, exitCost: exit ? row.totalCost : null,
        costAdjustment: row.quantityIn.isZero() && row.quantityOut.isZero(),
        supportDocument: row.referenceType === 'purchase_detail' && purchase ? { number: purchase.supplierInvoiceNumber ?? purchase.documentNumber, supplierInvoiceNumber: purchase.supplierInvoiceNumber, supplierInvoiceDate: purchase.supplierInvoiceDate, receipt: purchase.documentNumber, receiptId: purchase.id, fiscalDocumentMissing: !purchase.supplierInvoiceNumber?.trim() } : null,
        supplier: row.referenceType === 'purchase_detail' && purchase ? { name: purchase.supplier.name, code: purchase.supplier.code, country: purchase.supplier.country.name } : null };
    });
    const page = all.slice((q.page - 1) * q.limit, q.page * q.limit);
    const process = await this.purchaseProcesses([...new Set(page.flatMap(row => row.supportDocument ? [row.supportDocument.receiptId] : []))]);
    const items = page.map(row => ({ ...row, supportDocument: row.supportDocument ? { ...row.supportDocument, process: process.get(row.supportDocument.receiptId) ?? null } : null }));
    const entries = rows.filter(r => !r.quantityOut.gt(0)), exits = rows.filter(r => r.quantityOut.gt(0));
    // Recepciones del registro que todavía no tienen el documento fiscal del proveedor (no basta el documento interno).
    const missingFiscal = new Set(all.filter(row => row.supportDocument?.fiscalDocumentMissing && row.movementType === 'RECEIPT').map(row => row.supportDocument!.receipt));
    return {
      header: { title: 'Registro de control de inventarios', company, period: { from: q.dateFrom ?? null, to: q.dateTo ?? null }, consolidated, scope: { branch: scopeBranch ?? scopeWarehouse?.branch ?? null, warehouse: scopeWarehouse ? { id: scopeWarehouse.id, name: scopeWarehouse.name } : null }, generatedAt: new Date().toISOString() },
      product: { ...product, descriptionFull: [product.name, product.presentation, product.size, product.dimensions, product.description].filter(Boolean).join(' · ') },
      opening: openingQuantity, openingValue, closing: runningQuantity, closingValue: runningValue, closingAverage: runningAverage,
      missingFiscalDocuments: [...missingFiscal],
      totals: { quantityIn: sum(rows.map(r => r.quantityIn)), quantityOut: sum(rows.map(r => r.quantityOut)), entryCost: sum(entries.map(r => r.totalCost)), exitCost: sum(exits.map(r => r.totalCost)) },
      items, total: all.length, page: q.page, totalPages: Math.max(1, Math.ceil(all.length / q.limit)),
    };
  }

  /** Qué cuenta el Kardex según el alcance elegido; se imprime en las exportaciones. */
  private async scopeText(companyId: number, q: { branchId?: number; warehouseId?: number; lotId?: number; type?: string }) {
    const [branch, warehouse] = await Promise.all([
      q.branchId ? this.prisma.branch.findFirst({ where: { id: q.branchId, companyId }, select: { name: true } }) : null,
      q.warehouseId ? this.prisma.warehouse.findFirst({ where: { id: q.warehouseId, branch: { companyId } }, select: { name: true, branch: { select: { name: true } } } }) : null,
    ]);
    const extras = `${q.lotId ? ' · un lote' : ''}${q.type ? ' · tipo ' + q.type : ''}`;
    if (!q.branchId && !q.warehouseId && !q.type) return 'Consolidado de la empresa; los traslados entre almacenes no se cuentan como entradas ni salidas.';
    if (warehouse) return `Almacén ${warehouse.name} · ${warehouse.branch.name}${extras}; el traslado hacia otro almacén es una salida y el que llega, una entrada.`;
    if (branch) return `Sucursal ${branch.name}${extras}; el traslado hacia otra sucursal es una salida y el que llega, una entrada. Los traslados entre sus propios almacenes no se cuentan.`;
    return `Filtrado${extras}; incluye los traslados entre almacenes.`;
  }

  /** Todos los productos con movimientos o saldo (o el elegido), cada uno con su registro completo: sin paginar. */
  async kardexExport(companyId: number, q: KardexExportQueryDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, commercialName: true, nit: true, nrc: true } });
    if (!company) throw new NotFoundException('Empresa no disponible');
    if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
    const limit = 300;
    let ids: number[];
    if (q.productId) ids = [q.productId];
    else {
      // Un producto puede tener saldo aunque no se haya movido en el período: se consideran sus movimientos hasta la fecha final.
      const where = await this.movementWhere(companyId, { ...q, productId: undefined, lotId: undefined, dateFrom: undefined });
      const moved = await this.prisma.inventoryMovement.groupBy({ by: ['productId'], where });
      ids = (await this.prisma.product.findMany({ where: { id: { in: moved.map(row => row.productId) }, companyId }, select: { id: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })).map(product => product.id);
    }
    const truncated = ids.length > limit;
    const books = [];
    for (const productId of ids.slice(0, limit)) {
      const book = await this.kardex(companyId, { ...q, productId, page: 1, limit: 1_000_000 } as KardexQueryDto);
      if (!q.productId && !book.items.length && book.opening.isZero() && book.closing.isZero()) continue;
      books.push(book);
    }
    return { header: { company, period: { from: q.dateFrom ?? null, to: q.dateTo ?? null }, generatedAt: new Date().toISOString() }, scope: await this.scopeText(companyId, q), truncated, books };
  }

  private async openTransit(db: Tx | PrismaService, lotIds: number[]) {
    if (!lotIds.length) return new Map<number, Prisma.Decimal>();
    const rows = await db.transferItem.findMany({ where: { lotId: { in: lotIds }, transfer: { status: { in: OPEN_TRANSFER }, deletedAt: null } }, select: { lotId: true, quantity: true, receivedQuantity: true } });
    const map = new Map<number, Prisma.Decimal>();
    for (const row of rows) map.set(row.lotId!, (map.get(row.lotId!) ?? ZERO).add(row.quantity.sub(row.receivedQuantity)));
    return map;
  }

  async lots(companyId: number, q: LotQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.InventoryLotWhereInput = {
      product: { companyId }, ...(q.productId ? { productId: q.productId } : {}), ...(q.status ? { status: q.status } : {}),
      ...(search ? { OR: [{ lotCode: { contains: search, mode: 'insensitive' } }, { product: { name: { contains: search, mode: 'insensitive' } } }, { product: { sku: { contains: search, mode: 'insensitive' } } }] } : {}),
      // Un lote de una recepción enviada a la papelera no se muestra.
      AND: [
        { OR: [{ purchaseItemId: null }, { purchaseItem: { purchase: { deletedAt: null } } }] },
        ...(q.warehouseId ? [{ locations: { some: { quantity: { gt: 0 }, location: { warehouseId: q.warehouseId } } } }] : []),
        ...(q.onlyAvailable ? [{ OR: [{ locations: { some: { quantity: { gt: 0 } } } }, { status: 'PENDING_PLACEMENT' }] }] : []),
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryLot.findMany({ where, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.limit, take: q.limit, include: {
        product: { select: { id: true, name: true, sku: true, internalCode: true } },
        purchaseItem: { select: { unit: { select: { name: true } }, purchase: { select: { id: true, documentNumber: true, supplier: { select: { name: true } } } } } },
        locations: { where: { quantity: { gt: 0 } }, select: { quantity: true, location: { select: locationSelect } }, orderBy: { locationId: 'asc' } },
        _count: { select: { labelPrints: true } },
      } }),
      this.prisma.inventoryLot.count({ where }),
    ]);
    const transit = await this.openTransit(this.prisma, rows.map(r => r.id));
    return { items: rows.map(lot => ({ ...lot, onHand: sum(lot.locations.map(l => l.quantity)), inTransit: transit.get(lot.id) ?? ZERO })), total, page: q.page, totalPages: Math.ceil(total / q.limit) };
  }

  /** Trazabilidad completa: compra → retaceo → ubicaciones → traslados → movimientos → etiquetas. */
  async lot(companyId: number, id: number) {
    const lot = await this.prisma.inventoryLot.findFirst({ where: { id, product: { companyId } }, include: {
      product: { select: { id: true, name: true, sku: true, internalCode: true } },
      purchaseItem: { select: { id: true, quantity: true, unitCost: true, unit: { select: { name: true } },
        purchase: { select: { id: true, documentNumber: true, purchaseDate: true, currency: true, supplier: { select: { name: true } }, purchaseOrder: { select: { id: true, code: true } } } },
        retaceoDetails: { where: { retaceo: { status: 'closed', deletedAt: null } }, select: { unitCost: true, totalCost: true, retaceo: { select: { id: true, code: true } } } } } },
      locations: { where: { quantity: { gt: 0 } }, select: { quantity: true, updatedAt: true, location: { select: locationSelect } } },
      transferItems: { select: { id: true, quantity: true, receivedQuantity: true, transfer: { select: { id: true, documentNumber: true, status: true, dispatchedAt: true, receivedAt: true, fromWarehouseId: true, toWarehouseId: true } } }, orderBy: { id: 'asc' } },
      movements: { include: { location: { select: locationSelect }, user: { select: { username: true } } }, orderBy: [{ movementDate: 'asc' }, { id: 'asc' }] },
      labelPrints: { include: { user: { select: { username: true } } }, orderBy: { id: 'desc' } },
    } });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    const warehouses = await this.prisma.warehouse.findMany({ where: { id: { in: [...new Set(lot.transferItems.flatMap(t => [t.transfer.fromWarehouseId, t.transfer.toWarehouseId]))] } }, select: { id: true, name: true } });
    const name = new Map(warehouses.map(w => [w.id, w.name]));
    const transit = await this.openTransit(this.prisma, [lot.id]);
    return { ...lot, onHand: sum(lot.locations.map(l => l.quantity)), inTransit: transit.get(lot.id) ?? ZERO,
      transferItems: lot.transferItems.map(t => ({ ...t, transfer: { ...t.transfer, fromWarehouse: name.get(t.transfer.fromWarehouseId) ?? null, toWarehouse: name.get(t.transfer.toWarehouseId) ?? null } })) };
  }

  async costs(companyId: number, q: InventoryQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.InventoryCostAverageWhereInput = { companyId, ...(q.productId ? { productId: q.productId } : {}),
      ...(search ? { product: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } } : {}) };
    const [items, total, totals] = await this.prisma.$transaction([
      this.prisma.inventoryCostAverage.findMany({ where, include: { product: { select: { id: true, name: true, sku: true, internalCode: true, purchaseUnit: { select: { name: true } } } } }, orderBy: [{ product: { name: 'asc' } }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.inventoryCostAverage.count({ where }),
      this.prisma.inventoryCostAverage.aggregate({ where, _sum: { quantityOnHand: true, inventoryValue: true } }),
    ]);
    return { items, total, page: q.page, totalPages: Math.ceil(total / q.limit), totals: { quantityOnHand: totals._sum.quantityOnHand ?? ZERO, inventoryValue: totals._sum.inventoryValue ?? ZERO } };
  }

  /** RN-INV-018: saldos por ubicación, por lote, valoración y tránsito deben coincidir. */
  async reconcile(companyId: number) {
    const [stocks, details, averages, transit] = await Promise.all([
      this.prisma.inventoryStock.groupBy({ by: ['productId'], where: { product: { companyId } }, _sum: { quantity: true } }),
      this.prisma.inventoryLocationDetail.findMany({ where: { lot: { product: { companyId } } }, select: { quantity: true, lot: { select: { productId: true } }, lotId: true, locationId: true } }),
      this.prisma.inventoryCostAverage.findMany({ where: { companyId } }),
      this.prisma.transferItem.findMany({ where: { transfer: { companyId, status: { in: OPEN_TRANSFER }, deletedAt: null } }, select: { productId: true, quantity: true, receivedQuantity: true } }),
    ]);
    const byProduct = <T,>(rows: T[], key: (row: T) => number, value: (row: T) => Prisma.Decimal) => { const m = new Map<number, Prisma.Decimal>(); for (const row of rows) m.set(key(row), (m.get(key(row)) ?? ZERO).add(value(row))); return m; };
    const stock = new Map(stocks.map(s => [s.productId, s._sum.quantity ?? ZERO]));
    const lotted = byProduct(details, d => d.lot.productId, d => d.quantity);
    const moving = byProduct(transit, t => t.productId, t => t.quantity.sub(t.receivedQuantity));
    const valued = new Map(averages.map(a => [a.productId, a]));
    const ids = new Set([...stock.keys(), ...lotted.keys(), ...valued.keys(), ...moving.keys()]);
    const issues: { productId: number; stock: Prisma.Decimal; lots: Prisma.Decimal; inTransit: Prisma.Decimal; valued: Prisma.Decimal; problem: string }[] = [];
    for (const productId of ids) {
      const row = { productId, stock: stock.get(productId) ?? ZERO, lots: lotted.get(productId) ?? ZERO, inTransit: moving.get(productId) ?? ZERO, valued: valued.get(productId)?.quantityOnHand ?? ZERO };
      if (!row.stock.eq(row.lots)) issues.push({ ...row, problem: 'Saldo por ubicación distinto de la suma por lote' });
      else if (!row.lots.add(row.inTransit).eq(row.valued)) issues.push({ ...row, problem: 'Existencias (más tránsito) distintas de la cantidad valorizada' });
    }
    for (const a of averages) if (a.quantityOnHand.gt(0) && !a.inventoryValue.sub(a.quantityOnHand.mul(a.averageUnitCost)).abs().lte(Math.max(0.05, a.quantityOnHand.toNumber() * 0.00005)))
      issues.push({ productId: a.productId, stock: stock.get(a.productId) ?? ZERO, lots: lotted.get(a.productId) ?? ZERO, inTransit: moving.get(a.productId) ?? ZERO, valued: a.quantityOnHand, problem: 'Valor distinto de cantidad × costo promedio' });
    // RN-INV-005: un lote no puede tener más unidades ubicadas (o en tránsito) que las que recibió.
    const lotRows = await this.prisma.inventoryLot.findMany({ where: { product: { companyId }, status: { not: 'CANCELLED' } }, select: { id: true, lotCode: true, productId: true, quantityReceived: true, locations: { select: { quantity: true } } } });
    const lotTransit = await this.openTransit(this.prisma, lotRows.map(lot => lot.id));
    for (const lot of lotRows) {
      const located = sum(lot.locations.map(row => row.quantity)), moving = lotTransit.get(lot.id) ?? ZERO;
      if (located.add(moving).gt(lot.quantityReceived)) issues.push({ productId: lot.productId, stock: located, lots: located, inTransit: moving, valued: lot.quantityReceived, problem: `Lote ${lot.lotCode}: hay más unidades ubicadas que recibidas` });
    }
    return { checkedProducts: ids.size, consistent: issues.length === 0, issues };
  }

  async catalogs(companyId: number) {
    const products = await this.prisma.product.findMany({ where: { companyId, isActive: true, deletedAt: null }, select: { id: true, name: true, sku: true, purchaseUnit: { select: { name: true } } }, orderBy: { name: 'asc' } });
    const warehouses = await this.prisma.warehouse.findMany({ where: { isActive: true, deletedAt: null, branch: { companyId, isActive: true, deletedAt: null } }, include: { branch: { select: { id: true, name: true } }, locations: { where: { isActive: true, deletedAt: null, locationType: 'STORAGE' }, select: { id: true, code: true, locationType: true } } }, orderBy: { name: 'asc' } });
    const vehicleLocations = await this.prisma.location.findMany({ where: { locationType: 'VEHICLE', isActive: true, deletedAt: null, warehouse: { branch: { companyId } } }, select: { id: true, code: true, warehouseId: true, vehicle: { select: { plate: true, brand: true, model: true } } }, orderBy: { code: 'asc' } });
    const config = await this.prisma.erpConfiguration.findFirst({ where: { companyId }, include: { generalWarehouse: { include: { branch: true } } } });
    return { products, warehouses, vehicleLocations, generalWarehouse: config?.generalWarehouse ?? null };
  }

  // ---------------------------------------------------------------- etiquetas

  /** RN-INV-016/017: etiqueta con el código interno del producto; cada impresión queda registrada. */
  printLabels(companyId: number, userId: number, lotId: number, dto: LabelPrintDto) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const lot = await tx.inventoryLot.findFirst({ where: { id: lotId, product: { companyId } }, include: { product: { select: { name: true, sku: true, internalCode: true } } } });
      if (!lot) throw new NotFoundException('Lote no encontrado');
      if (lot.status === 'CANCELLED') throw new ConflictException('El lote fue cancelado y ya no admite etiquetas');
      const previous = await tx.inventoryLabelPrint.count({ where: { lotId } });
      const reason = dto.reprintReason?.trim();
      if (previous > 0 && !reason) throw new BadRequestException('Indique el motivo de la reimpresión');
      const print = await tx.inventoryLabelPrint.create({ data: { lotId, userId, quantityPrinted: dto.quantity, reprintReason: previous > 0 ? reason : null } });
      await this.audit.record(tx, { controller: 'inventory', action: previous > 0 ? 'REPRINT_LABELS' : 'PRINT_LABELS', recordId: print.id, modifiedData: { companyId, ...print }, userId });
      return { print, isReprint: previous > 0, label: { barcode: lot.product.internalCode, productName: lot.product.name, sku: lot.product.sku, lotCode: lot.lotCode, receivedAt: lot.receivedAt }, copies: dto.quantity };
    });
  }

  // ---------------------------------------------------------------- escritura

  adjust(companyId: number, userId: number, dto: InventoryAdjustmentDto) {
    return purchaseTransaction(this.prisma, companyId, tx => this.adjustIn(tx, companyId, userId, dto));
  }

  private async place(tx: Tx, companyId: number, locationId: number, requireActive: boolean): Promise<PlaceRef> {
    const location = await tx.location.findFirst({ where: { id: locationId, warehouse: { branch: { companyId } } }, include: { warehouse: { include: { branch: true } } } });
    if (!location) throw new BadRequestException('Producto y ubicacion deben pertenecer a la empresa activa');
    if (requireActive && location.locationType !== 'STORAGE') throw new BadRequestException('Un vehículo solo es ubicación de tránsito; elija un espacio del almacén');
    if (requireActive && (!location.isActive || location.deletedAt || !location.warehouse.isActive || location.warehouse.deletedAt || !location.warehouse.branch.isActive || location.warehouse.branch.deletedAt)) throw new BadRequestException('La ubicacion, el almacen y la sucursal deben estar activos');
    return { id: location.id, warehouseId: location.warehouseId };
  }

  private async costOf(tx: Tx, companyId: number, productId: number): Promise<CostBalance> {
    const row = await tx.inventoryCostAverage.findUnique({ where: { companyId_productId: { companyId, productId } } });
    return { quantity: row?.quantityOnHand ?? ZERO, value: row?.inventoryValue ?? ZERO, average: row?.averageUnitCost ?? ZERO };
  }

  private saveCost(tx: Tx, companyId: number, productId: number, next: CostBalance) {
    const data = { quantityOnHand: next.quantity, inventoryValue: next.value, averageUnitCost: next.average };
    return tx.inventoryCostAverage.upsert({ where: { companyId_productId: { companyId, productId } }, create: { companyId, productId, ...data }, update: data });
  }

  /** Mantiene el saldo por producto y ubicación (consulta rápida) en el mismo paso que el saldo por lote. */
  private async moveStock(tx: Tx, productId: number, lotId: number, locationId: number, delta: Prisma.Decimal) {
    const detail = await tx.inventoryLocationDetail.findUnique({ where: { lotId_locationId: { lotId, locationId } } });
    const lotBalance = (detail?.quantity ?? ZERO).add(delta);
    if (lotBalance.lt(0)) throw new ConflictException('Existencias insuficientes para registrar la salida o revertir la recepcion');
    if (lotBalance.gt('9999999999.99')) throw new BadRequestException('El saldo supera el limite permitido');
    await tx.inventoryLocationDetail.upsert({ where: { lotId_locationId: { lotId, locationId } }, create: { lotId, locationId, quantity: lotBalance }, update: { quantity: lotBalance } });
    const current = await tx.inventoryStock.findUnique({ where: { productId_locationId: { productId, locationId } } });
    const balance = (current?.quantity ?? ZERO).add(delta);
    if (balance.lt(0)) throw new ConflictException('Existencias insuficientes para registrar la salida o revertir la recepcion');
    await tx.inventoryStock.upsert({ where: { productId_locationId: { productId, locationId } }, create: { productId, locationId, quantity: balance }, update: { quantity: balance } });
    return balance;
  }

  private async record(tx: Tx, userId: number, m: { productId: number; lotId: number | null; place: PlaceRef | null; warehouseId: number; type: string; quantityIn?: Prisma.Decimal; quantityOut?: Prisma.Decimal; unitCost: Prisma.Decimal; totalCost?: Prisma.Decimal; key: string; reason: string; reference: Reference; balance: Prisma.Decimal; at?: Date }) {
    const quantity = (m.quantityIn ?? ZERO).add(m.quantityOut ?? ZERO);
    return tx.inventoryMovement.create({ data: {
      productId: m.productId, lotId: m.lotId, warehouseId: m.warehouseId, locationId: m.place?.id ?? null, movementType: m.type, movementDate: m.at ?? new Date(),
      quantityIn: m.quantityIn ?? ZERO, quantityOut: m.quantityOut ?? ZERO, unitCost: m.unitCost, totalCost: m.totalCost ?? quantity.mul(m.unitCost).toDecimalPlaces(2),
      referenceType: m.reference.type, referenceId: m.reference.id ?? null, userId, key: m.key, reason: m.reason, balance: m.balance,
    } });
  }

  private async existing(tx: Tx, key: string) {
    return tx.inventoryMovement.findMany({ where: { OR: [{ key: { equals: key, mode: 'insensitive' } }, { key: { startsWith: `${key}#`, mode: 'insensitive' } }] }, orderBy: { id: 'asc' } });
  }

  private integer(quantity: Prisma.Decimal, allowFraction: boolean) {
    if (!allowFraction && !quantity.isInteger()) throw new BadRequestException('La cantidad de productos debe ser un número entero');
  }

  /**
   * Entrada de compra: la colocación confirmada crea el lote de la recepción y lo coloca en la ubicación.
   * Actualiza saldo por lote/ubicación, movimiento y costo promedio en la transacción de quien llama.
   */
  async registerPendingLot(tx: Tx, data: { purchaseItemId: number }) {
    const existing = await tx.inventoryLot.findFirst({ where: { purchaseItemId: data.purchaseItemId, status: { not: 'CANCELLED' } } });
    if (existing) return existing;
    const item = await tx.purchaseItem.findUniqueOrThrow({ where: { id: data.purchaseItemId }, include: { purchase: true } });
    // Nace con la recepción confirmada: se puede etiquetar y seguir, pero todavía no hay existencias ni valoración.
    return tx.inventoryLot.create({ data: { lotCode: lotCodeForReceipt(item.id), productId: item.productId, purchaseItemId: item.id, receivedAt: item.purchase.purchaseDate, quantityReceived: item.quantity, unitCost: item.unitCost, totalCost: item.quantity.mul(item.unitCost).toDecimalPlaces(2), status: 'PENDING_PLACEMENT' } });
  }

  async receive(tx: Tx, companyId: number, userId: number, data: { purchaseItemId: number; locationId: number; reason: string }) {
    const key = `receipt:${data.purchaseItemId}`;
    const item = await tx.purchaseItem.findUniqueOrThrow({ where: { id: data.purchaseItemId }, include: { purchase: true } });
    const prior = await tx.inventoryLot.findFirst({ where: { purchaseItemId: item.id, status: { not: 'CANCELLED' } } });
    if (prior && prior.status !== 'PENDING_PLACEMENT') {
      const moved = await tx.inventoryMovement.findUnique({ where: { key } });
      if (moved?.locationId === data.locationId) return { lot: prior, movement: moved };
      throw new ConflictException('La referencia ya fue usada para otro movimiento');
    }
    const quantity = item.quantity;
    this.integer(quantity, false);
    const product = await tx.product.findFirst({ where: { id: item.productId, companyId, isActive: true, deletedAt: null } });
    if (!product) throw new BadRequestException('Producto y ubicacion deben pertenecer a la empresa activa');
    const place = await this.place(tx, companyId, data.locationId, true);
    const retaceo = await tx.retaceoDetail.findFirst({ where: { purchaseItemId: item.id, retaceo: { status: 'closed', deletedAt: null } }, orderBy: { id: 'desc' } });
    const unitCost = retaceo?.unitCost ?? item.unitCost;
    const costed = { unitCost, totalCost: quantity.mul(unitCost).toDecimalPlaces(2) };
    // La colocación confirmada activa el lote que ya se creó con la recepción (o lo crea si la recepción es anterior).
    const lot = prior
      ? await tx.inventoryLot.update({ where: { id: prior.id }, data: { status: 'ACTIVE', quantityReceived: quantity, receivedAt: item.purchase.purchaseDate, ...costed } })
      : await tx.inventoryLot.create({ data: { lotCode: lotCodeForReceipt(item.id), productId: item.productId, purchaseItemId: item.id, receivedAt: item.purchase.purchaseDate, quantityReceived: quantity, ...costed } });
    const balance = await this.moveStock(tx, item.productId, lot.id, place.id, quantity);
    const cost = applyEntry(await this.costOf(tx, companyId, item.productId), quantity, unitCost);
    await this.saveCost(tx, companyId, item.productId, cost);
    const movement = await this.record(tx, userId, { productId: item.productId, lotId: lot.id, place, warehouseId: place.warehouseId, type: 'RECEIPT', quantityIn: quantity, unitCost, key, reason: data.reason, reference: { type: 'purchase_detail', id: item.id }, balance });
    await this.audit.record(tx, { controller: 'inventory', action: 'RECEIPT', recordId: movement.id, originalData: { companyId, quantity: balance.sub(quantity) }, modifiedData: { companyId, lot: lot.lotCode, ...movement }, userId });
    return { lot, movement };
  }

  /** Distribución FIFO de una cantidad entre los lotes que hay en una ubicación (sin modificar nada). */
  async allocate(tx: Tx, productId: number, locationId: number, quantity: Prisma.Decimal.Value, lotId?: number): Promise<LotSlice[]> {
    const rows = await tx.inventoryLocationDetail.findMany({ where: { locationId, quantity: { gt: 0 }, lot: { productId, status: { not: 'CANCELLED' } } }, select: { lotId: true, locationId: true, quantity: true, lot: { select: { receivedAt: true } } } });
    return allocateFifo(rows.map(row => ({ lotId: row.lotId, locationId: row.locationId, available: row.quantity, receivedAt: row.lot.receivedAt })), quantity, lotId);
  }

  /**
   * Salida de una ubicación, lote por lote. Las ventas, los ajustes y las reversiones reducen existencias y valor
   * (al costo promedio); un traslado mueve existencias sin tocar la valoración global.
   */
  async take(tx: Tx, companyId: number, userId: number, data: { productId: number; locationId: number; quantity: Prisma.Decimal.Value; key: string; type: 'SALE' | 'ADJUSTMENT' | 'REVERSAL'; reason: string; reference: Reference; lotId?: number }) {
    const quantity = new Prisma.Decimal(data.quantity);
    if (quantity.lte(0)) throw new BadRequestException('La cantidad debe ser mayor que cero');
    this.integer(quantity, data.type === 'REVERSAL');
    const prior = await this.existing(tx, data.key);
    if (prior.length) {
      if (prior.some(m => m.locationId !== data.locationId || m.productId !== data.productId || m.reason !== data.reason) || !sum(prior.map(m => m.quantityOut)).eq(quantity)) throw new ConflictException('La referencia ya fue usada para otro movimiento');
      return prior;
    }
    const product = await tx.product.findFirst({ where: { id: data.productId, companyId, ...(data.type !== 'REVERSAL' ? { isActive: true, deletedAt: null } : {}) } });
    if (!product) throw new BadRequestException('Producto y ubicacion deben pertenecer a la empresa activa');
    const place = await this.place(tx, companyId, data.locationId, data.type !== 'REVERSAL');
    const slices = await this.allocate(tx, data.productId, data.locationId, quantity, data.lotId);
    let cost = await this.costOf(tx, companyId, data.productId);
    const unitCost = cost.average;
    const movements = [];
    for (const slice of slices) {
      const balance = await this.moveStock(tx, data.productId, slice.lotId, place.id, slice.quantity.negated());
      movements.push(await this.record(tx, userId, { productId: data.productId, lotId: slice.lotId, place, warehouseId: place.warehouseId, type: data.type, quantityOut: slice.quantity, unitCost, key: slices.length > 1 ? `${data.key}#${slice.lotId}` : data.key, reason: data.reason, reference: data.reference, balance }));
    }
    cost = applyExit(cost, quantity);
    await this.saveCost(tx, companyId, data.productId, cost);
    for (const movement of movements) await this.audit.record(tx, { controller: 'inventory', action: data.type, recordId: movement.id, originalData: { companyId }, modifiedData: { companyId, ...movement }, userId });
    return movements;
  }

  /** Traslado, despacho: el lote sale de la ubicación de origen; permanece valorizado mientras viaja. */
  async dispatchOut(tx: Tx, companyId: number, userId: number, data: { lotId: number; productId: number; locationId: number; quantity: Prisma.Decimal; key: string; reason: string; transferId: number }) {
    const prior = await tx.inventoryMovement.findUnique({ where: { key: data.key } });
    if (prior) return prior;
    const place = await this.place(tx, companyId, data.locationId, true);
    const balance = await this.moveStock(tx, data.productId, data.lotId, place.id, data.quantity.negated());
    const cost = await this.costOf(tx, companyId, data.productId);
    const movement = await this.record(tx, userId, { productId: data.productId, lotId: data.lotId, place, warehouseId: place.warehouseId, type: 'TRANSFER_OUT', quantityOut: data.quantity, unitCost: cost.average, key: data.key, reason: data.reason, reference: { type: 'transfer', id: data.transferId }, balance });
    await this.audit.record(tx, { controller: 'inventory', action: 'TRANSFER_OUT', recordId: movement.id, originalData: { companyId }, modifiedData: { companyId, ...movement }, userId });
    return movement;
  }

  /** Traslado, recepción: la cantidad llega al destino conservando lote y costo; no cambia la valoración global. */
  async receiveIn(tx: Tx, companyId: number, userId: number, data: { lotId: number; productId: number; locationId: number; quantity: Prisma.Decimal; key: string; reason: string; transferId: number }) {
    const prior = await tx.inventoryMovement.findUnique({ where: { key: data.key } });
    if (prior) return prior;
    this.integer(data.quantity, false);
    const place = await this.place(tx, companyId, data.locationId, true);
    const lot = await tx.inventoryLot.findFirst({ where: { id: data.lotId, productId: data.productId, status: { not: 'CANCELLED' } } });
    if (!lot) throw new ConflictException('El lote del traslado ya no está disponible');
    const balance = await this.moveStock(tx, data.productId, data.lotId, place.id, data.quantity);
    const cost = await this.costOf(tx, companyId, data.productId);
    const movement = await this.record(tx, userId, { productId: data.productId, lotId: data.lotId, place, warehouseId: place.warehouseId, type: 'TRANSFER_IN', quantityIn: data.quantity, unitCost: cost.average, key: data.key, reason: data.reason, reference: { type: 'transfer', id: data.transferId }, balance });
    await this.audit.record(tx, { controller: 'inventory', action: 'TRANSFER_IN', recordId: movement.id, originalData: { companyId }, modifiedData: { companyId, ...movement }, userId });
    return movement;
  }

  /** Reversión de una recepción cancelada: la salida usa el mismo lote y lo deja cancelado. */
  async reverseReceipt(tx: Tx, companyId: number, userId: number, data: { purchaseItemId: number; locationId: number | null; reason: string }) {
    const item = await tx.purchaseItem.findUniqueOrThrow({ where: { id: data.purchaseItemId } });
    const lot = await tx.inventoryLot.findFirst({ where: { purchaseItemId: item.id, status: { not: 'CANCELLED' } } });
    if (!lot) return null;
    if (lot.status === 'PENDING_PLACEMENT') {
      // Nunca tuvo existencias: no hay movimiento que revertir, solo se anula el lote y su etiqueta deja de ser válida.
      await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: 'CANCELLED' } });
      await this.audit.record(tx, { controller: 'inventory', action: 'CANCEL_LOT', recordId: lot.id, originalData: { companyId, status: lot.status }, modifiedData: { companyId, status: 'CANCELLED', reason: data.reason }, userId });
      return [];
    }
    if (data.locationId === null) throw new ConflictException('La recepción ya tiene existencias y requiere su ubicación para revertirse');
    const movements = await this.take(tx, companyId, userId, { productId: item.productId, locationId: data.locationId, quantity: item.quantity, lotId: lot.id, type: 'REVERSAL', key: `reversal:${item.id}`, reason: data.reason, reference: { type: 'purchase_detail', id: item.id } })
      .catch(error => { if (error instanceof ConflictException) throw new ConflictException('Existencias insuficientes para registrar la salida o revertir la recepcion'); throw error; });
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: 'CANCELLED' } });
    return movements;
  }

  /** Al cerrarse el retaceo, el costo final reemplaza al provisional solo en las unidades que siguen en existencia. */
  async revalueReceipt(tx: Tx, companyId: number, userId: number, data: { purchaseItemId: number; unitCost: Prisma.Decimal; retaceoId: number }) {
    const lot = await tx.inventoryLot.findFirst({ where: { purchaseItemId: data.purchaseItemId, status: { not: 'CANCELLED' } }, include: { purchaseItem: { include: { purchase: { select: { warehouseId: true } } } } } });
    if (!lot || lot.unitCost.eq(data.unitCost)) return null;
    const key = `revalue:${lot.id}:${data.retaceoId}`;
    if (await tx.inventoryMovement.findUnique({ where: { key } })) return null;
    const placed = await tx.inventoryLocationDetail.findMany({ where: { lotId: lot.id, quantity: { gt: 0 } }, include: { location: { select: { warehouseId: true } } } });
    const moving = (await this.openTransit(tx, [lot.id])).get(lot.id) ?? ZERO;
    const onHand = sum(placed.map(row => row.quantity)).add(moving);
    const delta = onHand.mul(data.unitCost.sub(lot.unitCost)).toDecimalPlaces(2);
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { unitCost: data.unitCost, totalCost: lot.quantityReceived.mul(data.unitCost).toDecimalPlaces(2) } });
    if (onHand.lte(0) || delta.isZero()) return null;
    const next = applyRevaluation(await this.costOf(tx, companyId, lot.productId), delta);
    await this.saveCost(tx, companyId, lot.productId, next);
    const warehouseId = placed[0]?.location.warehouseId ?? lot.purchaseItem?.purchase.warehouseId;
    if (!warehouseId) return null;
    const movement = await this.record(tx, userId, { productId: lot.productId, lotId: lot.id, place: placed[0] ? { id: placed[0].locationId, warehouseId } : null, warehouseId, type: 'ADJUSTMENT', unitCost: data.unitCost, totalCost: delta, key, reason: `Costo final del retaceo (${lot.unitCost.toFixed(4)} → ${data.unitCost.toFixed(4)})`, reference: { type: 'retaceo', id: data.retaceoId }, balance: next.quantity });
    await this.audit.record(tx, { controller: 'inventory', action: 'REVALUE', recordId: movement.id, originalData: { companyId, unitCost: lot.unitCost }, modifiedData: { companyId, ...movement }, userId });
    return movement;
  }

  /** RN-INV-009: mover entre ubicaciones del mismo almacén cambia dónde está el lote, no cuánto hay ni cuánto vale. */
  relocate(companyId: number, userId: number, dto: RelocationDto) {
    return purchaseTransaction(this.prisma, companyId, tx => this.relocateIn(tx, companyId, userId, dto));
  }

  /**
   * Saldo inicial: las existencias con las que un producto empieza en el sistema, con su costo unitario. Es lo primero que
   * aparece en su Kardex, así que solo se registra antes de cualquier otro movimiento; después se corrige con un ajuste.
   */
  registerOpeningBalance(companyId: number, userId: number, dto: OpeningBalanceDto) {
    return purchaseTransaction(this.prisma, companyId, tx => this.openingIn(tx, companyId, userId, dto));
  }

  private async openingIn(tx: Tx, companyId: number, userId: number, dto: OpeningBalanceDto) {
    const key = `opening:${companyId}:${dto.requestId.toLowerCase()}`;
    const quantity = new Prisma.Decimal(dto.quantity), unitCost = new Prisma.Decimal(dto.unitCost);
    this.integer(quantity, false);
    const prior = await tx.inventoryMovement.findUnique({ where: { key } });
    if (prior) {
      if (prior.productId !== dto.productId || prior.locationId !== dto.locationId || !prior.quantityIn.eq(quantity) || !prior.unitCost.eq(unitCost)) throw new ConflictException('La referencia ya fue usada para otro movimiento');
      return prior;
    }
    const product = await tx.product.findFirst({ where: { id: dto.productId, companyId, isActive: true, deletedAt: null } });
    if (!product) throw new BadRequestException('Producto y ubicacion deben pertenecer a la empresa activa');
    if (await tx.inventoryMovement.count({ where: { productId: product.id, movementType: { not: 'OPENING' } } })) throw new ConflictException('El producto ya tiene movimientos; el saldo inicial solo se registra antes de operar. Use un ajuste para corregir existencias.');
    const place = await this.place(tx, companyId, dto.locationId, true);
    await this.assertFits(tx, place.id, product.id, quantity);
    const created = await tx.inventoryLot.create({ data: { lotCode: `TMP-${key}`.slice(0, 60), productId: product.id, receivedAt: new Date(), quantityReceived: quantity, unitCost, totalCost: quantity.mul(unitCost).toDecimalPlaces(2) } });
    const lot = await tx.inventoryLot.update({ where: { id: created.id }, data: { lotCode: lotCodeForOpening(created.id) } });
    const balance = await this.moveStock(tx, product.id, lot.id, place.id, quantity);
    await this.saveCost(tx, companyId, product.id, applyEntry(await this.costOf(tx, companyId, product.id), quantity, unitCost));
    const movement = await this.record(tx, userId, { productId: product.id, lotId: lot.id, place, warehouseId: place.warehouseId, type: 'OPENING', quantityIn: quantity, unitCost, key, reason: dto.reason?.trim() || 'Saldo inicial del inventario', reference: { type: 'opening' }, balance });
    await this.audit.record(tx, { controller: 'inventory', action: 'OPENING', recordId: movement.id, originalData: { companyId }, modifiedData: { companyId, lot: lot.lotCode, ...movement }, userId });
    return movement;
  }

  /**
   * RN-INV-012: una devolución solo suma existencias cuando el producto se recibió y se aceptó para reingresar.
   * Vuelve al lote de origen, valorada a su costo, y no puede superar lo que ese lote ya entregó.
   */
  returnToStock(companyId: number, userId: number, dto: ReturnDto) {
    return purchaseTransaction(this.prisma, companyId, tx => this.returnIn(tx, companyId, userId, dto));
  }

  private async returnIn(tx: Tx, companyId: number, userId: number, dto: ReturnDto) {
    const key = `return:${companyId}:${dto.requestId.toLowerCase()}`;
    const quantity = new Prisma.Decimal(dto.quantity);
    this.integer(quantity, false);
    const prior = await tx.inventoryMovement.findUnique({ where: { key } });
    if (prior) {
      if (prior.lotId !== dto.lotId || prior.locationId !== dto.locationId || !prior.quantityIn.eq(quantity) || prior.reason !== dto.reason) throw new ConflictException('La referencia ya fue usada para otro movimiento');
      return prior;
    }
    const lot = await tx.inventoryLot.findFirst({ where: { id: dto.lotId, product: { companyId }, status: { notIn: ['CANCELLED', 'PENDING_PLACEMENT'] } } });
    if (!lot) throw new NotFoundException('Lote no disponible');
    const place = await this.place(tx, companyId, dto.locationId, true);
    const located = sum((await tx.inventoryLocationDetail.findMany({ where: { lotId: lot.id } })).map(row => row.quantity)).add((await this.openTransit(tx, [lot.id])).get(lot.id) ?? ZERO);
    if (located.add(quantity).gt(lot.quantityReceived)) throw new ConflictException(`La devolución supera lo que este lote entregó (${lot.quantityReceived.sub(located).toString()} disponibles para reingresar)`);
    await this.assertFits(tx, place.id, lot.productId, quantity);
    const balance = await this.moveStock(tx, lot.productId, lot.id, place.id, quantity);
    await this.saveCost(tx, companyId, lot.productId, applyEntry(await this.costOf(tx, companyId, lot.productId), quantity, lot.unitCost));
    const movement = await this.record(tx, userId, { productId: lot.productId, lotId: lot.id, place, warehouseId: place.warehouseId, type: 'RETURN', quantityIn: quantity, unitCost: lot.unitCost, key, reason: dto.reason, reference: { type: 'return', id: dto.saleId ?? null }, balance });
    await this.audit.record(tx, { controller: 'inventory', action: 'RETURN', recordId: movement.id, originalData: { companyId, quantity: balance.sub(quantity) }, modifiedData: { companyId, lot: lot.lotCode, ...movement }, userId });
    return movement;
  }

  /** Ubicación de tránsito ligada a un vehículo (se crea el vehículo si la placa es nueva). Nunca recibe mercancía almacenada. */
  createVehicleLocation(companyId: number, userId: number, dto: VehicleLocationDto) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: dto.warehouseId, isActive: true, deletedAt: null, branch: { companyId, isActive: true, deletedAt: null } } });
      if (!warehouse) throw new BadRequestException('Almacén no disponible');
      const plate = dto.plate.trim().toUpperCase();
      const vehicle = await tx.vehicle.findUnique({ where: { plate } }) ?? await tx.vehicle.create({ data: { plate, brand: dto.brand?.trim() || null, model: dto.model?.trim() || null } });
      if (vehicle.deletedAt || !vehicle.isActive) throw new ConflictException('El vehículo está dado de baja');
      const code = `VEH-${plate}`.slice(0, 40);
      const existing = await tx.location.findFirst({ where: { warehouseId: warehouse.id, code } });
      if (existing) return existing;
      const created = await tx.location.create({ data: { warehouseId: warehouse.id, code, aisle: 'VEH', rack: 'VEH', level: '1', position: plate.slice(0, 40), capacity: 0, locationType: 'VEHICLE', vehicleId: vehicle.id, notes: 'Ubicación de tránsito' } });
      await this.audit.record(tx, { controller: 'inventory', action: 'CREATE_VEHICLE_LOCATION', recordId: created.id, modifiedData: { companyId, ...created }, userId });
      return created;
    });
  }

  /** Existencias disponibles para vender en una sucursal (lo que está en sus ubicaciones; lo que va en tránsito no cuenta). */
  async availability(companyId: number, branchId: number, productIds?: number[]) {
    const rows = await this.prisma.inventoryStock.groupBy({ by: ['productId'], where: { quantity: { gt: 0 }, product: { companyId, ...(productIds?.length ? { id: { in: productIds } } : {}) }, location: { locationType: 'STORAGE', warehouse: { branchId, branch: { companyId } } } }, _sum: { quantity: true } });
    return rows.map(row => ({ productId: row.productId, available: row._sum.quantity ?? ZERO }));
  }

  /**
   * 6.9.14: la venta confirmada y entregada descuenta de las ubicaciones de la sucursal que entrega, lote por lote.
   * Todo ocurre en la transacción de quien llama; si una línea no alcanza, no se descuenta nada.
   */
  deliverSale(companyId: number, userId: number, dto: SaleDeliveryDto) {
    return purchaseTransaction(this.prisma, companyId, tx => this.deliverIn(tx, companyId, userId, dto));
  }

  private async deliverIn(tx: Tx, companyId: number, userId: number, dto: SaleDeliveryDto) {
    const base = `sale:${companyId}:${dto.requestId.toLowerCase()}`;
    const prior = await tx.inventoryMovement.findMany({ where: { key: { startsWith: `${base}:`, mode: 'insensitive' } }, orderBy: { id: 'asc' } });
    if (prior.length) {
      const sameLines = dto.lines.every(line => sum(prior.filter(m => m.productId === line.productId).map(m => m.quantityOut)).eq(line.quantity)) && prior.every(m => dto.lines.some(line => line.productId === m.productId));
      if (!sameLines || prior[0]!.reason !== dto.reason) throw new ConflictException('La referencia ya fue usada para otra entrega');
      return prior;
    }
    const branch = await tx.branch.findFirst({ where: { id: dto.branchId, companyId, isActive: true, deletedAt: null } });
    if (!branch) throw new BadRequestException('La sucursal que entrega no está disponible');
    const movements = [];
    for (const [index, line] of dto.lines.entries()) {
      const quantity = new Prisma.Decimal(line.quantity);
      this.integer(quantity, false);
      const product = await tx.product.findFirst({ where: { id: line.productId, companyId, isActive: true, deletedAt: null } });
      if (!product) throw new BadRequestException('Producto no disponible para la venta');
      const rows = await tx.inventoryLocationDetail.findMany({ where: { quantity: { gt: 0 }, lot: { productId: product.id, status: { not: 'CANCELLED' } }, location: { isActive: true, deletedAt: null, locationType: 'STORAGE', warehouse: { branchId: branch.id, isActive: true, deletedAt: null } } }, select: { lotId: true, locationId: true, quantity: true, lot: { select: { receivedAt: true } }, location: { select: { warehouseId: true } } } });
      const available = sum(rows.map(row => row.quantity));
      if (available.lt(quantity)) throw new ConflictException(`Existencias insuficientes en ${branch.name} para ${product.name}: hay ${available.toString()} y se piden ${quantity.toString()}`);
      const slices = allocateFifo(rows.map(row => ({ lotId: row.lotId, locationId: row.locationId, available: row.quantity, receivedAt: row.lot.receivedAt })), quantity);
      let cost = await this.costOf(tx, companyId, product.id);
      const unitCost = cost.average;
      for (const slice of slices) {
        const place = { id: slice.locationId, warehouseId: rows.find(row => row.locationId === slice.locationId)!.location.warehouseId };
        const balance = await this.moveStock(tx, product.id, slice.lotId, slice.locationId, slice.quantity.negated());
        movements.push(await this.record(tx, userId, { productId: product.id, lotId: slice.lotId, place, warehouseId: place.warehouseId, type: 'SALE', quantityOut: slice.quantity, unitCost, key: `${base}:${index}:${slice.lotId}:${slice.locationId}`, reason: dto.reason, reference: { type: 'sale', id: dto.saleId ?? null }, balance }));
      }
      cost = applyExit(cost, quantity);
      await this.saveCost(tx, companyId, product.id, cost);
    }
    for (const movement of movements) await this.audit.record(tx, { controller: 'inventory', action: 'SALE', recordId: movement.id, originalData: { companyId }, modifiedData: { companyId, ...movement }, userId });
    return movements;
  }

  /** Anular una entrega ya registrada no borra nada: cada salida recibe su movimiento compensatorio en el mismo lote y espacio. */
  reverseSale(companyId: number, userId: number, dto: SaleReversalDto) {
    return purchaseTransaction(this.prisma, companyId, async tx => {
      const originals = await tx.inventoryMovement.findMany({ where: { key: { startsWith: `sale:${companyId}:${dto.requestId.toLowerCase()}:`, mode: 'insensitive' } }, orderBy: { id: 'asc' } });
      if (!originals.length) throw new NotFoundException('No hay una entrega registrada con esa referencia');
      const compensations = [];
      for (const original of originals) {
        const key = `salerev:${original.id}`;
        const done = await tx.inventoryMovement.findUnique({ where: { key } });
        if (done) { compensations.push(done); continue; }
        const place = await this.place(tx, companyId, original.locationId!, false);
        const quantity = original.quantityOut;
        const balance = await this.moveStock(tx, original.productId, original.lotId!, place.id, quantity);
        await this.saveCost(tx, companyId, original.productId, applyEntry(await this.costOf(tx, companyId, original.productId), quantity, original.unitCost));
        const movement = await this.record(tx, userId, { productId: original.productId, lotId: original.lotId, place, warehouseId: place.warehouseId, type: 'REVERSAL', quantityIn: quantity, unitCost: original.unitCost, key, reason: dto.reason, reference: { type: 'sale', id: original.referenceId }, balance });
        await this.audit.record(tx, { controller: 'inventory', action: 'REVERSE_SALE', recordId: movement.id, originalData: { companyId, original: original.id }, modifiedData: { companyId, ...movement }, userId });
        compensations.push(movement);
      }
      return compensations;
    });
  }

  /** El espacio guarda un solo producto y no puede superar su capacidad nominal. */
  private async assertFits(tx: Tx, locationId: number, productId: number, quantity: Prisma.Decimal) {
    const space = await tx.location.findUniqueOrThrow({ where: { id: locationId }, include: { stocks: { where: { quantity: { gt: 0 } } } } });
    if (space.stocks.length && !space.stocks.some(stock => stock.productId === productId)) throw new ConflictException('El espacio de destino guarda otro producto');
    if (sum(space.stocks.map(stock => stock.quantity)).add(quantity).gt(space.capacity)) throw new ConflictException('El espacio de destino no tiene capacidad suficiente');
  }

  private async relocateIn(tx: Tx, companyId: number, userId: number, dto: RelocationDto) {
    const key = `relocate:${companyId}:${dto.requestId.toLowerCase()}`;
    const quantity = new Prisma.Decimal(dto.quantity);
    this.integer(quantity, false);
    const prior = await tx.inventoryMovement.findMany({ where: { key: { startsWith: `${key}:`, mode: 'insensitive' } }, orderBy: { id: 'asc' } });
    if (prior.length) {
      const [out, entry] = prior;
      if (prior.length !== 2 || out!.lotId !== dto.lotId || out!.locationId !== dto.fromLocationId || entry!.locationId !== dto.toLocationId || !out!.quantityOut.eq(quantity) || out!.reason !== dto.reason) throw new ConflictException('La referencia ya fue usada para otro movimiento');
      return { out: out!, in: entry! };
    }
    if (dto.fromLocationId === dto.toLocationId) throw new BadRequestException('El destino debe ser distinto del origen');
    const lot = await tx.inventoryLot.findFirst({ where: { id: dto.lotId, product: { companyId }, status: { not: 'CANCELLED' } } });
    if (!lot) throw new NotFoundException('Lote no disponible');
    const from = await this.place(tx, companyId, dto.fromLocationId, false), to = await this.place(tx, companyId, dto.toLocationId, true);
    if (from.warehouseId !== to.warehouseId) throw new BadRequestException('Solo se mueve entre ubicaciones del mismo almacén; entre almacenes use un traslado');
    await this.assertFits(tx, to.id, lot.productId, quantity);
    const outBalance = await this.moveStock(tx, lot.productId, lot.id, from.id, quantity.negated());
    const inBalance = await this.moveStock(tx, lot.productId, lot.id, to.id, quantity);
    const unitCost = (await this.costOf(tx, companyId, lot.productId)).average;
    const reference = { type: 'relocation' };
    const out = await this.record(tx, userId, { productId: lot.productId, lotId: lot.id, place: from, warehouseId: from.warehouseId, type: 'TRANSFER_OUT', quantityOut: quantity, unitCost, key: `${key}:out`, reason: dto.reason, reference, balance: outBalance });
    const entry = await this.record(tx, userId, { productId: lot.productId, lotId: lot.id, place: to, warehouseId: to.warehouseId, type: 'TRANSFER_IN', quantityIn: quantity, unitCost, key: `${key}:in`, reason: dto.reason, reference, balance: inBalance });
    await this.audit.record(tx, { controller: 'inventory', action: 'RELOCATE', recordId: entry.id, originalData: { companyId, from: from.id }, modifiedData: { companyId, lot: lot.lotCode, from: from.id, to: to.id, quantity: quantity.toString() }, userId });
    return { out, in: entry };
  }

  private async adjustIn(tx: Tx, companyId: number, userId: number, dto: InventoryAdjustmentDto) {
    const key = `adjust:${companyId}:${dto.requestId.toLowerCase()}`;
    const delta = new Prisma.Decimal(dto.quantity);
    this.integer(delta, false);
    if (delta.lt(0)) {
      const rows = await this.take(tx, companyId, userId, { productId: dto.productId, locationId: dto.locationId, quantity: delta.negated(), lotId: dto.lotId, type: 'ADJUSTMENT', key, reason: dto.reason, reference: { type: 'adjustment' } });
      return rows[0]!;
    }
    const prior = await this.existing(tx, key);
    if (prior.length) {
      if (prior[0]!.productId !== dto.productId || prior[0]!.locationId !== dto.locationId || !prior[0]!.quantityIn.eq(delta) || prior[0]!.reason !== dto.reason) throw new ConflictException('La referencia ya fue usada para otro movimiento');
      return prior[0]!;
    }
    const product = await tx.product.findFirst({ where: { id: dto.productId, companyId, isActive: true, deletedAt: null } });
    if (!product) throw new BadRequestException('Producto y ubicacion deben pertenecer a la empresa activa');
    const place = await this.place(tx, companyId, dto.locationId, true);
    const cost = await this.costOf(tx, companyId, dto.productId);
    // Una entrada por ajuste se valora al promedio vigente; sin existencias previas, al costo del catálogo.
    const unitCost = cost.average.gt(0) ? cost.average : product.unitCost;
    let lotId = dto.lotId;
    if (lotId) {
      const lot = await tx.inventoryLot.findFirst({ where: { id: lotId, productId: dto.productId, status: { notIn: ['CANCELLED', 'PENDING_PLACEMENT'] } } });
      if (!lot) throw new BadRequestException('El lote no pertenece al producto, fue cancelado o aún no se ubica');
      const located = sum((await tx.inventoryLocationDetail.findMany({ where: { lotId } })).map(row => row.quantity)).add((await this.openTransit(tx, [lotId])).get(lotId) ?? ZERO);
      if (located.add(delta).gt(lot.quantityReceived)) throw new ConflictException('El ajuste supera la cantidad recibida del lote; deje el lote en blanco para crear un lote de ajuste');
    } else {
      const created = await tx.inventoryLot.create({ data: { lotCode: `TMP-${key}`.slice(0, 60), productId: dto.productId, receivedAt: new Date(), quantityReceived: delta, unitCost, totalCost: delta.mul(unitCost).toDecimalPlaces(2) } });
      lotId = (await tx.inventoryLot.update({ where: { id: created.id }, data: { lotCode: lotCodeForAdjustment(created.id) } })).id;
    }
    const balance = await this.moveStock(tx, dto.productId, lotId, place.id, delta);
    await this.saveCost(tx, companyId, dto.productId, applyEntry(cost, delta, unitCost));
    const movement = await this.record(tx, userId, { productId: dto.productId, lotId, place, warehouseId: place.warehouseId, type: 'ADJUSTMENT', quantityIn: delta, unitCost, key, reason: dto.reason, reference: { type: 'adjustment' }, balance });
    await this.audit.record(tx, { controller: 'inventory', action: 'ADJUSTMENT', recordId: movement.id, originalData: { companyId, quantity: balance.sub(delta) }, modifiedData: { companyId, ...movement }, userId });
    return movement;
  }
}
