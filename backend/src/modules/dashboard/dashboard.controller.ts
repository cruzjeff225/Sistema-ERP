import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermissions("dashboard.view")
  @Get("summary")
  @ApiOperation({ summary: "Consultar indicadores generales del ERP" })
  async summary() {
    const data = await this.dashboardService.summary();
    return { success: true, message: "Dashboard obtenido correctamente", data };
  }
}
