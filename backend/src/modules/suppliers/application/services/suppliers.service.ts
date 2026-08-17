import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CreateSupplierContactDto } from "../dto/create-supplier-contact.dto";
import { CreateSupplierDto } from "../dto/create-supplier.dto";
import { QuerySuppliersDto } from "../dto/query-suppliers.dto";
import { UpdateSupplierContactDto } from "../dto/update-supplier-contact.dto";
import { UpdateSupplierDto } from "../dto/update-supplier.dto";

const supplierInclude = {
  country: { select: { id: true, name: true, isoCode: true } },
  _count: { select: { contacts: true, purchases: true } },
} satisfies Prisma.SupplierInclude;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  countries() {
    return this.prisma.country.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  }

  suppliers(query: QuerySuppliersDto) {
    return this.prisma.supplier.findMany({
      where: {
        deletedAt: null,
        ...(query.activeOnly ? { isActive: true } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" } },
                { name: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: supplierInclude,
      orderBy: { name: "asc" },
    });
  }

  async supplier(id: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...supplierInclude,
        contacts: { where: { deletedAt: null }, orderBy: { fullName: "asc" } },
      },
    });
    if (!supplier) throw new NotFoundException("Proveedor no encontrado");
    return supplier;
  }

  async createSupplier(dto: CreateSupplierDto, userId: number) {
    await this.assertCountry(dto.countryId);
    await this.assertUniqueCode(dto.code);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: dto, include: supplierInclude });
      await this.auditService.record(tx, {
        controller: "suppliers",
        action: "CREATE",
        recordId: supplier.id,
        modifiedData: supplier,
        userId,
      });
      return supplier;
    });
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto, userId: number) {
    const current = await this.supplier(id);
    if (dto.countryId) await this.assertCountry(dto.countryId);
    if (dto.code && dto.code !== current.code) await this.assertUniqueCode(dto.code, id);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.update({ where: { id }, data: dto, include: supplierInclude });
      await this.auditService.record(tx, {
        controller: "suppliers",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: supplier,
        userId,
      });
      return supplier;
    });
  }

  async updateSupplierStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.supplier(id);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.update({ where: { id }, data: { isActive }, include: supplierInclude });
      await this.auditService.record(tx, {
        controller: "suppliers",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: supplier,
        userId,
      });
      return supplier;
    });
  }

  contacts(supplierId: number, activeOnly = false) {
    return this.prisma.supplierContact.findMany({
      where: { supplierId, deletedAt: null, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { fullName: "asc" },
    });
  }

  async createContact(dto: CreateSupplierContactDto, userId: number) {
    await this.assertSupplierActive(dto.supplierId);
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.supplierContact.create({ data: dto });
      await this.auditService.record(tx, {
        controller: "supplier_contacts",
        action: "CREATE",
        recordId: contact.id,
        modifiedData: contact,
        userId,
      });
      return contact;
    });
  }

  async updateContact(id: number, dto: UpdateSupplierContactDto, userId: number) {
    const current = await this.assertContact(id);
    if (dto.supplierId) await this.assertSupplierActive(dto.supplierId);
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.supplierContact.update({ where: { id }, data: dto });
      await this.auditService.record(tx, {
        controller: "supplier_contacts",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: contact,
        userId,
      });
      return contact;
    });
  }

  async updateContactStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.assertContact(id);
    if (isActive) await this.assertSupplierActive(current.supplierId);
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.supplierContact.update({ where: { id }, data: { isActive } });
      await this.auditService.record(tx, {
        controller: "supplier_contacts",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: contact,
        userId,
      });
      return contact;
    });
  }

  history(supplierId: number) {
    return this.prisma.log.findMany({
      where: { controller: "suppliers", recordId: supplierId },
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  private async assertCountry(id: number) {
    const country = await this.prisma.country.findFirst({ where: { id, isActive: true } });
    if (!country) throw new BadRequestException("El pais indicado no existe o esta inactivo");
  }

  private async assertUniqueCode(code: string, ignoreId?: number) {
    const existing = await this.prisma.supplier.findFirst({
      where: { code, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException("El codigo del proveedor ya esta registrado");
  }

  private async assertSupplierActive(id: number) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, isActive: true, deletedAt: null } });
    if (!supplier) throw new BadRequestException("El proveedor no existe o esta inactivo");
    return supplier;
  }

  private async assertContact(id: number) {
    const contact = await this.prisma.supplierContact.findFirst({ where: { id, deletedAt: null } });
    if (!contact) throw new NotFoundException("Contacto no encontrado");
    return contact;
  }
}
