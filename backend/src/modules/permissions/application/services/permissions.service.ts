import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CreatePermissionDto } from "../dto/create-permission.dto";
import { UpdatePermissionDto } from "../dto/update-permission.dto";

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly select = {
    id: true,
    action: true,
    name: true,
    description: true,
    isActive: true,
    isSystem: true,
    createdAt: true,
    updatedAt: true,
    module: { select: { id: true, name: true } },
  };

  findAll(moduleId?: number) {
    return this.prisma.permission.findMany({
      where: { deletedAt: null, ...(moduleId ? { moduleId } : {}) },
      select: this.select,
      orderBy: { action: "asc" },
    });
  }

  async findOne(id: number) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, deletedAt: null },
      select: this.select,
    });
    if (!permission) throw new NotFoundException("Permiso no encontrado");
    return permission;
  }

  async create(dto: CreatePermissionDto, userId: number) {
    await this.assertActionAvailable(dto.action);
    await this.assertModule(dto.moduleId);
    return this.prisma.$transaction(async (tx) => {
      const permission = await tx.permission.create({ data: dto, select: this.select });
      await this.auditService.record(tx, {
        controller: "permissions",
        action: "CREATE",
        recordId: permission.id,
        modifiedData: permission,
        userId,
      });
      return permission;
    });
  }

  async update(id: number, dto: UpdatePermissionDto, userId: number) {
    const current = await this.assertEditable(id);
    if (dto.moduleId) await this.assertModule(dto.moduleId);
    return this.prisma.$transaction(async (tx) => {
      const permission = await tx.permission.update({ where: { id }, data: dto, select: this.select });
      await this.auditService.record(tx, {
        controller: "permissions",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: permission,
        userId,
      });
      return permission;
    });
  }

  async updateStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.assertEditable(id);
    return this.prisma.$transaction(async (tx) => {
      const permission = await tx.permission.update({ where: { id }, data: { isActive }, select: this.select });
      await this.auditService.record(tx, {
        controller: "permissions",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: permission,
        userId,
      });
      return permission;
    });
  }

  async remove(id: number, userId: number) {
    const current = await this.assertEditable(id);
    const rolesCount = await this.prisma.rolePermission.count({ where: { permissionId: id } });
    if (rolesCount > 0) throw new BadRequestException("No se puede eliminar un permiso asignado a roles");
    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.permission.update({ where: { id }, data: { deletedAt, isActive: false } });
      await this.auditService.record(tx, {
        controller: "permissions",
        action: "DELETE",
        recordId: id,
        originalData: current,
        modifiedData: { ...current, isActive: false, deletedAt },
        userId,
      });
    });
    return { id };
  }

  private async assertActionAvailable(action: string) {
    const permission = await this.prisma.permission.findFirst({ where: { action, deletedAt: null } });
    if (permission) throw new ConflictException("Ya existe un permiso con ese codigo");
  }

  private async assertModule(id: number) {
    const module = await this.prisma.module.findFirst({ where: { id, isActive: true, deletedAt: null } });
    if (!module) throw new BadRequestException("El modulo indicado no existe o esta inactivo");
  }

  private async assertEditable(id: number) {
    const permission = await this.prisma.permission.findFirst({ where: { id, deletedAt: null }, select: this.select });
    if (!permission) throw new NotFoundException("Permiso no encontrado");
    if (permission.isSystem) throw new ForbiddenException("Este permiso esta protegido y no puede modificarse");
    return permission;
  }
}
