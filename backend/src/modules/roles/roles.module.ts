import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { RolesService } from "./application/services/roles.service";
import { RolesController } from "../roles/presentation/roles.controller";

// Módulo encargado de la gestión de roles
@Module({
  imports: [AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
