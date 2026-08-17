import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/database/prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [
      companies,
      branches,
      warehouses,
      locations,
      customers,
      suppliers,
      products,
      inventoryRows,
      salesAgg,
      purchasesAgg,
      recentSales,
      lowStock,
      logs,
    ] = await Promise.all([
      this.prisma.company.count({ where: { deletedAt: null } }),
      this.prisma.branch.count({ where: { deletedAt: null } }),
      this.prisma.warehouse.count({ where: { deletedAt: null } }),
      this.prisma.location.count({ where: { deletedAt: null } }),
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.supplier.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.inventoryStock.findMany({ include: { product: true, location: true } }),
      this.prisma.sale.aggregate({ _sum: { total: true }, _count: true }),
      this.prisma.purchase.aggregate({ _sum: { total: true }, _count: true }),
      this.prisma.sale.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { customer: true } }),
      this.prisma.inventoryStock.findMany({
        where: { quantity: { lte: 5 } },
        take: 8,
        include: { product: true, location: true },
        orderBy: { quantity: "asc" },
      }),
      this.prisma.log.findMany({ take: 8, orderBy: { createdAt: "desc" }, include: { user: { select: { username: true } } } }),
    ]);

    const stockUnits = inventoryRows.reduce((sum, row) => sum + row.quantity, 0);

    return {
      counts: { companies, branches, warehouses, locations, customers, suppliers, products },
      inventory: { stockUnits, lowStock },
      sales: { total: Number(salesAgg._sum.total ?? 0), count: salesAgg._count, recent: recentSales },
      purchases: { total: Number(purchasesAgg._sum.total ?? 0), count: purchasesAgg._count },
      logs,
    };
  }
}
