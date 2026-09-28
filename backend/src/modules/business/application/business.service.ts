import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../infrastructure/database/prisma/prisma.service";

type DocumentItem = {
  productId: number;
  locationId?: number;
  fromLocationId?: number;
  toLocationId?: number;
  quantity: number;
  unitCost?: number;
  unitPrice?: number;
};

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  customers() {
    return this.prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  suppliers() {
    return this.prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  products() {
    return this.prisma.product.findMany({
      where: { deletedAt: null },
      include: { stocks: { include: { location: { include: { warehouse: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  }

  inventory() {
    return this.prisma.inventoryStock.findMany({
      include: {
        product: true,
        location: { include: { warehouse: { include: { branch: { include: { company: true } } } } } },
      },
      orderBy: [{ product: { name: "asc" } }, { location: { code: "asc" } }],
    });
  }

  purchases() {
    return this.prisma.purchase.findMany({
      include: { supplier: true, branch: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  quotations() {
    return this.prisma.quotation.findMany({
      include: { customer: true, branch: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  sales() {
    return this.prisma.sale.findMany({
      include: { customer: true, branch: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  transfers() {
    return this.prisma.transfer.findMany({
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  vehicles() {
    return this.prisma.vehicle.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  drivers() {
    return this.prisma.driver.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async createCustomer(dto: any, userId?: number) {
    const companyId = await this.legacyCompanyId();
    await this.assertUniqueDocument("customer", dto.document, companyId);
    const data = await this.prisma.customer.create({ data: { ...this.basicPartyData(dto), companyId } });
    await this.audit("customers", "CREATE", data.id, null, data, userId);
    return data;
  }

  async updateCustomer(id: number, dto: any, userId?: number) {
    const current = await this.assertCustomer(id);
    if (dto.document && dto.document !== current.document) await this.assertUniqueDocument("customer", dto.document, current.companyId);
    const data = await this.prisma.customer.update({ where: { id }, data: this.basicPartyData(dto) });
    await this.audit("customers", "UPDATE", id, current, data, userId);
    return data;
  }

  async createSupplier(dto: any, userId?: number) {
    const companyId = await this.legacyCompanyId();
    const code = dto.code ?? dto.document;
    await this.assertSupplierCode(code, companyId);
    const data = await this.prisma.supplier.create({
      data: { companyId, code, name: dto.name, countryId: Number(dto.countryId ?? 1), phone: dto.phone, email: dto.email, address: dto.address, website: dto.website },
    });
    await this.audit("suppliers", "CREATE", data.id, null, data, userId);
    return data;
  }

  async updateSupplier(id: number, dto: any, userId?: number) {
    const current = await this.assertSupplier(id);
    const code = dto.code ?? dto.document;
    if (code && code !== current.code) await this.assertSupplierCode(code, current.companyId);
    const data = await this.prisma.supplier.update({
      where: { id },
      data: { code, name: dto.name, countryId: dto.countryId ? Number(dto.countryId) : undefined, phone: dto.phone, email: dto.email, address: dto.address, website: dto.website },
    });
    await this.audit("suppliers", "UPDATE", id, current, data, userId);
    return data;
  }

  async createProduct(dto: any, userId?: number) {
    const companyId = await this.legacyCompanyId();
    await this.assertProductSku(dto.sku, companyId);
    const [category, subcategory, purchaseUnit, saleUnit] = await Promise.all([
      this.prisma.productCategory.findFirst({ where: { deletedAt: null, isActive: true }, orderBy: { id: "asc" } }),
      this.prisma.productSubcategory.findFirst({ where: { deletedAt: null, isActive: true }, orderBy: { id: "asc" } }),
      this.prisma.productUnit.findFirst({ where: { deletedAt: null, isActive: true, type: "purchase" }, orderBy: { id: "asc" } }),
      this.prisma.productUnit.findFirst({ where: { deletedAt: null, isActive: true, type: "sale" }, orderBy: { id: "asc" } }),
    ]);
    if (!category || !subcategory || !purchaseUnit || !saleUnit) {
      throw new BadRequestException("Debe configurar categorías y unidades antes de registrar productos");
    }
    const data = await this.prisma.product.create({
      data: {
        companyId,
        categoryId: Number(dto.categoryId ?? category.id),
        subcategoryId: Number(dto.subcategoryId ?? subcategory.id),
        purchaseUnitId: Number(dto.purchaseUnitId ?? purchaseUnit.id),
        saleUnitId: Number(dto.saleUnitId ?? saleUnit.id),
        sku: dto.sku,
        internalCode: dto.internalCode ?? dto.sku,
        name: dto.name,
        description: dto.description,
        unitCost: Number(dto.unitCost ?? 0),
        salePrice: Number(dto.salePrice ?? 0),
      },
    });
    await this.audit("products", "CREATE", data.id, null, data, userId);
    return data;
  }

  async updateProduct(id: number, dto: any, userId?: number) {
    const current = await this.assertProduct(id);
    if (dto.sku && dto.sku !== current.sku) await this.assertProductSku(dto.sku, current.companyId);
    const data = await this.prisma.product.update({ where: { id }, data: this.productData(dto) });
    await this.audit("products", "UPDATE", id, current, data, userId);
    return data;
  }

  async setStatus(entity: string, id: number, isActive: boolean, userId?: number) {
    const model = this.model(entity);
    const current = await model.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException("Registro no encontrado");
    const data = await model.update({ where: { id }, data: { isActive } });
    await this.audit(entity, isActive ? "ACTIVATE" : "DEACTIVATE", id, current, data, userId);
    return data;
  }

  async createVehicle(dto: any, userId?: number) {
    const existing = await this.prisma.vehicle.findUnique({ where: { plate: dto.plate } });
    if (existing) throw new ConflictException("La placa ya está registrada");
    const data = await this.prisma.vehicle.create({ data: { plate: dto.plate, brand: dto.brand, model: dto.model, year: dto.year ? Number(dto.year) : undefined } });
    await this.audit("vehicles", "CREATE", data.id, null, data, userId);
    return data;
  }

  async updateVehicle(id: number, dto: any, userId?: number) {
    const current = await this.prisma.vehicle.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException("Vehículo no encontrado");
    const data = await this.prisma.vehicle.update({ where: { id }, data: { plate: dto.plate, brand: dto.brand, model: dto.model, year: dto.year ? Number(dto.year) : undefined } });
    await this.audit("vehicles", "UPDATE", id, current, data, userId);
    return data;
  }

  async createDriver(dto: any, userId?: number) {
    const existing = await this.prisma.driver.findUnique({ where: { license: dto.license } });
    if (existing) throw new ConflictException("La licencia ya está registrada");
    const data = await this.prisma.driver.create({ data: { name: dto.name, license: dto.license, phone: dto.phone } });
    await this.audit("drivers", "CREATE", data.id, null, data, userId);
    return data;
  }

  async updateDriver(id: number, dto: any, userId?: number) {
    const current = await this.prisma.driver.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException("Conductor no encontrado");
    const data = await this.prisma.driver.update({ where: { id }, data: { name: dto.name, license: dto.license, phone: dto.phone } });
    await this.audit("drivers", "UPDATE", id, current, data, userId);
    return data;
  }

  async adjustInventory(dto: any, userId?: number) {
    this.assertPositive(dto.quantity, "La cantidad debe ser mayor o igual a cero");
    const data = await this.prisma.inventoryStock.upsert({
      where: { productId_locationId: { productId: Number(dto.productId), locationId: Number(dto.locationId) } },
      update: { quantity: Number(dto.quantity), minStock: Number(dto.minStock ?? 0) },
      create: { productId: Number(dto.productId), locationId: Number(dto.locationId), quantity: Number(dto.quantity), minStock: Number(dto.minStock ?? 0) },
      include: { product: true, location: true },
    });
    await this.audit("inventory", "ADJUST", data.id, null, data, userId);
    return data;
  }

  async createPurchase(_dto: any, _userId?: number) {
    throw new BadRequestException('Registre la recepcion desde una orden en Gestion de Compras');
  }

  async createQuotation(dto: any, userId?: number) {
    const items = this.normalizeItems(dto.items, "unitPrice", false);
    const total = this.total(items, "unitPrice");
    const data = await this.prisma.quotation.create({
      data: {
        customerId: Number(dto.customerId),
        branchId: Number(dto.branchId),
        documentNumber: dto.documentNumber,
        total,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice!,
            lineTotal: item.quantity * item.unitPrice!,
          })),
        },
      },
      include: { customer: true, branch: true, items: true },
    });
    await this.audit("quotations", "CREATE", data.id, null, data, userId);
    return data;
  }

  async createSale(dto: any, userId?: number) {
    const items = this.normalizeItems(dto.items, "unitPrice", true);
    const total = this.total(items, "unitPrice");
    const data = await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await this.assertStock(tx, item.productId, item.locationId!, item.quantity);
      }
      const sale = await tx.sale.create({
        data: {
          customerId: Number(dto.customerId),
          branchId: Number(dto.branchId),
          documentNumber: dto.documentNumber,
          total,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              locationId: item.locationId!,
              quantity: item.quantity,
              unitPrice: item.unitPrice!,
              lineTotal: item.quantity * item.unitPrice!,
            })),
          },
        },
        include: { customer: true, branch: true, items: true },
      });
      for (const item of items) {
        await this.incrementStock(tx, item.productId, item.locationId!, -item.quantity);
      }
      return sale;
    });
    await this.audit("sales", "CREATE", data.id, null, data, userId);
    return data;
  }

  async createTransfer(dto: any, userId?: number) {
    const items = (dto.items ?? []).map((item: any) => ({
      productId: Number(item.productId),
      fromLocationId: Number(item.fromLocationId),
      toLocationId: Number(item.toLocationId),
      quantity: Number(item.quantity),
    }));
    if (!items.length) throw new BadRequestException("Debe registrar al menos un producto");
    for (const item of items) this.assertPositive(item.quantity, "La cantidad debe ser mayor que cero");

    const data = await this.prisma.$transaction(async (tx) => {
      for (const item of items) await this.assertStock(tx, item.productId, item.fromLocationId, item.quantity);
      const transfer = await tx.transfer.create({
        data: {
          documentNumber: dto.documentNumber,
          fromWarehouseId: Number(dto.fromWarehouseId),
          toWarehouseId: Number(dto.toWarehouseId),
          items: { create: items },
        },
        include: { items: true },
      });
      for (const item of items) {
        await this.incrementStock(tx, item.productId, item.fromLocationId, -item.quantity);
        await this.incrementStock(tx, item.productId, item.toLocationId, item.quantity);
      }
      return transfer;
    });
    await this.audit("transfers", "CREATE", data.id, null, data, userId);
    return data;
  }

  private model(entity: string): any {
    const models: Record<string, any> = {
      customers: this.prisma.customer,
      suppliers: this.prisma.supplier,
      products: this.prisma.product,
      vehicles: this.prisma.vehicle,
      drivers: this.prisma.driver,
    };
    if (!models[entity]) throw new BadRequestException("Entidad inválida");
    return models[entity];
  }

  private basicPartyData(dto: any) {
    return { name: dto.name, document: dto.document || null, phone: dto.phone, email: dto.email, address: dto.address };
  }

  private productData(dto: any): Prisma.ProductUncheckedUpdateInput {
    return {
      sku: dto.sku,
      internalCode: dto.internalCode,
      name: dto.name,
      description: dto.description,
      unitCost: dto.unitCost === undefined ? undefined : Number(dto.unitCost),
      salePrice: dto.salePrice === undefined ? undefined : Number(dto.salePrice),
    };
  }

  private async assertUniqueDocument(type: "customer", document: string | undefined, companyId: number) {
    if (!document) return;
    const existing = await this.prisma.customer.findFirst({ where: { document, companyId } });
    if (existing) throw new ConflictException("El documento ya está registrado");
  }

  private async assertSupplierCode(code: string | undefined, companyId: number) {
    if (!code) throw new BadRequestException("El codigo del proveedor es obligatorio");
    const existing = await this.prisma.supplier.findFirst({ where: { code, companyId } });
    if (existing) throw new ConflictException("El codigo del proveedor ya esta registrado");
  }

  private async assertProductSku(sku: string, companyId: number) {
    const existing = await this.prisma.product.findFirst({ where: { sku, companyId } });
    if (existing) throw new ConflictException("El SKU ya está registrado");
  }

  private async assertCustomer(id: number) {
    const row = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException("Cliente no encontrado");
    return row;
  }

  private async assertSupplier(id: number) {
    const row = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException("Proveedor no encontrado");
    return row;
  }

  private async assertProduct(id: number) {
    const row = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException("Producto no encontrado");
    return row;
  }

  private async legacyCompanyId() {
    const company = await this.prisma.company.findFirst({
      where: { deletedAt: null, isActive: true },
      orderBy: { id: "asc" },
    });
    if (!company) throw new BadRequestException("Debe registrar una empresa activa antes de continuar");
    return company.id;
  }

  private normalizeItems(items: any[], priceKey: "unitCost" | "unitPrice", requireLocation: boolean): DocumentItem[] {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException("Debe registrar al menos un producto");
    }
    return items.map((item) => {
      const normalized: DocumentItem = {
        productId: Number(item.productId),
        locationId: item.locationId ? Number(item.locationId) : undefined,
        quantity: Number(item.quantity),
        [priceKey]: Number(item[priceKey]),
      };
      this.assertPositive(normalized.quantity, "La cantidad debe ser mayor que cero");
      this.assertPositive((normalized as any)[priceKey], "El precio debe ser mayor que cero");
      if (requireLocation && !normalized.locationId) throw new BadRequestException("La ubicación es obligatoria");
      return normalized;
    });
  }

  private total(items: DocumentItem[], priceKey: "unitCost" | "unitPrice") {
    return items.reduce((sum, item) => sum + item.quantity * Number((item as any)[priceKey]), 0);
  }

  private assertPositive(value: number, message: string) {
    if (!Number.isFinite(value) || value <= 0) throw new BadRequestException(message);
  }

  private async assertStock(tx: any, productId: number, locationId: number, quantity: number) {
    const stock = await tx.inventoryStock.findUnique({ where: { productId_locationId: { productId, locationId } } });
    if (!stock || stock.quantity < quantity) throw new BadRequestException("Existencia insuficiente para completar la operación");
  }

  private async incrementStock(tx: any, productId: number, locationId: number, delta: number) {
    await tx.inventoryStock.upsert({
      where: { productId_locationId: { productId, locationId } },
      update: { quantity: { increment: delta } },
      create: { productId, locationId, quantity: delta },
    });
  }

  private async audit(controller: string, action: string, recordId: number, originalData: unknown, modifiedData: unknown, userId?: number) {
    await this.prisma.log.create({
      data: {
        controller,
        action,
        recordId,
        originalData: originalData === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(originalData)) as Prisma.InputJsonValue),
        modifiedData: JSON.parse(JSON.stringify(modifiedData)) as Prisma.InputJsonValue,
        userId,
      },
    });
  }
}
