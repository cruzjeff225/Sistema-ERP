import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CreateRoleDto } from "../dto/create-role.dto";
import { UpdateRoleDto } from "../dto/update-role.dto";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly select = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    isSystem: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { userRoles: true, rolePermissions: true } },
  };

  private format(role: any) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.userRoles,
      permissionCount: role._count.rolePermissions,
    };
  }

  async findAll(search?: string) {
    const roles = await this.prisma.role.findMany({
      where: { deletedAt: null, ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) },
      select: this.select,
      orderBy: { name: "asc" },
    });
    return roles.map((role) => this.format(role));
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...this.select,
        rolePermissions: { select: { permission: { select: { id: true, action: true, name: true, moduleId: true } } } },
      },
    });
    if (!role) throw new NotFoundException("Rol no encontrado");
    return { ...this.format(role), permissions: role.rolePermissions.map((entry) => entry.permission) };
  }

  async create(dto: CreateRoleDto, userId: number) {
    await this.assertNameAvailable(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({ data: dto, select: this.select });
      const formatted = this.format(role);
      await this.auditService.record(tx, {
        controller: "roles",
        action: "CREATE",
        recordId: role.id,
        modifiedData: formatted,
        userId,
      });
      return formatted;
    });
  }

  async update(id: number, dto: UpdateRoleDto, userId: number) {
    const current = await this.assertEditable(id);
    if (dto.name && dto.name !== current.name) await this.assertNameAvailable(dto.name, id);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({ where: { id }, data: dto, select: this.select });
      const formatted = this.format(role);
      await this.auditService.record(tx, {
        controller: "roles",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: formatted,
        userId,
      });
      return formatted;
    });
  }

  async updateStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.assertEditable(id);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({ where: { id }, data: { isActive }, select: this.select });
      const formatted = this.format(role);
      await this.auditService.record(tx, {
        controller: "roles",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: formatted,
        userId,
      });
      return formatted;
    });
  }

  async remove(id: number, userId: number) {
    const current = await this.assertEditable(id);
    const usersCount = await this.prisma.userRole.count({ where: { roleId: id } });
    if (usersCount > 0) throw new BadRequestException("No se puede eliminar un rol que tiene usuarios asignados");
    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.role.update({ where: { id }, data: { deletedAt, isActive: false } });
      await this.auditService.record(tx, {
        controller: "roles",
        action: "DELETE",
        recordId: id,
        originalData: current,
        modifiedData: { ...current, isActive: false, deletedAt },
        userId,
      });
    });
    return { id };
  }

  async assignPermissions(id: number, permissionIds: number[], userId: number) {
    await this.assertEditable(id);
    const current = await this.findOne(id);
    if (permissionIds.length) {
      const count = await this.prisma.permission.count({
        where: { id: { in: permissionIds }, isActive: true, deletedAt: null },
      });
      if (count !== new Set(permissionIds).size) throw new BadRequestException("Uno o mas permisos no existen o estan inactivos");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }
      const role = await tx.role.findUniqueOrThrow({
        where: { id },
        select: {
          ...this.select,
          rolePermissions: { select: { permission: { select: { id: true, action: true, name: true, moduleId: true } } } },
        },
      });
      const formatted = { ...this.format(role), permissions: role.rolePermissions.map((entry) => entry.permission) };
      await this.auditService.record(tx, {
        controller: "roles",
        action: "ASSIGN_PERMISSIONS",
        recordId: id,
        originalData: { permissions: current.permissions },
        modifiedData: { permissions: formatted.permissions },
        userId,
      });
      return formatted;
    });
  }

  async duplicate(id: number, requestedName: string | undefined, userId: number) {
    const source = await this.findOne(id);
    const name = requestedName ?? (await this.nextCopyName(source.name));
    await this.assertNameAvailable(name);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name,
          description: source.description ? `Copia de ${source.description}` : `Copia de ${source.name}`,
          rolePermissions: {
            create: source.permissions.map((permission) => ({ permissionId: permission.id })),
          },
        },
        select: this.select,
      });
      const formatted = this.format(role);
      await this.auditService.record(tx, {
        controller: "roles",
        action: "DUPLICATE",
        recordId: role.id,
        originalData: { sourceRoleId: source.id, sourceRoleName: source.name },
        modifiedData: formatted,
        userId,
      });
      return formatted;
    });
  }

  private async nextCopyName(sourceName: string) {
    const base = `${sourceName}_copia`.slice(0, 46);
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.role.findFirst({ where: { name: candidate, deletedAt: null } })) {
      candidate = `${base}_${suffix}`.slice(0, 50);
      suffix += 1;
    }
    return candidate;
  }

  private async assertNameAvailable(name: string, ignoreId?: number) {
    const role = await this.prisma.role.findFirst({
      where: { name, deletedAt: null, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    });
    if (role) throw new ConflictException("Ya existe un rol con ese nombre");
  }

  private async assertEditable(id: number) {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null }, select: this.select });
    if (!role) throw new NotFoundException("Rol no encontrado");
    if (role.isSystem) throw new ForbiddenException("Este rol esta protegido y no puede modificarse");
    return this.format(role);
  }
}
