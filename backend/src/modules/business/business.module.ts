import { Module } from "@nestjs/common";
import { BusinessController } from "./presentation/business.controller";
import { DashboardController } from "./presentation/dashboard.controller";
import { BusinessService } from "./application/business.service";
import { DashboardService } from "./application/dashboard.service";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  imports: [InventoryModule],
  controllers: [BusinessController, DashboardController],
  providers: [BusinessService, DashboardService],
})
export class BusinessModule {}
