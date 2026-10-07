import { TrashModule } from './modules/trash/trash.module';
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import appConfig from "./config/app.config";
import { validate } from "./config/env.validation";
import { PrismaModule } from "./infrastructure/database/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { RolesModule } from "./modules/roles/roles.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { AuditModule } from "./modules/audit/audit.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { ProductsModule } from "./modules/products/products.module";
import { PurchasesModule } from "./modules/purchases/purchases.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { JwtAuthGuard } from "./modules/auth/presentation/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { HealthController } from './health.controller';

// Módulo principal de la aplicación
@Module({
  controllers: [HealthController],
  imports: [
    // Carga la configuración global y valida las variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      load: [appConfig],
      validate,
    }),

    // Configura el límite global de solicitudes por cliente
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Módulos de infraestructura y funcionales
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    OrganizationModule,
    AuditModule,
    SuppliersModule,
    DashboardModule,
    ProductsModule,
    PurchasesModule,
    InventoryModule,
    CustomersModule,
    TrashModule,
  ],
  providers: [
    // Aplica la autenticación JWT a todos los endpoints
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // Valida los permisos requeridos para cada endpoint
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
