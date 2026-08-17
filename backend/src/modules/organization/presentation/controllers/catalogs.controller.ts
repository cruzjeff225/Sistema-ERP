import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { COMPANY_PERMISSIONS } from "../../../../common/constants/organization-permissions.constant";
import { RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { OrganizationService } from "../../application/services/organization.service";

@ApiTags("catalogs")
@ApiBearerAuth()
@Controller("catalogs")
export class CatalogsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @RequirePermissions(COMPANY_PERMISSIONS.VIEW)
  @Get("geography")
  @ApiOperation({ summary: "Consultar departamentos, municipios y distritos" })
  async geography() {
    const data = await this.organizationService.catalogs();
    return { success: true, message: "Catálogos obtenidos correctamente", data };
  }
}
