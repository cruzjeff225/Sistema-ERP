import { Module } from "@nestjs/common";
import { PermissionsService } from "./application/services/permissions.service";
import { ModulesService } from "./application/services/modules.service";
import { PermissionsController } from "./presentation/controllers/permissions.controller";
import { ModulesController } from "./presentation/controllers/modules.controller";

// Módulo encargado de la gestión de permisos y módulos del sistema
@Module({
  controllers: [PermissionsController, ModulesController],
  providers: [PermissionsService, ModulesService],
  exports: [PermissionsService, ModulesService],
})
export class PermissionsModule {}
