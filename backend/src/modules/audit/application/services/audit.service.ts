import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { QueryLogsDto } from "../dto/query-logs.dto";

type AuditClient = Prisma.TransactionClient | PrismaService;

export interface AuditEvent {
  controller: string;
  action: string;
  recordId: number;
  originalData?: unknown;
  modifiedData: unknown;
  userId?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(client: AuditClient, event: AuditEvent) {
    return client.log.create({
      data: {
        controller: event.controller,
        action: event.action,
        recordId: event.recordId,
        originalData:
          event.originalData === undefined || event.originalData === null
            ? Prisma.DbNull
            : (this.toJson(event.originalData) as Prisma.InputJsonValue),
        modifiedData: this.toJson(event.modifiedData) as Prisma.InputJsonValue,
        userId: event.userId,
      },
    });
  }

  async findAll(query: QueryLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where = this.where(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.log.findMany({
        where,
        include: { user: { select: { id: true, username: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.log.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const log = await this.prisma.log.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true, email: true } } },
    });
    if (!log) throw new NotFoundException("Evento de bitacora no encontrado");
    return log;
  }

  async users() {
    const rows = await this.prisma.log.findMany({
      where: { userId: { not: null } },
      distinct: ["userId"],
      orderBy: { createdAt: "desc" },
      select: { user: { select: { id: true, username: true, email: true } } },
    });

    return rows.flatMap((row) => (row.user ? [row.user] : []));
  }

  async exportCsv(query: QueryLogsDto) {
    const items = await this.prisma.log.findMany({
      where: this.where(query),
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const rows = [
      ["Fecha", "Usuario", "Correo", "Modulo", "Accion", "Registro", "Datos originales", "Datos modificados"],
      ...items.map((item) => [
        item.createdAt.toISOString(),
        item.user?.username ?? "Sistema",
        item.user?.email ?? "",
        item.controller,
        item.action,
        String(item.recordId),
        JSON.stringify(item.originalData ?? null),
        JSON.stringify(item.modifiedData ?? null),
      ]),
    ];

    return rows.map((row) => row.map((value) => this.csvCell(value)).join(",")).join("\r\n");
  }

  private where(query: QueryLogsDto): Prisma.LogWhereInput {
    return {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.recordId ? { recordId: query.recordId } : {}),
      ...(query.controller ? { controller: { contains: query.controller, mode: "insensitive" } } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };
  }

  private csvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value, (key, entry: unknown) => {
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (/(password|passwd|token|secret|authorization|cookie|apikey|privatekey)/.test(normalized)) return undefined;
      return entry;
    }));
  }
}
