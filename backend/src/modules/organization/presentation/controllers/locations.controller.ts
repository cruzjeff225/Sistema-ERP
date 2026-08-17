import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { LOCATION_PERMISSIONS } from "../../../../common/constants/organization-permissions.constant";
import { RequireAnyPermission, RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateLocationDto } from "../../application/dto/create-location.dto";
import { UpdateLocationDto } from "../../application/dto/update-location.dto";
import { UpdateStatusDto } from "../../application/dto/update-status.dto";
import { OrganizationService } from "../../application/services/organization.service";

@ApiTags("locations")
@ApiBearerAuth()
@Controller("locations")
export class LocationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @RequirePermissions(LOCATION_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar espacios o ubicaciones" })
  async findAll(@Query("warehouseId") warehouseId?: string) {
    const data = await this.organizationService.locations(warehouseId ? Number(warehouseId) : undefined);
    return { success: true, message: "Espacios obtenidos correctamente", data };
  }

  @RequirePermissions(LOCATION_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar espacio o ubicación" })
  async create(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.createLocation(dto, user.sub);
    return { success: true, message: "Espacio registrado correctamente", data };
  }

  @RequirePermissions(LOCATION_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar espacio o ubicación" })
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateLocationDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.updateLocation(id, dto, user.sub);
    return { success: true, message: "Espacio actualizado correctamente", data };
  }

  @RequireAnyPermission(LOCATION_PERMISSIONS.ACTIVATE, LOCATION_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar espacio" })
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.updateLocationStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado de espacio actualizado correctamente", data };
  }
}
