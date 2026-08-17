import { Module } from "@nestjs/common";
import { BusinessController } from "./presentation/business.controller";
import { DashboardController } from "./presentation/dashboard.controller";
import { BusinessService } from "./application/business.service";
import { DashboardService } from "./application/dashboard.service";

@Module({
  controllers: [BusinessController, DashboardController],
  providers: [BusinessService, DashboardService],
})
export class BusinessModule {}
