import { Module } from "@nestjs/common";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./application/services/auth.service";
import { AuthController } from "./presentation/controllers/auth.controller";
import { JwtAccessStrategy } from "./presentation/strategies/jwt-access.strategy";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    AuditModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>("app.jwt.accessSecret"),
        signOptions: {
          // El valor viene de JWT_ACCESS_EXPIRES_IN, validado como string
          // no vacío en env.validation.ts (ej. "15m"). El tipo estricto de
          // la librería exige un literal específico que no podemos derivar
          // desde una variable de entorno en tiempo de compilación.
          expiresIn: configService.get<string>(
            "app.jwt.accessExpiresIn",
          ) as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy],
  exports: [AuthService],
})
export class AuthModule {}
