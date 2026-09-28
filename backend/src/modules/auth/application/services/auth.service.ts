import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { parseDurationToMs } from "../../../../common/utils/parse-duration.util";
import { AuditService } from "../../../audit/application/services/audit.service";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { PASSWORD_HASH_OPTIONS, passwordPolicyError } from "../../../../common/security/password-security";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SafeUser {
  id: number;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  employee: { id: number; code: string; fullName: string };
  companies: Array<{ id: number; name: string; commercialName: string }>;
  sessionVersion: number;
}

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = argon2.hash("invalid-password-for-timing-protection", PASSWORD_HASH_OPTIONS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private async loadActiveUserWithAccess(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, lockedAt: null, deletedAt: null },
      include: {
        employee: { select: { id: true, code: true, fullName: true } },
        userRoles: {
          where: { role: { isActive: true, deletedAt: null } },
          include: {
            role: {
              include: {
                rolePermissions: {
                  where: {
                    permission: { isActive: true, deletedAt: null },
                  },
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.userRoles.length) return null;

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissionsSet = new Set<string>();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissionsSet.add(rp.permission.action);
      }
    }

    const companies = await this.companyScope.accessibleCompanies({ sub: user.id, roles });
    if (!companies.length) throw new UnauthorizedException("El usuario no tiene acceso a la empresa del ERP");

    const safeUser: SafeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles,
      permissions: Array.from(permissionsSet),
      employee: user.employee,
      companies,
      sessionVersion: user.sessionVersion,
    };

    return safeUser;
  }

  private async issueTokenPair(user: SafeUser): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        sessionVersion: user.sessionVersion,
      },
      {
        secret: this.configService.get<string>("app.jwt.accessSecret"),
        expiresIn: this.configService.get<string>(
          "app.jwt.accessExpiresIn",
        ) as any,
      },
    );

    const refreshExpiresIn = this.configService.get<string>(
      "app.jwt.refreshExpiresIn",
    )!;
    const refreshTokenPlain = crypto.randomBytes(64).toString("hex");
    const refreshTokenExpiresAt = new Date(
      Date.now() + parseDurationToMs(refreshExpiresIn),
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshTokenPlain),
        userId: user.id,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenPlain,
      refreshTokenExpiresAt,
    };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{
    tokens: TokenPair;
    user: SafeUser;
  }> {
    const normalizedEmail = email.trim().toLocaleLowerCase();
    const userRecord = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" }, deletedAt: null },
    });

    if (!userRecord) {
      await argon2.verify(await this.dummyPasswordHash, password);
      throw new UnauthorizedException("Credenciales inválidas");
    }

    if (!userRecord.isActive || userRecord.lockedAt) throw new UnauthorizedException("Credenciales inválidas");

    let passwordValid = false;
    try {
      passwordValid = await argon2.verify(userRecord.passwordHash, password);
    } catch {
      passwordValid = false;
    }

    if (!passwordValid) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: userRecord.id },
          data: { failedLoginAttempts: { increment: 1 } },
          select: { failedLoginAttempts: true },
        });
        const lockedAt = updated.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date() : null;
        if (lockedAt) {
          await tx.user.update({ where: { id: userRecord.id }, data: { lockedAt, sessionVersion: { increment: 1 } } });
          await tx.refreshToken.updateMany({ where: { userId: userRecord.id, revokedAt: null }, data: { revokedAt: lockedAt } });
        }
        await this.auditService.record(tx, {
          controller: "auth",
          action: "LOGIN_FAILED",
          recordId: userRecord.id,
          originalData: { failedLoginAttempts: userRecord.failedLoginAttempts, lockedAt: userRecord.lockedAt },
          modifiedData: { failedLoginAttempts: updated.failedLoginAttempts, lockedAt },
          userId: userRecord.id,
        });
      });
      throw new UnauthorizedException("Credenciales inválidas");
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userRecord.id, passwordHash: userRecord.passwordHash, isActive: true, lockedAt: null, deletedAt: null },
        data: { failedLoginAttempts: 0 },
      });
      if (updated.count !== 1) throw new UnauthorizedException("Credenciales invalidas");
      await this.auditService.record(tx, {
        controller: "auth",
        action: "LOGIN",
        recordId: userRecord.id,
        modifiedData: { authenticated: true, email: normalizedEmail },
        userId: userRecord.id,
      });
    });

    const user = await this.loadActiveUserWithAccess(userRecord.id);
    if (!user) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const tokens = await this.issueTokenPair(user);
    return { tokens, user };
  }

  async refresh(refreshTokenPlain: string): Promise<{
    tokens: TokenPair;
    user: SafeUser;
  }> {
    const tokenHash = this.hashToken(refreshTokenPlain);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token inválido o expirado");
    }

    // Rotación atómica: un refresh token solo puede canjearse una vez.
    const revocation = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revocation.count !== 1) {
      throw new UnauthorizedException("Refresh token inválido o expirado");
    }

    const user = await this.loadActiveUserWithAccess(stored.userId);
    if (!user) {
      throw new UnauthorizedException("Usuario no disponible");
    }

    const tokens = await this.issueTokenPair(user);
    return { tokens, user };
  }

  async logout(refreshTokenPlain: string | undefined): Promise<void> {
    if (!refreshTokenPlain) return;

    const tokenHash = this.hashToken(refreshTokenPlain);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getMe(userId: number): Promise<SafeUser> {
    const user = await this.loadActiveUserWithAccess(userId);
    if (!user) {
      throw new UnauthorizedException("Usuario no disponible");
    }
    return user;
  }

  async changeOwnPassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, isActive: true, lockedAt: null, deletedAt: null } });
    if (!user || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException("La contrasena actual no es correcta");
    }
    const policyError = passwordPolicyError(newPassword, [user.username, user.email]);
    if (policyError) throw new BadRequestException(policyError);
    if (await argon2.verify(user.passwordHash, newPassword)) throw new BadRequestException("La nueva contrasena debe ser diferente de la actual");
    const passwordHash = await argon2.hash(newPassword, PASSWORD_HASH_OPTIONS);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion, isActive: true, lockedAt: null, deletedAt: null },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException("La cuenta cambio durante la operacion. Inicie sesion nuevamente");
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.auditService.record(tx, {
        controller: "users", action: "CHANGE_PASSWORD", recordId: userId, userId,
        originalData: { sessionVersion: user.sessionVersion },
        modifiedData: { sessionVersion: user.sessionVersion + 1, credentialsChanged: true, sessionsRevoked: true },
      });
    });
  }
}
