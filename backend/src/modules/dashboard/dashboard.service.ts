import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(companyId: number, canViewLogs = false) {
    const [users, roles, permissions, companies, branches, warehouses, locations, suppliers, contacts, logs] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { deletedAt: null, isActive: true, userCompanies: { some: { companyId } } } }),
        this.prisma.role.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.permission.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.company.count({ where: { id: companyId, deletedAt: null, isActive: true } }),
        this.prisma.branch.count({ where: { companyId, deletedAt: null, isActive: true } }),
        this.prisma.warehouse.count({ where: { deletedAt: null, isActive: true, branch: { companyId } } }),
        this.prisma.location.count({ where: { deletedAt: null, isActive: true, warehouse: { branch: { companyId } } } }),
        this.prisma.supplier.count({ where: { companyId, deletedAt: null, isActive: true } }),
        this.prisma.supplierContact.count({ where: { deletedAt: null, isActive: true, supplier: { companyId } } }),
        this.prisma.log.findMany({
          where: canViewLogs ? {
            OR: [
              { modifiedData: { path: ["companyId"], equals: companyId } },
              { originalData: { path: ["companyId"], equals: companyId } },
              { controller: "companies", recordId: companyId },
            ],
          } : { id: -1 },
          take: 8,
          orderBy: { createdAt: "desc" },
          select: { id: true, recordId: true, controller: true, action: true, createdAt: true, user: { select: { username: true } } },
        }),
      ]);

    return {
      counts: { users, roles, permissions, companies, branches, warehouses, locations, suppliers, contacts },
      recentActivity: logs,
    };
  }
}
