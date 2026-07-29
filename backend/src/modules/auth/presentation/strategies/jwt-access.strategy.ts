import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthenticatedUser } from "../decorators/current-user.decorator";

interface JwtPayload {
  sub: number;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  "jwt-access",
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("app.jwt.accessSecret")!,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      sub: payload.sub,
      username: payload.username,
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
