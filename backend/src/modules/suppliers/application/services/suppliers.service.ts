import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { OrganizationService } from "../../../organization/application/services/organization.service";
import { CreateSupplierContactDto } from "../dto/create-supplier-contact.dto";
import { CreateSupplierDto } from "../dto/create-supplier.dto";
import { QuerySuppliersDto } from "../dto/query-suppliers.dto";
import { UpdateSupplierContactDto } from "../dto/update-supplier-contact.dto";
import { QuerySupplierContactsDto } from "../dto/query-supplier-contacts.dto";
import { UpdateSupplierDto } from "../dto/update-supplier.dto";

const supplierInclude = {
  country: { select: { id: true, name: true, isoCode: true } },
  department: { select: { id: true, name: true } },
  municipality: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  _count: { select: { contacts: true, purchases: true } },
} satisfies Prisma.SupplierInclude;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly organizationService: OrganizationService,
  ) {}

  countries() {
    return this.prisma.country.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  }

  suppliers(query: QuerySuppliersDto, companyId: number) {
    return this.prisma.supplier.findMany({
      where: {
        deletedAt: null,
        companyId,
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

  async supplier(id: number, companyId: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        ...supplierInclude,
        contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }] },
      },
    });
    if (!supplier) throw new NotFoundException("Proveedor no encontrado");
    return supplier;
  }

  async createSupplier(dto: CreateSupplierDto, userId: number, companyId: number) {
    await this.assertUniqueCode(dto.code, companyId);
    const nationalAddress = await this.organizationService.resolveNationalAddress(
      dto.countryId,
      dto.departmentId,
      dto.municipalityId,
      dto.districtId,
    );
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: { ...dto, companyId, ...nationalAddress }, include: supplierInclude });
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

  async updateSupplier(id: number, dto: UpdateSupplierDto, userId: number, companyId: number) {
    const current = await this.supplier(id, companyId);
    if (dto.code && dto.code !== current.code) await this.assertUniqueCode(dto.code, companyId, id);
    const nationalAddress = await this.organizationService.resolveNationalAddress(
      dto.countryId ?? current.countryId,
      dto.departmentId ?? current.departmentId,
      dto.municipalityId ?? current.municipalityId,
      dto.districtId ?? current.districtId,
    );
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.update({ where: { id }, data: { ...dto, ...nationalAddress }, include: supplierInclude });
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

  async updateSupplierStatus(id: number, isActive: boolean, userId: number, companyId: number) {
    const current = await this.supplier(id, companyId);
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

  async contacts(query: QuerySupplierContactsDto, companyId: number) {
    await this.supplier(query.supplierId, companyId);
    return this.prisma.supplierContact.findMany({
      where: {
        supplierId: query.supplierId,
        deletedAt: null,
        ...(query.activeOnly ? { isActive: true } : {}),
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }],
    });
  }

  async createContact(dto: CreateSupplierContactDto, userId: number, companyId: number) {
    await this.assertSupplierActive(dto.supplierId, companyId);
    return this.prisma.$transaction(async (tx) => {
      const hasPrimary = await tx.supplierContact.count({ where: { supplierId: dto.supplierId, isPrimary: true, isActive: true, deletedAt: null } });
      const isPrimary = dto.isPrimary ?? hasPrimary === 0;
      if (isPrimary) await this.clearPrimaryContact(tx, dto.supplierId);
      const contact = await tx.supplierContact.create({
        data: {
          supplierId: dto.supplierId,
          fullName: dto.fullName.trim(),
          role: dto.role ?? "General",
          isPrimary,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });
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

  async updateContact(id: number, dto: UpdateSupplierContactDto, userId: number, companyId: number) {
    const current = await this.assertContact(id, companyId);
    const supplierId = dto.supplierId ?? current.supplierId;
    if (dto.supplierId) await this.assertSupplierActive(dto.supplierId, companyId);
    return this.prisma.$transaction(async (tx) => {
      const isPrimary = dto.isPrimary ?? current.isPrimary;
      if (isPrimary) await this.clearPrimaryContact(tx, supplierId, id);
      const contact = await tx.supplierContact.update({
        where: { id },
        data: {
          ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
          ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.isPrimary !== undefined || supplierId !== current.supplierId ? { isPrimary } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        },
      });
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

  async updateContactStatus(id: number, isActive: boolean, userId: number, companyId: number) {
    const current = await this.assertContact(id, companyId);
    if (isActive) await this.assertSupplierActive(current.supplierId, companyId);
    return this.prisma.$transaction(async (tx) => {
      if (isActive && current.isPrimary) await this.clearPrimaryContact(tx, current.supplierId, id);
      const contact = await tx.supplierContact.update({ where: { id }, data: { isActive, ...(isActive ? {} : { isPrimary: false }) } });
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

  async history(supplierId: number, companyId: number) {
    await this.supplier(supplierId, companyId);
    return this.prisma.log.findMany({
      where: { controller: "suppliers", recordId: supplierId },
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async contactHistory(contactId: number, companyId: number) {
    await this.assertContact(contactId, companyId);
    return this.prisma.log.findMany({
      where: { controller: "supplier_contacts", recordId: contactId },
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async purchases(supplierId: number, companyId: number) {
    await this.supplier(supplierId, companyId);
    return this.prisma.purchase.findMany({
      where: { supplierId, branch: { companyId } },
      select: {
        id: true,
        documentNumber: true,
        status: true,
        total: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async assertUniqueCode(code: string, companyId: number, ignoreId?: number) {
    const existing = await this.prisma.supplier.findFirst({
      where: { code, companyId, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException("El codigo del proveedor ya esta registrado");
  }

  private async assertSupplierActive(id: number, companyId: number) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId, isActive: true, deletedAt: null } });
    if (!supplier) throw new BadRequestException("El proveedor no existe o esta inactivo");
    return supplier;
  }

  private async assertContact(id: number, companyId: number) {
    const contact = await this.prisma.supplierContact.findFirst({ where: { id, deletedAt: null, supplier: { companyId, deletedAt: null } } });
    if (!contact) throw new NotFoundException("Contacto no encontrado");
    return contact;
  }

  private async clearPrimaryContact(tx: Prisma.TransactionClient, supplierId: number, exceptId?: number) {
    await tx.supplierContact.updateMany({
      where: { supplierId, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isPrimary: false },
    });
  }
}
