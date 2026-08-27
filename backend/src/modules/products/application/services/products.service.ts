import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CreateProductCategoryDto } from "../dto/create-product-category.dto";
import { CreateProductDto } from "../dto/create-product.dto";
import { CreateProductImageDto } from "../dto/create-product-image.dto";
import { CreateProductSubcategoryDto } from "../dto/create-product-subcategory.dto";
import { CreateProductSupplierDto } from "../dto/create-product-supplier.dto";
import { CreateProductUnitDto } from "../dto/create-product-unit.dto";
import { QueryProductsDto } from "../dto/query-products.dto";
import { UpdateProductCategoryDto } from "../dto/update-product-category.dto";
import { UpdateProductDto } from "../dto/update-product.dto";
import { UpdateProductImageDto } from "../dto/update-product-image.dto";
import { UpdateProductSubcategoryDto } from "../dto/update-product-subcategory.dto";
import { UpdateProductSupplierDto } from "../dto/update-product-supplier.dto";
import { UpdateProductUnitDto } from "../dto/update-product-unit.dto";

const categoryInclude = {
  _count: { select: { subcategories: true, products: true } },
} satisfies Prisma.ProductCategoryInclude;

const subcategoryInclude = {
  category: { select: { id: true, name: true, isActive: true } },
  _count: { select: { products: true } },
} satisfies Prisma.ProductSubcategoryInclude;

const unitInclude = {
  _count: { select: { purchaseProducts: true, saleProducts: true } },
} satisfies Prisma.ProductUnitInclude;

