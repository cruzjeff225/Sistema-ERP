import { Module } from "@nestjs/common";
import { RolesService } from "./application/services/roles.service";
import { RolesController } from "../roles/presentation/roles.controller";

// Módulo encargado de la gestión de roles
@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
