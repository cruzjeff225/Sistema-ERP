import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CreateUserDto } from "../dto/create-user.dto";
import { QueryUsersDto } from "../dto/query-users.dto";
import { UpdateUserDto } from "../dto/update-user.dto";

const SUPERADMIN_ROLE = "superadmin";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly safeSelect = {
    id: true,
    username: true,
    email: true,
    isActive: true,
    failedLoginAttempts: true,
    lockedAt: true,
    createdAt: true,
    updatedAt: true,
    employee: { select: { id: true, code: true, fullName: true, email: true, isActive: true } },
    userRoles: { select: { role: { select: { id: true, name: true } } } },
  } satisfies Prisma.UserSelect;

  private formatUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
      isLocked: !!user.lockedAt,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedAt: user.lockedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      employee: user.employee,
      roles: user.userRoles.map((entry: any) => entry.role),
    };
  }

  async findAll(query: QueryUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { employee: { fullName: { contains: query.search, mode: "insensitive" } } },
              { employee: { code: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive === "true" } : {}),
      ...(query.roleId ? { userRoles: { some: { roleId: query.roleId } } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: this.safeSelect,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortOrder ?? "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((user) => this.formatUser(user)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: this.safeSelect });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return this.formatUser(user);
  }

  async create(dto: CreateUserDto, actorUserId: number) {
    await this.assertUserIdentityAvailable(dto.email, dto.username);
    await this.assertEmployeeIdentityAvailable(dto.employeeCode, dto.email);
    await this.assertRolesExist(dto.roleIds);
    const passwordHash = await argon2.hash(dto.password);

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: { code: dto.employeeCode, fullName: dto.employeeName, email: dto.email },
      });
      const user = await tx.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          passwordHash,
          employeeId: employee.id,
          userRoles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
        },
        select: this.safeSelect,
      });
      const formatted = this.formatUser(user);
      await this.auditService.record(tx, {
        controller: "users",
        action: "CREATE",
        recordId: user.id,
        modifiedData: formatted,
        userId: actorUserId,
      });
      return formatted;
    });
  }

  async update(id: number, dto: UpdateUserDto, actorUserId: number) {
    const current = await this.findOne(id);
    if (dto.email || dto.username) await this.assertUserIdentityAvailable(dto.email, dto.username, id);
    if (dto.employeeCode || dto.email) {
      await this.assertEmployeeIdentityAvailable(dto.employeeCode, dto.email, current.employee.id);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: current.employee.id },
        data: { code: dto.employeeCode, fullName: dto.employeeName, email: dto.email },
      });
      const user = await tx.user.update({
        where: { id },
        data: { username: dto.username, email: dto.email },
        select: this.safeSelect,
      });
      const formatted = this.formatUser(user);
      await this.auditService.record(tx, {
        controller: "users",
        action: "UPDATE",
        recordId: id,
        originalData: current,
        modifiedData: formatted,
        userId: actorUserId,
      });
      return formatted;
    });
  }

  async updateStatus(id: number, isActive: boolean, actorUserId: number) {
    const current = await this.findOne(id);
    if (!isActive) await this.assertNotLastSuperadmin(id);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { isActive, ...(isActive ? { failedLoginAttempts: 0, lockedAt: null } : {}) },
        select: this.safeSelect,
      });
      await tx.employee.update({ where: { id: current.employee.id }, data: { isActive } });
      const formatted = this.formatUser(user);
      await this.auditService.record(tx, {
        controller: "users",
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        recordId: id,
        originalData: current,
        modifiedData: formatted,
        userId: actorUserId,
      });
      return formatted;
    });
  }

  async unlock(id: number, actorUserId: number) {
    const current = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { failedLoginAttempts: 0, lockedAt: null },
        select: this.safeSelect,
      });
      const formatted = this.formatUser(user);
      await this.auditService.record(tx, {
        controller: "users",
        action: "UNLOCK",
        recordId: id,
        originalData: current,
        modifiedData: formatted,
        userId: actorUserId,
      });
      return formatted;
    });
  }

  async remove(id: number, actorUserId: number) {
    const current = await this.findOne(id);
    await this.assertNotLastSuperadmin(id);
    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.user.update({ where: { id }, data: { deletedAt, isActive: false } });
      await tx.employee.update({ where: { id: current.employee.id }, data: { deletedAt, isActive: false } });
      await this.auditService.record(tx, {
        controller: "users",
        action: "DELETE",
        recordId: id,
        originalData: current,
        modifiedData: { ...current, isActive: false, deletedAt },
        userId: actorUserId,
      });
    });
    return { id };
  }

  async assignRoles(id: number, roleIds: number[], actorUserId: number) {
    if (!roleIds.length) throw new BadRequestException("Todo usuario debe tener al menos un rol");
    const current = await this.findOne(id);
    await this.assertRolesExist(roleIds);

    const currentRoles = await this.prisma.userRole.findMany({ where: { userId: id }, include: { role: true } });
    const removesSuperadmin =
      currentRoles.some((entry) => entry.role.name === SUPERADMIN_ROLE) && !(await this.roleIdsIncludeSuperadmin(roleIds));
    if (removesSuperadmin) await this.assertNotLastSuperadmin(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })), skipDuplicates: true });
      const user = await tx.user.findUniqueOrThrow({ where: { id }, select: this.safeSelect });
      const formatted = this.formatUser(user);
      await this.auditService.record(tx, {
        controller: "users",
        action: "ASSIGN_ROLES",
        recordId: id,
        originalData: { roles: current.roles },
        modifiedData: { roles: formatted.roles },
        userId: actorUserId,
      });
      return formatted;
    });
  }

  async changePassword(id: number, newPassword: string, actorUserId: number) {
    await this.findOne(id);
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.auditService.record(tx, {
        controller: "users",
        action: "CHANGE_PASSWORD",
        recordId: id,
        originalData: { passwordChanged: false },
        modifiedData: { passwordChanged: true },
        userId: actorUserId,
      });
    });
    return { id };
  }

  private async assertUserIdentityAvailable(email?: string, username?: string, ignoreId?: number) {
    if (!email && !username) return;
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        OR: [...(email ? [{ email }] : []), ...(username ? [{ username }] : [])],
      },
    });
    if (user) throw new ConflictException(user.email === email ? "El correo ya esta registrado" : "El usuario ya esta en uso");
  }

  private async assertEmployeeIdentityAvailable(code?: string, email?: string, ignoreId?: number) {
    if (!code && !email) return;
    const employee = await this.prisma.employee.findFirst({
      where: {
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        OR: [...(code ? [{ code }] : []), ...(email ? [{ email }] : [])],
      },
    });
    if (employee) throw new ConflictException(employee.code === code ? "El codigo de empleado ya existe" : "El correo ya pertenece a otro empleado");
  }

  private async assertRolesExist(roleIds: number[]) {
    const count = await this.prisma.role.count({ where: { id: { in: roleIds }, isActive: true, deletedAt: null } });
    if (count !== new Set(roleIds).size) throw new BadRequestException("Uno o mas roles no existen o estan inactivos");
  }

  private async roleIdsIncludeSuperadmin(roleIds: number[]) {
    const role = await this.prisma.role.findUnique({ where: { name: SUPERADMIN_ROLE } });
    return !!role && roleIds.includes(role.id);
  }

  private async assertNotLastSuperadmin(userId: number) {
    const role = await this.prisma.role.findUnique({ where: { name: SUPERADMIN_ROLE } });
    if (!role) return;
    const hasRole = await this.prisma.userRole.findFirst({ where: { userId, roleId: role.id } });
    if (!hasRole) return;
    const activeCount = await this.prisma.userRole.count({
      where: { roleId: role.id, user: { isActive: true, deletedAt: null } },
    });
    if (activeCount <= 1) throw new ForbiddenException("No se puede modificar al ultimo superadministrador");
  }
}
