import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { OrganizationService } from "../../../organization/application/services/organization.service";
import { CreateCustomerDto } from "../dto/create-customer.dto";
import { UpdateCustomerDto } from "../dto/update-customer.dto";
import { QueryCustomersDto } from '../dto/query-customers.dto';
import { companyTransaction } from '../../../../common/services/company-transaction';

const customerInclude = {
  country: { select: { id: true, name: true, isoCode: true } },
  department: { select: { id: true, name: true } },
  municipality: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
} satisfies Prisma.CustomerInclude;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly organizationService: OrganizationService,
  ) {}

  async customers(companyId: number, query: QueryCustomersDto) {
    const term = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      companyId, deletedAt: null,
      ...(query.status !== 'all' ? { isActive: query.status === 'active' } : {}),
      ...(term ? { OR: ['name', 'document', 'phone', 'email'].map(field => ({ [field]: { contains: term, mode: 'insensitive' } })) } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, include: customerInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: query.page, totalPages: Math.ceil(total / query.limit) };
  }

  async customer(id: number, companyId: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId, deletedAt: null }, include: customerInclude });
    if (!customer) throw new NotFoundException("Cliente no encontrado");
    return customer;
  }

  async create(dto: CreateCustomerDto, userId: number, companyId: number) {
    const nationalAddress = await this.organizationService.resolveNationalAddress(
      dto.countryId,
      dto.departmentId,
      dto.municipalityId,
      dto.districtId,
    );
    return companyTransaction(this.prisma, companyId, async (tx) => {
      await this.assertUniqueDocument(tx, dto.document, companyId);
      const customer = await tx.customer.create({
        data: { ...dto, name: dto.name.trim(), companyId, document: dto.document?.trim() || null, phone: dto.phone?.trim() || null, email: dto.email?.trim() || null, address: dto.address?.trim() || null, ...nationalAddress },
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
    return companyTransaction(this.prisma, companyId, async (tx) => {
      const current = await tx.customer.findFirst({ where: { id, companyId, deletedAt: null }, include: customerInclude });
      if (!current) throw new NotFoundException('Cliente no encontrado');
      if (dto.document && dto.document.trim() !== current.document) await this.assertUniqueDocument(tx, dto.document, companyId, id);
      const nationalAddress = await this.organizationService.resolveNationalAddress(
        dto.countryId ?? current.countryId,
        dto.departmentId !== undefined ? dto.departmentId : current.departmentId,
        dto.municipalityId !== undefined ? dto.municipalityId : current.municipalityId,
        dto.districtId !== undefined ? dto.districtId : current.districtId,
      );
      const customer = await tx.customer.update({
        where: { id },
        data: { ...dto, ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.document !== undefined ? { document: dto.document?.trim() || null } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
          ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}), ...nationalAddress },
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
    return companyTransaction(this.prisma, companyId, async (tx) => {
      const current = await tx.customer.findFirst({ where: { id, companyId, deletedAt: null }, include: customerInclude });
      if (!current) throw new NotFoundException('Cliente no encontrado');
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

  private async assertUniqueDocument(tx: Prisma.TransactionClient, document: string | undefined, companyId: number, ignoreId?: number) {
    if (!document) return;
    const existing = await tx.customer.findFirst({
      where: { companyId, document: document.trim(), ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException(existing.deletedAt ? 'El documento pertenece a un cliente en la papelera. Recupéralo desde Configuración.' : 'El documento del cliente ya está registrado');
  }
}
