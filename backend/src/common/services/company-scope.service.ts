import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma/prisma.service";

type CompanyUser = { sub: number; roles: string[] };

@Injectable()
export class CompanyScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async primaryCompanyId() {
    const config = await this.prisma.erpConfiguration.findUnique({ where: { id: 1 } });
    if (!config) throw new ForbiddenException("La empresa del ERP no esta configurada");
    return config.companyId;
  }

  async accessibleCompanies(user: CompanyUser, includeInactive = false) {
    const id = await this.primaryCompanyId();
    const activeFilter = includeInactive ? {} : { isActive: true };
    if (user.roles.includes("superadmin")) {
      return this.prisma.company.findMany({
        where: { id, deletedAt: null, ...activeFilter },
        select: { id: true, name: true, commercialName: true },
        orderBy: { commercialName: "asc" },
      });
    }

    return this.prisma.company.findMany({
      where: { id, deletedAt: null, ...activeFilter, userCompanies: { some: { userId: user.sub } } },
      select: { id: true, name: true, commercialName: true },
      orderBy: { commercialName: "asc" },
    });
  }

  async resolve(user: CompanyUser, rawCompanyId?: string | number, includeInactive = false) {
    const companies = await this.accessibleCompanies(user, includeInactive);
    if (!companies.length) throw new ForbiddenException("El usuario no tiene una empresa asignada");

    const requestedCompanyId = rawCompanyId === undefined || rawCompanyId === null || rawCompanyId === ""
      ? companies[0].id
      : Number(rawCompanyId);
    if (!Number.isInteger(requestedCompanyId) || requestedCompanyId <= 0) {
      throw new BadRequestException("La empresa activa no es válida");
    }

    const company = companies.find((item) => item.id === requestedCompanyId);
    if (!company) {
      const exists = await this.prisma.company.findFirst({ where: { id: requestedCompanyId, deletedAt: null } });
      if (!exists) throw new NotFoundException("Empresa no encontrada");
      throw new ForbiddenException("No tiene acceso a la empresa seleccionada");
    }
    return company.id;
  }

  async assertCompanyIds(companyIds?: number[]) {
    const primary = await this.primaryCompanyId();
    if (companyIds?.some(id => id !== primary)) throw new BadRequestException("El ERP opera exclusivamente para su empresa configurada");
    const uniqueIds = [primary];
    if (!uniqueIds.length) throw new BadRequestException("Seleccione al menos una empresa para el usuario");
    const count = await this.prisma.company.count({ where: { id: { in: uniqueIds }, deletedAt: null, isActive: true } });
    if (count !== uniqueIds.length) throw new BadRequestException("Una o más empresas no existen o están inactivas");
    return uniqueIds;
  }
}
