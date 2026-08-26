import { Controller, Get, Headers } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../auth/presentation/decorators/current-user.decorator";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService, private readonly companyScope: CompanyScopeService) {}

  @RequirePermissions("dashboard.view")
  @Get("summary")
  @ApiOperation({ summary: "Consultar indicadores generales del ERP" })
  async summary(@CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.dashboardService.summary(await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Dashboard obtenido correctamente", data };
  }
}