const productInclude = {
  category: { select: { id: true, name: true, isActive: true } },
  subcategory: { select: { id: true, name: true, isActive: true } },
  purchaseUnit: { select: { id: true, name: true, type: true, isActive: true } },
  saleUnit: { select: { id: true, name: true, type: true, isActive: true } },
  images: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
  suppliers: {
    where: { deletedAt: null },
    include: { supplier: { select: { id: true, code: true, name: true, isActive: true } } },
    orderBy: [{ isPreferred: "desc" }, { createdAt: "desc" }],
  },
  _count: { select: { stocks: true, purchaseItems: true, quotationItems: true, saleItems: true, transferItems: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  categories() {
    return this.prisma.productCategory.findMany({
      where: { deletedAt: null },
      include: categoryInclude,
      orderBy: { name: "asc" },
    });
  }

  subcategories(categoryId?: number) {
    return this.prisma.productSubcategory.findMany({
      where: { deletedAt: null, ...(categoryId ? { categoryId } : {}) },
      include: subcategoryInclude,
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    });
  }

  units(type?: "purchase" | "sale") {
    return this.prisma.productUnit.findMany({
      where: { deletedAt: null, ...(type ? { type } : {}) },
      include: unitInclude,
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }

  products(query: QueryProductsDto, companyId: number) {
    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        companyId,
        ...(query.activeOnly ? { isActive: true } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.subcategoryId ? { subcategoryId: query.subcategoryId } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { sku: { contains: query.search, mode: "insensitive" } },
                { internalCode: { contains: query.search, mode: "insensitive" } },
                { originalCode: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  async product(id: number, companyId: number) {
    const product = await this.prisma.product.findFirst({ where: { id, companyId, deletedAt: null }, include: productInclude });
    if (!product) throw new NotFoundException("Producto no encontrado");
    return product;
  }

  async catalogs(companyId: number) {
    const [categories, subcategories, purchaseUnits, saleUnits, suppliers] = await Promise.all([
      this.prisma.productCategory.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" } }),
      this.prisma.productSubcategory.findMany({
        where: { deletedAt: null, isActive: true, category: { isActive: true, deletedAt: null } },
        orderBy: { name: "asc" },
      }),
      this.prisma.productUnit.findMany({ where: { deletedAt: null, isActive: true, type: "purchase" }, orderBy: { name: "asc" } }),
      this.prisma.productUnit.findMany({ where: { deletedAt: null, isActive: true, type: "sale" }, orderBy: { name: "asc" } }),
      this.prisma.supplier.findMany({
        where: { companyId, deletedAt: null, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return { categories, subcategories, purchaseUnits, saleUnits, suppliers };
  }

  async createCategory(dto: CreateProductCategoryDto, userId: number) {
    await this.assertUniqueCategoryName(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.create({
        data: { name: dto.name.trim(), description: this.optionalText(dto.description) },
        include: categoryInclude,
      });
      await this.record(tx, "product_categories", "CREATE", category.id, undefined, category, userId);
      return category;
    });
  }

  async updateCategory(id: number, dto: UpdateProductCategoryDto, userId: number) {
    const current = await this.category(id);
    if (dto.name && dto.name.trim().toLowerCase() !== current.name.toLowerCase()) await this.assertUniqueCategoryName(dto.name, id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {}),
        },
        include: categoryInclude,
      });
      await this.record(tx, "product_categories", "UPDATE", id, current, category, userId);
      return category;
    });
  }

  async updateCategoryStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.category(id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.update({ where: { id }, data: { isActive }, include: categoryInclude });
      await this.record(tx, "product_categories", isActive ? "ACTIVATE" : "DEACTIVATE", id, current, category, userId);
      return category;
    });
  }

  async createSubcategory(dto: CreateProductSubcategoryDto, userId: number) {
    await this.assertCategoryActive(dto.categoryId);
    await this.assertUniqueSubcategoryName(dto.categoryId, dto.name);
    return this.prisma.$transaction(async (tx) => {
      const subcategory = await tx.productSubcategory.create({
        data: { categoryId: dto.categoryId, name: dto.name.trim(), description: this.optionalText(dto.description) },
        include: subcategoryInclude,
      });
      await this.record(tx, "product_subcategories", "CREATE", subcategory.id, undefined, subcategory, userId);
      return subcategory;
    });
  }

  async updateSubcategory(id: number, dto: UpdateProductSubcategoryDto, userId: number) {
    const current = await this.subcategory(id);
    const categoryId = dto.categoryId ?? current.categoryId;
    if (dto.categoryId !== undefined) await this.assertCategoryActive(dto.categoryId);
    if (dto.name && (dto.name.trim().toLowerCase() !== current.name.toLowerCase() || categoryId !== current.categoryId)) {
      await this.assertUniqueSubcategoryName(categoryId, dto.name, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const subcategory = await tx.productSubcategory.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {}),
        },
        include: subcategoryInclude,
      });
      await this.record(tx, "product_subcategories", "UPDATE", id, current, subcategory, userId);
      return subcategory;
    });
  }

  async updateSubcategoryStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.subcategory(id);
    if (isActive) await this.assertCategoryActive(current.categoryId);
    return this.prisma.$transaction(async (tx) => {
      const subcategory = await tx.productSubcategory.update({ where: { id }, data: { isActive }, include: subcategoryInclude });
      await this.record(tx, "product_subcategories", isActive ? "ACTIVATE" : "DEACTIVATE", id, current, subcategory, userId);
      return subcategory;
    });
  }

  async createUnit(dto: CreateProductUnitDto, userId: number) {
    await this.assertUniqueUnitName(dto.name, dto.type);
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.productUnit.create({ data: { name: dto.name.trim(), type: dto.type }, include: unitInclude });
      await this.record(tx, "product_units", "CREATE", unit.id, undefined, unit, userId);
      return unit;
    });
  }

  async updateUnit(id: number, dto: UpdateProductUnitDto, userId: number) {
    const current = await this.unit(id);
    const type = dto.type ?? current.type;
    if (dto.name && (dto.name.trim().toLowerCase() !== current.name.toLowerCase() || type !== current.type)) {
      await this.assertUniqueUnitName(dto.name, type, id);
    }
    if (dto.type && dto.type !== current.type) {
      const used = await this.prisma.product.count({
        where: {
          deletedAt: null,
          OR: [{ purchaseUnitId: id }, { saleUnitId: id }],
        },
      });
      if (used) throw new BadRequestException("No se puede cambiar el tipo de una unidad que ya está asociada a productos");
    }
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.productUnit.update({
        where: { id },
        data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.type !== undefined ? { type: dto.type } : {}) },
        include: unitInclude,
      });
      await this.record(tx, "product_units", "UPDATE", id, current, unit, userId);
      return unit;
    });
  }

  async updateUnitStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.unit(id);
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.productUnit.update({ where: { id }, data: { isActive }, include: unitInclude });
      await this.record(tx, "product_units", isActive ? "ACTIVATE" : "DEACTIVATE", id, current, unit, userId);
      return unit;
    });
  }

  async createProduct(dto: CreateProductDto, userId: number, companyId: number) {
    await this.assertUniqueSku(dto.sku, companyId);
    await this.assertProductRelations(dto.categoryId, dto.subcategoryId, dto.purchaseUnitId, dto.saleUnitId);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: this.productCreateData(dto, companyId, `PENDING-${randomUUID()}`),
      });
      const product = await tx.product.update({
        where: { id: created.id },
        data: { internalCode: await this.nextInternalCode(tx, companyId, created.id) },
        include: productInclude,
      });
      await this.record(tx, "products", "CREATE", product.id, undefined, product, userId);
      return product;
    });
  }

  async updateProduct(id: number, dto: UpdateProductDto, userId: number, companyId: number) {
    const current = await this.product(id, companyId);
    if (dto.sku && dto.sku.trim().toLowerCase() !== current.sku.toLowerCase()) await this.assertUniqueSku(dto.sku, companyId, id);
    await this.assertProductRelations(
      dto.categoryId ?? current.categoryId,
      dto.subcategoryId ?? current.subcategoryId,
      dto.purchaseUnitId ?? current.purchaseUnitId,
      dto.saleUnitId ?? current.saleUnitId,
    );
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({ where: { id }, data: this.productUpdateData(dto), include: productInclude });
      await this.record(tx, "products", "UPDATE", id, current, product, userId);
      return product;
    });
  }

  async updateProductStatus(id: number, isActive: boolean, userId: number, companyId: number) {
    const current = await this.product(id, companyId);
    if (isActive) await this.assertProductRelations(current.categoryId, current.subcategoryId, current.purchaseUnitId, current.saleUnitId);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({ where: { id }, data: { isActive }, include: productInclude });
      await this.record(tx, "products", isActive ? "ACTIVATE" : "DEACTIVATE", id, current, product, userId);
      return product;
    });
  }

  async images(productId: number, companyId: number) {
    await this.product(productId, companyId);
    return this.prisma.productImage.findMany({ where: { productId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async createImage(dto: CreateProductImageDto, userId: number, companyId: number) {
    await this.product(dto.productId, companyId);
    const duplicate = await this.prisma.productImage.findFirst({ where: { productId: dto.productId, path: dto.path.trim(), deletedAt: null } });
    if (duplicate) throw new ConflictException("Esta imagen ya está asociada al producto");
    return this.prisma.$transaction(async (tx) => {
      const image = await tx.productImage.create({ data: { productId: dto.productId, path: dto.path.trim() } });
      await this.record(tx, "product_images", "CREATE", image.id, undefined, image, userId);
      return image;
    });
  }

  async updateImage(id: number, dto: UpdateProductImageDto, userId: number, companyId: number) {
    const current = await this.image(id, companyId);
    const productId = dto.productId ?? current.productId;
    if (dto.productId !== undefined) await this.product(dto.productId, companyId);
    if (dto.path && (dto.path.trim() !== current.path || productId !== current.productId)) {
      const duplicate = await this.prisma.productImage.findFirst({ where: { productId, path: dto.path.trim(), deletedAt: null, id: { not: id } } });
      if (duplicate) throw new ConflictException("Esta imagen ya está asociada al producto");
    }
    return this.prisma.$transaction(async (tx) => {
      const image = await tx.productImage.update({
        where: { id },
        data: { ...(dto.productId !== undefined ? { productId: dto.productId } : {}), ...(dto.path !== undefined ? { path: dto.path.trim() } : {}) },
      });
      await this.record(tx, "product_images", "UPDATE", id, current, image, userId);
      return image;
    });
  }

  async updateImageStatus(id: number, isActive: boolean, userId: number, companyId: number) {
    const current = await this.image(id, companyId);
    return this.prisma.$transaction(async (tx) => {
      const image = await tx.productImage.update({ where: { id }, data: { isActive } });
      await this.record(tx, "product_images", isActive ? "ACTIVATE" : "DEACTIVATE", id, current, image, userId);
      return image;
    });
  }

  async removeImage(id: number, userId: number, companyId: number) {
    const current = await this.image(id, companyId);
    return this.prisma.$transaction(async (tx) => {
      const image = await tx.productImage.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
      await this.record(tx, "product_images", "DELETE", id, current, image, userId);
      return image;
    });
  }

  async supplierLinks(productId: number, companyId: number) {
    await this.product(productId, companyId);
    return this.prisma.productSupplier.findMany({
      where: { productId, deletedAt: null },
      include: { supplier: { select: { id: true, code: true, name: true, isActive: true } } },
      orderBy: [{ isPreferred: "desc" }, { supplier: { name: "asc" } }],
    });
  }

  async createSupplierLink(dto: CreateProductSupplierDto, userId: number, companyId: number) {
    await this.assertProductActive(dto.productId, companyId);
    await this.assertSupplierActive(dto.supplierId, companyId);
    const duplicate = await this.prisma.productSupplier.findFirst({ where: { productId: dto.productId, supplierId: dto.supplierId } });
    if (duplicate) throw new ConflictException("El proveedor ya está asociado a este producto");
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPreferred) await this.clearPreferredSupplier(tx, dto.productId);
      const link = await tx.productSupplier.create({
        data: {
          productId: dto.productId,
          supplierId: dto.supplierId,
          supplierCode: this.optionalText(dto.supplierCode),
          isPreferred: dto.isPreferred ?? false,
        },
        include: { supplier: { select: { id: true, code: true, name: true, isActive: true } } },
      });
      await this.record(tx, "product_suppliers", "CREATE", link.id, undefined, link, userId);
      return link;
    });
  }

  async updateSupplierLink(id: number, dto: UpdateProductSupplierDto, userId: number, companyId: number) {
    const current = await this.supplierLink(id, companyId);
    if (dto.isPreferred) {
      if (!current.isActive) throw new BadRequestException("No se puede priorizar una asociación inactiva");
      await this.assertProductActive(current.productId, companyId);
      await this.assertSupplierActive(current.supplierId, companyId);
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPreferred) await this.clearPreferredSupplier(tx, current.productId, id);
      const link = await tx.productSupplier.update({
        where: { id },
        data: {
          ...(dto.supplierCode !== undefined ? { supplierCode: this.optionalText(dto.supplierCode) } : {}),
          ...(dto.isPreferred !== undefined ? { isPreferred: dto.isPreferred } : {}),
        },
        include: { supplier: { select: { id: true, code: true, name: true, isActive: true } } },
      });
      await this.record(tx, "product_suppliers", "UPDATE", id, current, link, userId);
      return link;
    });
  }

  async updateSupplierLinkStatus(id: number, isActive: boolean, userId: number, companyId: number) {
    const current = await this.supplierLink(id, companyId);
    if (isActive) {
      await this.assertProductActive(current.productId, companyId);
      await this.assertSupplierActive(current.supplierId, companyId);
    }
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.productSupplier.update({
        where: { id },
        data: { isActive, ...(isActive ? {} : { isPreferred: false }) },
        include: { supplier: { select: { id: true, code: true, name: true, isActive: true } } },
      });
      await this.record(tx, "product_suppliers", isActive ? "ACTIVATE" : "DEACTIVATE", id, current, link, userId);
      return link;
    });
  }

  private productCreateData(dto: CreateProductDto, companyId: number, internalCode: string): Prisma.ProductUncheckedCreateInput {
    return {
      companyId,
      categoryId: dto.categoryId,
      subcategoryId: dto.subcategoryId,
      sku: dto.sku.trim(),
      internalCode,
      name: dto.name.trim(),
      originalCode: this.optionalText(dto.originalCode),
      size: this.optionalText(dto.size),
      dimensions: this.optionalText(dto.dimensions),
      description: this.optionalText(dto.description),
      presentation: this.optionalText(dto.presentation),
      purchaseUnitId: dto.purchaseUnitId,
      saleUnitId: dto.saleUnitId,
      unitCost: dto.unitCost ?? 0,
      salePrice: dto.salePrice ?? 0,
    };
  }

  private productUpdateData(dto: UpdateProductDto): Prisma.ProductUncheckedUpdateInput {
    return {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.subcategoryId !== undefined ? { subcategoryId: dto.subcategoryId } : {}),
      ...(dto.sku !== undefined ? { sku: dto.sku.trim() } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.originalCode !== undefined ? { originalCode: this.optionalText(dto.originalCode) } : {}),
      ...(dto.size !== undefined ? { size: this.optionalText(dto.size) } : {}),
      ...(dto.dimensions !== undefined ? { dimensions: this.optionalText(dto.dimensions) } : {}),
      ...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {}),
      ...(dto.presentation !== undefined ? { presentation: this.optionalText(dto.presentation) } : {}),
      ...(dto.purchaseUnitId !== undefined ? { purchaseUnitId: dto.purchaseUnitId } : {}),
      ...(dto.saleUnitId !== undefined ? { saleUnitId: dto.saleUnitId } : {}),
      ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
      ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
    };
  }

  private optionalText(value?: string) {
    return value?.trim() || null;
  }

  private async category(id: number) {
    const category = await this.prisma.productCategory.findFirst({ where: { id, deletedAt: null }, include: categoryInclude });
    if (!category) throw new NotFoundException("Categoría no encontrada");
    return category;
  }

  private async subcategory(id: number) {
    const subcategory = await this.prisma.productSubcategory.findFirst({ where: { id, deletedAt: null }, include: subcategoryInclude });
    if (!subcategory) throw new NotFoundException("Subcategoría no encontrada");
    return subcategory;
  }

  private async unit(id: number) {
    const unit = await this.prisma.productUnit.findFirst({ where: { id, deletedAt: null }, include: unitInclude });
    if (!unit) throw new NotFoundException("Unidad no encontrada");
    return unit;
  }

  async image(id: number, companyId: number) {
    const image = await this.prisma.productImage.findFirst({ where: { id, deletedAt: null, product: { companyId, deletedAt: null } } });
    if (!image) throw new NotFoundException("Imagen de producto no encontrada");
    return image;
  }

  private async supplierLink(id: number, companyId: number) {
    const link = await this.prisma.productSupplier.findFirst({
      where: { id, deletedAt: null, product: { companyId, deletedAt: null } },
      include: { supplier: { select: { id: true, code: true, name: true, isActive: true } } },
    });
    if (!link) throw new NotFoundException("Asociación producto-proveedor no encontrada");
    return link;
  }

  private async assertProductRelations(categoryId: number, subcategoryId: number, purchaseUnitId: number, saleUnitId: number) {
    const [category, subcategory, purchaseUnit, saleUnit] = await Promise.all([
      this.prisma.productCategory.findFirst({ where: { id: categoryId, deletedAt: null, isActive: true } }),
      this.prisma.productSubcategory.findFirst({ where: { id: subcategoryId, deletedAt: null, isActive: true } }),
      this.prisma.productUnit.findFirst({ where: { id: purchaseUnitId, deletedAt: null, isActive: true, type: "purchase" } }),
      this.prisma.productUnit.findFirst({ where: { id: saleUnitId, deletedAt: null, isActive: true, type: "sale" } }),
    ]);

    if (!category) throw new BadRequestException("La categoría seleccionada no existe o está inactiva");
    if (!subcategory) throw new BadRequestException("La subcategoría seleccionada no existe o está inactiva");
    if (subcategory.categoryId !== category.id) throw new BadRequestException("La subcategoría no pertenece a la categoría seleccionada");
    if (!purchaseUnit) throw new BadRequestException("La unidad de compra debe estar activa y ser de tipo compra");
    if (!saleUnit) throw new BadRequestException("La unidad de venta debe estar activa y ser de tipo venta");
  }

  private async assertCategoryActive(id: number) {
    const category = await this.prisma.productCategory.findFirst({ where: { id, deletedAt: null, isActive: true } });
    if (!category) throw new BadRequestException("La categoría seleccionada no existe o está inactiva");
  }

  private async assertProductActive(id: number, companyId: number) {
    const product = await this.prisma.product.findFirst({ where: { id, companyId, deletedAt: null, isActive: true } });
    if (!product) throw new BadRequestException("El producto seleccionado no existe o está inactivo");
  }

  private async assertSupplierActive(id: number, companyId: number) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId, deletedAt: null, isActive: true } });
    if (!supplier) throw new BadRequestException("El proveedor seleccionado no existe o está inactivo");
  }

  private async assertUniqueCategoryName(name: string, ignoreId?: number) {
    const category = await this.prisma.productCategory.findFirst({
      where: { name: { equals: name.trim(), mode: "insensitive" }, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (category) throw new ConflictException("Ya existe una categoría con este nombre");
  }

  private async assertUniqueSubcategoryName(categoryId: number, name: string, ignoreId?: number) {
    const subcategory = await this.prisma.productSubcategory.findFirst({
      where: {
        categoryId,
        name: { equals: name.trim(), mode: "insensitive" },
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
    });
    if (subcategory) throw new ConflictException("Ya existe una subcategoría con este nombre dentro de la categoría");
  }

  private async assertUniqueUnitName(name: string, type: string, ignoreId?: number) {
    const unit = await this.prisma.productUnit.findFirst({
      where: { name: { equals: name.trim(), mode: "insensitive" }, type, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (unit) throw new ConflictException("Ya existe una unidad con este nombre para el tipo seleccionado");
  }

  private async assertUniqueSku(sku: string, companyId: number, ignoreId?: number) {
    const product = await this.prisma.product.findFirst({
      where: { companyId, sku: { equals: sku.trim(), mode: "insensitive" }, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (product) throw new ConflictException("El SKU ya está registrado");
  }

  private async nextInternalCode(tx: Prisma.TransactionClient, companyId: number, productId: number) {
    const base = `PRD-${String(companyId).padStart(3, "0")}-${String(productId).padStart(6, "0")}`;
    let candidate = base;
    let suffix = 2;
    while (await tx.product.findFirst({ where: { companyId, internalCode: candidate } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private async clearPreferredSupplier(tx: Prisma.TransactionClient, productId: number, exceptId?: number) {
    await tx.productSupplier.updateMany({
      where: { productId, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isPreferred: false },
    });
  }

  private record(
    tx: Prisma.TransactionClient,
    controller: string,
    action: string,
    recordId: number,
    originalData: unknown,
    modifiedData: unknown,
    userId: number,
  ) {
    return this.auditService.record(tx, { controller, action, recordId, originalData, modifiedData, userId });
  }
}
