import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SUPPLIER_PERMISSIONS } from "../../../../common/constants/supplier-permissions.constant";
import { RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { SuppliersService } from "../../application/services/suppliers.service";

@ApiTags("supplier-catalogs")
@ApiBearerAuth()
@Controller("supplier-catalogs")
export class SupplierCatalogsController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @RequirePermissions(SUPPLIER_PERMISSIONS.VIEW)
  @Get("countries")
  @ApiOperation({ summary: "Consultar paises disponibles" })
  async countries() {
    const data = await this.suppliersService.countries();
    return { success: true, message: "Paises obtenidos correctamente", data };
  }
}
