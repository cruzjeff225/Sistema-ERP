import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { OrganizationService } from "../../application/services/organization.service";

@ApiTags("catalogs")
@ApiBearerAuth()
@Controller("catalogs")
export class CatalogsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get("geography")
  @ApiOperation({ summary: "Consultar departamentos, municipios y distritos" })
  async geography() {
    const data = await this.organizationService.catalogs();
    return { success: true, message: "Catálogos obtenidos correctamente", data };
  }

  @Get("countries")
  @ApiOperation({ summary: "Consultar paises disponibles" })
  async countries() {
    const data = await this.organizationService.countries();
    return { success: true, message: "Paises obtenidos correctamente", data };
  }
}
