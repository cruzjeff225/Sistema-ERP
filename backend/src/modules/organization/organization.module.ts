import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OrganizationService } from "./application/services/organization.service";
import { BranchesController } from "./presentation/controllers/branches.controller";
import { CatalogsController } from "./presentation/controllers/catalogs.controller";
import { CompaniesController } from "./presentation/controllers/companies.controller";
import { LocationsController } from "./presentation/controllers/locations.controller";
import { WarehouseCategoriesController } from "./presentation/controllers/warehouse-categories.controller";
import { WarehousesController } from "./presentation/controllers/warehouses.controller";

@Module({
  imports: [AuditModule],
  controllers: [
    CatalogsController,
    CompaniesController,
    BranchesController,
    WarehouseCategoriesController,
    WarehousesController,
    LocationsController,
  ],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
