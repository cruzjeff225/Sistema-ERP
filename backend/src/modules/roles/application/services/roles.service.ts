import { TrashService } from '../../../trash/trash.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CreateRoleDto } from "../dto/create-role.dto";
import { UpdateRoleDto } from "../dto/update-role.dto";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trashService: TrashService,
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
    _count: {
      select: {
        userRoles: { where: { user: { deletedAt: null } } },
        rolePermissions: { where: { permission: { isActive: true, deletedAt: null } } },
      },
    },
  } satisfies Prisma.RoleSelect;

  private readonly activePermissions = {
    where: { permission: { isActive: true, deletedAt: null } },
    select: {
      permission: {
        select: {
          id: true,
          action: true,
          name: true,
          module: { select: { id: true, name: true } },
        },
      },
    },
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
    const normalizedSearch = search?.trim();
    const roles = await this.prisma.role.findMany({
      where: {
        deletedAt: null,
        ...(normalizedSearch
          ? {
              OR: [
                { name: { contains: normalizedSearch, mode: "insensitive" } },
                { description: { contains: normalizedSearch, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: this.select,
      orderBy: { name: "asc" },
    });
    return roles.map((role) => this.format(role));
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: { ...this.select, rolePermissions: this.activePermissions },
    });
    if (!role) throw new NotFoundException("Rol no encontrado");
    return { ...this.format(role), permissions: role.rolePermissions.map((entry) => entry.permission) };
  }

  async create(dto: CreateRoleDto, userId: number) {
    const name = this.normalizeName(dto.name);
    const description = this.normalizeDescription(dto.description);
    const permissionIds = this.uniqueIds(dto.permissionIds ?? []);
    await this.assertNameAvailable(name);
    await this.assertPermissionsExist(permissionIds);

    const deletedRole = await this.prisma.role.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, deletedAt: { not: null } },
      select: { id: true },
    });

    if (deletedRole) throw new ConflictException("El rol está eliminado; restáurelo desde la papelera antes de reutilizar su nombre");
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
            data: {
              name,
              description,
              rolePermissions: {
                create: permissionIds.map((permissionId) => ({ permissionId })),
              },
            },
            select: this.select,
          });
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
    const name = dto.name === undefined ? undefined : this.normalizeName(dto.name);
    const description = dto.description === undefined ? undefined : this.normalizeDescription(dto.description);
    const permissionIds = dto.permissionIds === undefined ? undefined : this.uniqueIds(dto.permissionIds);
    if (name !== undefined && name.toLocaleLowerCase() !== current.name.toLocaleLowerCase()) {
      await this.assertNameAvailable(name, id);
    }
    if (permissionIds !== undefined) await this.assertPermissionsExist(permissionIds);
    if (name === undefined && description === undefined && permissionIds === undefined) {
      throw new BadRequestException("Indica al menos un dato para actualizar");
    }

    const detailedCurrent = permissionIds === undefined ? undefined : await this.findOne(id);
    const permissionsChanged =
      permissionIds !== undefined && !this.sameIds(permissionIds, detailedCurrent!.permissions.map((permission) => permission.id));

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.RoleUpdateInput = {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(permissionsChanged
          ? {
              rolePermissions: {
                deleteMany: {},
                create: permissionIds!.map((permissionId) => ({ permissionId })),
              },
            }
          : {}),
      };
      const role = await tx.role.update({ where: { id }, data, select: this.select });
      const affectedUserCount = permissionsChanged ? await this.invalidateRoleUsers(tx, id) : 0;
      const formatted = this.format(role);
      await this.auditService.record(tx, {
        controller: "roles",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: { ...formatted, sessionsRevokedForUsers: affectedUserCount },
        userId,
      });
      return formatted;
    });
  }

  async updateStatus(id: number, isActive: boolean, userId: number) {
    const current = await this.assertEditable(id);
    if (current.isActive === isActive) return current;
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({ where: { id }, data: { isActive }, select: this.select });
      const affectedUserCount = await this.invalidateRoleUsers(tx, id);
      const formatted = this.format(role);
      await this.auditService.record(tx, {
        controller: "roles",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: { ...formatted, sessionsRevokedForUsers: affectedUserCount },
        userId,
      });
      return formatted;
    });
  }

  async remove(id: number, userId: number) {
    return this.trashService.trash('roles', id, userId, await this.trashService.primaryCompany());
  }

  async assignPermissions(id: number, permissionIds: number[], userId: number) {
    await this.assertEditable(id);
    const current = await this.findOne(id);
    const normalizedIds = this.uniqueIds(permissionIds);
    await this.assertPermissionsExist(normalizedIds);
    if (this.sameIds(normalizedIds, current.permissions.map((permission) => permission.id))) return current;

    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (normalizedIds.length) {
        await tx.rolePermission.createMany({
          data: normalizedIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }
      const role = await tx.role.findUniqueOrThrow({
        where: { id },
        select: { ...this.select, rolePermissions: this.activePermissions },
      });
      const affectedUserCount = await this.invalidateRoleUsers(tx, id);
      const formatted = { ...this.format(role), permissions: role.rolePermissions.map((entry) => entry.permission) };
      await this.auditService.record(tx, {
        controller: "roles",
        action: "ASSIGN_PERMISSIONS",
        recordId: id,
        originalData: { permissions: current.permissions },
        modifiedData: { permissions: formatted.permissions, sessionsRevokedForUsers: affectedUserCount },
        userId,
      });
      return formatted;
    });
  }

  async duplicate(id: number, requestedName: string | undefined, userId: number) {
    const source = await this.findOne(id);
    if (source.isSystem) throw new ForbiddenException("Los roles del sistema no se pueden duplicar");
    if (!source.isActive) throw new BadRequestException("Solo se pueden duplicar roles activos");
    const name = requestedName === undefined ? await this.nextCopyName(source.name) : this.normalizeName(requestedName);
    await this.assertNameAvailable(name);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name,
          description: source.description ? `Copia de ${source.description}`.slice(0, 255) : `Copia de ${source.name}`,
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

  private async invalidateRoleUsers(tx: Prisma.TransactionClient, roleId: number) {
    const assignments = await tx.userRole.findMany({
      where: { roleId, user: { isActive: true, deletedAt: null } },
      select: { userId: true },
    });
    const userIds = assignments.map((assignment) => assignment.userId);
    if (!userIds.length) return 0;
    const revokedAt = new Date();
    await Promise.all([
      tx.user.updateMany({ where: { id: { in: userIds } }, data: { sessionVersion: { increment: 1 } } }),
      tx.refreshToken.updateMany({ where: { userId: { in: userIds }, revokedAt: null }, data: { revokedAt } }),
    ]);
    return userIds.length;
  }

  private async nextCopyName(sourceName: string) {
    const base = `${sourceName}_copia`.slice(0, 46);
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.role.findFirst({ where: { name: { equals: candidate, mode: "insensitive" } } })) {
      candidate = `${base}_${suffix}`.slice(0, 50);
      suffix += 1;
    }
    return candidate;
  }

  private normalizeName(value: string) {
    return value.trim().replace(/\s+/g, " ");
  }

  private normalizeDescription(value: string | undefined) {
    const normalized = value?.trim().replace(/\s+/g, " ");
    return normalized || null;
  }

  private uniqueIds(ids: number[]) {
    return Array.from(new Set(ids));
  }

  private sameIds(left: number[], right: number[]) {
    if (left.length !== right.length) return false;
    const rightIds = new Set(right);
    return left.every((id) => rightIds.has(id));
  }

  private async assertNameAvailable(name: string, ignoreId?: number) {
    const role = await this.prisma.role.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
    });
    if (role) throw new ConflictException("Ya existe un rol con ese nombre");
  }

  private async assertPermissionsExist(permissionIds: number[]) {
    if (!permissionIds.length) return;
    const count = await this.prisma.permission.count({
      where: { id: { in: permissionIds }, isActive: true, deletedAt: null },
    });
    if (count !== permissionIds.length) throw new BadRequestException("Uno o mas permisos no existen o estan inactivos");
  }

  private async assertEditable(id: number) {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null }, select: this.select });
    if (!role) throw new NotFoundException("Rol no encontrado");
    if (role.isSystem) throw new ForbiddenException("Este rol esta protegido y no puede modificarse");
    return this.format(role);
  }
}
