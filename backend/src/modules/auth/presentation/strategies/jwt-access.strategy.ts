import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { AuthenticatedUser } from "../decorators/current-user.decorator";

interface JwtPayload {
  sub: number;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionVersion: number;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  "jwt-access",
) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly companyScope: CompanyScopeService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("app.jwt.accessSecret")!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        isActive: true,
        lockedAt: null,
        deletedAt: null,
        sessionVersion: payload.sessionVersion,
      },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException("Sesión no disponible");
    if (!(await this.companyScope.accessibleCompanies({ sub: user.id, roles: payload.roles })).length) throw new UnauthorizedException("Sesion no disponible para la empresa del ERP");

    return {
      sub: payload.sub,
      username: payload.username,
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
