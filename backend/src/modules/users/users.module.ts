import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersService } from "./application/services/users.service";
import { UsersController } from "./presentation/controllers/users.controller";

// Módulo encargado de la gestión de usuarios
@Module({
  imports: [AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
