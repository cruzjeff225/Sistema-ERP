import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { parseDurationToMs } from "../../../../common/utils/parse-duration.util";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

interface SafeUser {
  id: number;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private async loadActiveUserWithAccess(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      include: {
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

    if (!user) return null;

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissionsSet = new Set<string>();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissionsSet.add(rp.permission.action);
      }
    }

    const safeUser: SafeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles,
      permissions: Array.from(permissionsSet),
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
    const userRecord = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!userRecord) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    if (!userRecord.isActive) {
      throw new UnauthorizedException("El usuario está inactivo");
    }

    const passwordValid = await argon2.verify(
      userRecord.passwordHash,
      password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

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

    // Rotación: revocar el token usado
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

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
}
