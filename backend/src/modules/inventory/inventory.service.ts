import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../audit/application/services/audit.service";
import { purchaseTransaction } from "../purchases/application/services/purchase-transaction";
import { InventoryAdjustmentDto, InventoryQueryDto } from "./inventory.dto";
import { locationMapState } from './location-map';

const stockInclude = {
  product: { select: { id: true, name: true, sku: true, purchaseUnit: { select: { id: true, name: true } } } },
  location: { include: { warehouse: { include: { branch: { select: { id: true, name: true } } } } } },
} satisfies Prisma.InventoryStockInclude;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async map(companyId: number, warehouseId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, branch: { companyId } },
      select: { id: true, name: true, isActive: true, deletedAt: true, branch: { select: { id: true, name: true, isActive: true, deletedAt: true } }, locations: {
        orderBy: { code: 'asc' },
        where: { OR: [{ deletedAt: null }, { stocks: { some: { quantity: { gt: 0 } } } }] },
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

  async movements(companyId: number, q: InventoryQueryDto) {
    if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
    const where: Prisma.InventoryMovementWhereInput = { stock: this.where(companyId, q), ...(q.type ? { type: q.type } : {}),
      ...(q.dateFrom || q.dateTo ? { createdAt: {
        ...(q.dateFrom ? { gte: new Date(`${q.dateFrom}T00:00:00-06:00`) } : {}),
        ...(q.dateTo ? { lt: new Date(new Date(`${q.dateTo}T00:00:00-06:00`).getTime() + 86400000) } : {}),
      } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({ where, include: { stock: { include: stockInclude }, user: { select: { username: true } }, purchaseItem: { select: {
        unitCost: true, lineTotal: true, quantity: true, unit: { select: { id: true, name: true } },
        purchase: { select: { id: true, documentNumber: true, purchaseDate: true, currency: true } },
        retaceoDetails: { where: { retaceo: { status: 'closed' } }, select: { unitCost: true, totalCost: true, retaceo: { select: { id: true, code: true } } } },
      } } }, orderBy: { id: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return { items: items.map(item => {
      const receipt = item.purchaseItem;
      const cost = receipt?.retaceoDetails[0];
      return { ...item, costReference: receipt ? {
        unitCost: receipt.unitCost, realUnitCost: cost?.unitCost ?? null,
        valuationUnitCost: cost?.unitCost ?? receipt.unitCost,
        valuationTotal: cost?.totalCost ?? receipt.lineTotal,
        source: cost ? 'retaceo' : 'purchase', retaceo: cost?.retaceo ?? null,
        currency: receipt.purchase.currency, receiptDate: receipt.purchase.purchaseDate,
      } : null };
    }), total, page: q.page, totalPages: Math.ceil(total / q.limit) };
  }

  async catalogs(companyId: number) {
    const products = await this.prisma.product.findMany({ where: { companyId, isActive: true, deletedAt: null }, select: { id: true, name: true, sku: true, purchaseUnit: { select: { name: true } } }, orderBy: { name: 'asc' } });
    const warehouses = await this.prisma.warehouse.findMany({ where: { isActive: true, deletedAt: null, branch: { companyId, isActive: true, deletedAt: null } }, include: { branch: { select: { id: true, name: true } }, locations: { where: { isActive: true, deletedAt: null }, select: { id: true, code: true } } }, orderBy: { name: 'asc' } });
    const config = await this.prisma.erpConfiguration.findFirst({ where: { companyId }, include: { generalWarehouse: { include: { branch: true } } } });
    return { products, warehouses, generalWarehouse: config?.generalWarehouse ?? null };
  }

  adjust(companyId: number, userId: number, dto: InventoryAdjustmentDto) {
    return purchaseTransaction(this.prisma, companyId, tx => this.post(tx, companyId, userId, { ...dto, key: `adjust:${companyId}:${dto.requestId.toLowerCase()}`, type: 'ADJUSTMENT' }));
  }

  // Called inside the same company-locked transaction as receipt/cancellation.
  async post(tx: Prisma.TransactionClient, companyId: number, userId: number, data: { productId: number; locationId: number; quantity: Prisma.Decimal | number; key: string; type: string; reason: string; purchaseItemId?: number }) {
    const delta = new Prisma.Decimal(data.quantity);
    if (data.type !== 'REVERSAL' && !delta.isInteger()) throw new BadRequestException('La cantidad de productos debe ser un número entero');
    const existing = await tx.inventoryMovement.findFirst({ where: { key: { equals: data.key, mode: 'insensitive' } }, include: { stock: true } });
    if (existing) {
      if (existing.stock.productId !== data.productId || existing.stock.locationId !== data.locationId || !existing.quantity.eq(delta) || existing.reason !== data.reason) throw new ConflictException('La referencia ya fue usada para otro movimiento');
      return existing;
    }
    const product = await tx.product.findFirst({ where: { id: data.productId, companyId, ...(data.type !== 'REVERSAL' ? { isActive: true, deletedAt: null } : {}) } });
    const location = await tx.location.findFirst({ where: { id: data.locationId, warehouse: { branch: { companyId } } }, include: { warehouse: { include: { branch: true } } } });
    if (!product || !location) throw new BadRequestException('Producto y ubicacion deben pertenecer a la empresa activa');
    if (data.type !== 'REVERSAL' && (!location.isActive || location.deletedAt || !location.warehouse.isActive || location.warehouse.deletedAt || !location.warehouse.branch.isActive || location.warehouse.branch.deletedAt)) throw new BadRequestException('La ubicacion, el almacen y la sucursal deben estar activos');
    const current = await tx.inventoryStock.findUnique({ where: { productId_locationId: { productId: data.productId, locationId: data.locationId } } });
    const balance = (current?.quantity ?? new Prisma.Decimal(0)).add(delta);
    if (balance.lt(0)) throw new ConflictException('Existencias insuficientes para registrar la salida o revertir la recepcion');
    if (balance.gt('9999999999.99')) throw new BadRequestException('El saldo supera el limite permitido');
    const stock = await tx.inventoryStock.upsert({ where: { productId_locationId: { productId: data.productId, locationId: data.locationId } }, create: { productId: data.productId, locationId: data.locationId, quantity: balance }, update: { quantity: balance } });
    const result = await tx.inventoryMovement.create({ data: { stockId: stock.id, userId, purchaseItemId: data.purchaseItemId, key: data.key, type: data.type, quantity: delta, balance, reason: data.reason } });
    await this.audit.record(tx, { controller: 'inventory', action: data.type, recordId: result.id, originalData: { companyId, quantity: current?.quantity ?? 0 }, modifiedData: { companyId, ...result }, userId });
    return result;
  }
}
