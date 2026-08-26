import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { OrganizationService } from "../../../organization/application/services/organization.service";
import { CreateCustomerDto } from "../dto/create-customer.dto";
import { UpdateCustomerDto } from "../dto/update-customer.dto";

const customerInclude = {
  country: { select: { id: true, name: true, isoCode: true } },
  department: { select: { id: true, name: true } },
  municipality: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  _count: { select: { quotations: true, sales: true } },
} satisfies Prisma.CustomerInclude;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly organizationService: OrganizationService,
  ) {}

  customers(companyId: number) {
    return this.prisma.customer.findMany({
      where: { companyId, deletedAt: null },
      include: customerInclude,
      orderBy: { name: "asc" },
    });
  }

  async customer(id: number, companyId: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId, deletedAt: null }, include: customerInclude });
    if (!customer) throw new NotFoundException("Cliente no encontrado");
    return customer;
  }

  async create(dto: CreateCustomerDto, userId: number, companyId: number) {
    await this.assertUniqueDocument(dto.document, companyId);
    const nationalAddress = await this.organizationService.resolveNationalAddress(
      dto.countryId,
      dto.departmentId,
      dto.municipalityId,
      dto.districtId,
    );
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { ...dto, companyId, document: dto.document || null, ...nationalAddress },
        include: customerInclude,
      });
      await this.auditService.record(tx, {
        controller: "customers",
        action: "CREATE",
        recordId: customer.id,
        modifiedData: customer,
        userId,
      });
      return customer;
    });
  }

  async update(id: number, dto: UpdateCustomerDto, userId: number, companyId: number) {
    const current = await this.customer(id, companyId);
    if (dto.document && dto.document !== current.document) await this.assertUniqueDocument(dto.document, companyId, id);
    const nationalAddress = await this.organizationService.resolveNationalAddress(
      dto.countryId ?? current.countryId,
      dto.departmentId ?? current.departmentId,
      dto.municipalityId ?? current.municipalityId,
      dto.districtId ?? current.districtId,
    );
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id },
        data: { ...dto, document: dto.document === "" ? null : dto.document, ...nationalAddress },
        include: customerInclude,
      });
      await this.auditService.record(tx, {
        controller: "customers",
        action: "UPDATE",
        recordId: customer.id,
        originalData: current,
        modifiedData: customer,
        userId,
      });
      return customer;
    });
  }

  async updateStatus(id: number, isActive: boolean, userId: number, companyId: number) {
    const current = await this.customer(id, companyId);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({ where: { id }, data: { isActive }, include: customerInclude });
      await this.auditService.record(tx, {
        controller: "customers",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: customer,
        userId,
      });
      return customer;
    });
  }

  private async assertUniqueDocument(document: string | undefined, companyId: number, ignoreId?: number) {
    if (!document) return;
    const existing = await this.prisma.customer.findFirst({
      where: { companyId, document, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException("El documento del cliente ya esta registrado");
  }
}
