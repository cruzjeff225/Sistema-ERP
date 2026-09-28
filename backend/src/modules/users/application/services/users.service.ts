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
import {
  PASSWORD_HASH_OPTIONS,
  passwordPolicyError,
} from "../../../../common/security/password-security";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { OrganizationService } from "../../../organization/application/services/organization.service";
import { CreateUserDto } from "../dto/create-user.dto";
import { QueryUsersDto } from "../dto/query-users.dto";
import { UpdateUserDto } from "../dto/update-user.dto";

const SUPERADMIN_ROLE = "superadmin";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly organizationService: OrganizationService,
    private readonly companyScope: CompanyScopeService,
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
    employee: {
      select: {
        id: true,
        code: true,
        fullName: true,
        email: true,
        isActive: true,
        countryId: true,
        departmentId: true,
        municipalityId: true,
        districtId: true,
        country: { select: { id: true, name: true, isoCode: true } },
        department: { select: { id: true, name: true } },
        municipality: { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
      },
    },
    userRoles: { select: { role: { select: { id: true, name: true } } } },
    userCompanies: { select: { company: { select: { id: true, name: true, commercialName: true } } } },
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
      companies: user.userCompanies.map((entry: any) => entry.company),
    };
  }

  async findAll(query: QueryUsersDto) {
    const companyId = await this.companyScope.primaryCompanyId();
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      AND: [{ OR: [{ userCompanies: { some: { companyId } } }, { userRoles: { some: { role: { name: SUPERADMIN_ROLE } } } }] }],
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
    const companyId = await this.companyScope.primaryCompanyId();
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null, OR: [{ userCompanies: { some: { companyId } } }, { userRoles: { some: { role: { name: SUPERADMIN_ROLE } } } }] }, select: this.safeSelect });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return this.formatUser(user);
  }

  async create(dto: CreateUserDto, actorUserId: number) {
    const email = this.normalizedEmail(dto.email);
    const username = this.normalizedUsername(dto.username);
    const employeeCode = this.normalizedEmployeeCode(dto.employeeCode);
    const employeeName = dto.employeeName.trim();
    this.assertPasswordMeetsPolicy(dto.password, [email, username, employeeCode]);
    await this.assertUserIdentityAvailable(email, username);
    await this.assertEmployeeIdentityAvailable(employeeCode, email);
    await this.assertRolesExist(dto.roleIds);
    const companyIds = await this.companyScope.assertCompanyIds(dto.companyIds);
    const nationalAddress = await this.organizationService.resolveNationalAddress(
      dto.countryId,
      dto.departmentId,
      dto.municipalityId,
      dto.districtId,
    );
    const passwordHash = await argon2.hash(dto.password, PASSWORD_HASH_OPTIONS);

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: { code: employeeCode, fullName: employeeName, email, ...nationalAddress },
      });
      const user = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          employeeId: employee.id,
          userRoles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
          userCompanies: { create: companyIds.map((companyId) => ({ companyId })) },
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
    const email = dto.email === undefined ? undefined : this.normalizedEmail(dto.email);
    const username = dto.username === undefined ? undefined : this.normalizedUsername(dto.username);
    const employeeCode = dto.employeeCode === undefined ? undefined : this.normalizedEmployeeCode(dto.employeeCode);
    const employeeName = dto.employeeName === undefined ? undefined : dto.employeeName.trim();

    if (email || username) await this.assertUserIdentityAvailable(email, username, id);
    if (dto.employeeCode || dto.email) {
      await this.assertEmployeeIdentityAvailable(employeeCode, email, current.employee.id);
    }
    const nationalAddress = await this.organizationService.resolveNationalAddress(
      dto.countryId ?? current.employee.countryId,
      dto.departmentId ?? current.employee.departmentId,
      dto.municipalityId ?? current.employee.municipalityId,
      dto.districtId ?? current.employee.districtId,
    );
    const companyIds = dto.companyIds === undefined ? undefined : await this.companyScope.assertCompanyIds(dto.companyIds);
    if (companyIds !== undefined && !companyIds.length) throw new BadRequestException("Todo usuario debe tener al menos una empresa");
    if (dto.roleIds !== undefined && !dto.roleIds.length) throw new BadRequestException("Todo usuario debe tener al menos un rol");
    if (dto.roleIds !== undefined) await this.assertRolesExist(dto.roleIds);
    if (dto.roleIds !== undefined && !(await this.roleIdsIncludeSuperadmin(dto.roleIds))) {
      const currentRoles = await this.prisma.userRole.findMany({ where: { userId: id }, include: { role: true } });
      if (currentRoles.some((entry) => entry.role.name === SUPERADMIN_ROLE)) await this.assertNotLastSuperadmin(id);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: current.employee.id },
        data: {
          ...(employeeCode !== undefined ? { code: employeeCode } : {}),
          ...(employeeName !== undefined ? { fullName: employeeName } : {}),
          ...(email !== undefined ? { email } : {}),
          ...nationalAddress,
        },
      });
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(username !== undefined ? { username } : {}),
          ...(email !== undefined ? { email } : {}),
          sessionVersion: { increment: 1 },
          ...(companyIds !== undefined ? { userCompanies: { deleteMany: {}, create: companyIds.map((companyId) => ({ companyId })) } } : {}),
          ...(dto.roleIds !== undefined ? { userRoles: { deleteMany: {}, create: dto.roleIds.map((roleId) => ({ roleId })) } } : {}),
        },
        select: this.safeSelect,
      });
      await this.revokeActiveRefreshTokens(tx, id);
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
        data: {
          isActive,
          sessionVersion: { increment: 1 },
          ...(isActive ? { failedLoginAttempts: 0, lockedAt: null } : {}),
        },
        select: this.safeSelect,
      });
      await tx.employee.update({ where: { id: current.employee.id }, data: { isActive } });
      await this.revokeActiveRefreshTokens(tx, id);
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
        data: { failedLoginAttempts: 0, lockedAt: null, sessionVersion: { increment: 1 } },
        select: this.safeSelect,
      });
      await this.revokeActiveRefreshTokens(tx, id);
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
      await tx.user.update({ where: { id }, data: { deletedAt, isActive: false, sessionVersion: { increment: 1 } } });
      await tx.employee.update({ where: { id: current.employee.id }, data: { deletedAt, isActive: false } });
      await this.revokeActiveRefreshTokens(tx, id);
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
      await tx.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
      await this.revokeActiveRefreshTokens(tx, id);
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
    const current = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, username: true, passwordHash: true, failedLoginAttempts: true, lockedAt: true },
    });
    if (!current) throw new NotFoundException("Usuario no encontrado");
    this.assertPasswordMeetsPolicy(newPassword, [current.email, current.username]);
    if (await argon2.verify(current.passwordHash, newPassword)) {
      throw new BadRequestException("La nueva contraseña debe ser diferente de la actual");
    }
    const passwordHash = await argon2.hash(newPassword, PASSWORD_HASH_OPTIONS);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedAt: null,
          sessionVersion: { increment: 1 },
        },
      });
      await this.revokeActiveRefreshTokens(tx, id);
      await this.auditService.record(tx, {
        controller: "users",
        action: "CHANGE_PASSWORD",
        recordId: id,
        originalData: { passwordChanged: false, failedLoginAttempts: current.failedLoginAttempts, lockedAt: current.lockedAt },
        modifiedData: { passwordChanged: true, sessionsRevoked: true, accountUnlocked: true },
        userId: actorUserId,
      });
    });
    return { id };
  }

  private assertPasswordMeetsPolicy(password: string, identityValues: string[]) {
    const error = passwordPolicyError(password, identityValues);
    if (error) throw new BadRequestException(error);
  }

  private normalizedEmail(value: string) {
    return value.trim().toLocaleLowerCase();
  }

  private normalizedUsername(value: string) {
    return value.trim().toLocaleLowerCase();
  }

  private normalizedEmployeeCode(value: string) {
    return value.trim().toLocaleUpperCase();
  }

  private revokeActiveRefreshTokens(tx: Prisma.TransactionClient, userId: number) {
    return tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async assertUserIdentityAvailable(email?: string, username?: string, ignoreId?: number) {
    if (!email && !username) return;
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        OR: [
          ...(email ? [{ email: { equals: this.normalizedEmail(email), mode: "insensitive" as const } }] : []),
          ...(username ? [{ username: { equals: this.normalizedUsername(username), mode: "insensitive" as const } }] : []),
        ],
      },
    });
    if (user) throw new ConflictException(user.email.toLocaleLowerCase() === this.normalizedEmail(email ?? "") ? "El correo ya está registrado" : "El usuario ya está en uso");
  }

  private async assertEmployeeIdentityAvailable(code?: string, email?: string, ignoreId?: number) {
    if (!code && !email) return;
    const employee = await this.prisma.employee.findFirst({
      where: {
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        OR: [
          ...(code ? [{ code: { equals: this.normalizedEmployeeCode(code), mode: "insensitive" as const } }] : []),
          ...(email ? [{ email: { equals: this.normalizedEmail(email), mode: "insensitive" as const } }] : []),
        ],
      },
    });
    if (employee) throw new ConflictException(employee.code.toLocaleUpperCase() === this.normalizedEmployeeCode(code ?? "") ? "El código de empleado ya existe" : "El correo ya pertenece a otro empleado");
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
