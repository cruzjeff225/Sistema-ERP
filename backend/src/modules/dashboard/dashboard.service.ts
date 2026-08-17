import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [users, roles, permissions, companies, branches, warehouses, locations, suppliers, contacts, logs] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.role.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.permission.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.company.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.branch.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.warehouse.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.location.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.supplier.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.supplierContact.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.log.findMany({
          take: 8,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { username: true } } },
        }),
      ]);

    return {
      counts: { users, roles, permissions, companies, branches, warehouses, locations, suppliers, contacts },
      recentActivity: logs,
    };
  }
}
