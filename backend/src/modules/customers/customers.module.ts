import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OrganizationModule } from "../organization/organization.module";
import { CustomersService } from "./application/services/customers.service";
import { CustomersController } from "./presentation/controllers/customers.controller";

@Module({
  imports: [AuditModule, OrganizationModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
