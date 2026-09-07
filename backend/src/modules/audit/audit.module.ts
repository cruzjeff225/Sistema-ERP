import { Module } from "@nestjs/common";
import { AuditService } from "./application/services/audit.service";
import { AuditController } from "./presentation/controllers/audit.controller";

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
