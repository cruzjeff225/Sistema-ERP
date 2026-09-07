import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { BUSINESS_PERMISSIONS } from "../../../common/constants/business-permissions.constant";
import { RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { DashboardService } from "../application/dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermissions(BUSINESS_PERMISSIONS.DASHBOARD_VIEW)
  @Get("summary")
  async summary() {
    const data = await this.dashboardService.summary();
    return { success: true, message: "Dashboard obtenido correctamente", data };
  }
}
