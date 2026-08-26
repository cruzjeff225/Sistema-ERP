import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OrganizationModule } from "../organization/organization.module";
import { SuppliersService } from "./application/services/suppliers.service";
import { SupplierCatalogsController } from "./presentation/controllers/supplier-catalogs.controller";
import { SupplierContactsController } from "./presentation/controllers/supplier-contacts.controller";
import { SuppliersController } from "./presentation/controllers/suppliers.controller";

@Module({
  imports: [AuditModule, OrganizationModule],
  controllers: [SupplierCatalogsController, SuppliersController, SupplierContactsController],
  providers: [SuppliersService],
})
export class SuppliersModule {}
