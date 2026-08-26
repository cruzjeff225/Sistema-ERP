import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { WAREHOUSE_PERMISSIONS } from "../../../../common/constants/organization-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateWarehouseDto } from "../../application/dto/create-warehouse.dto";
import { UpdateOrganizationStatusDto } from "../../application/dto/update-status.dto";
import { UpdateWarehouseDto } from "../../application/dto/update-warehouse.dto";
import { OrganizationService } from "../../application/services/organization.service";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";

@ApiTags("warehouses")
@ApiBearerAuth()
@Controller("warehouses")
export class WarehousesController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  @RequirePermissions(WAREHOUSE_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar almacenes" })
  async findAll(@Query("branchId") branchId: string | undefined, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.warehouses(branchId ? Number(branchId) : undefined, companyId);
    return { success: true, message: "Almacenes obtenidos correctamente", data };
  }

  @RequirePermissions(WAREHOUSE_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar almacén" })
  async create(@Body() dto: CreateWarehouseDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.createWarehouse(dto, user.sub, companyId);
    return { success: true, message: "Almacén registrado correctamente", data };
  }

  @RequirePermissions(WAREHOUSE_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar almacén" })
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateWarehouseDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.updateWarehouse(id, dto, user.sub, companyId);
    return { success: true, message: "Almacén actualizado correctamente", data };
  }

  @RequireStatusPermissions(WAREHOUSE_PERMISSIONS.ACTIVATE, WAREHOUSE_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar almacén" })
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateOrganizationStatusDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.updateWarehouseStatus(id, dto.isActive, user.sub, companyId);
    return { success: true, message: "Estado de almacén actualizado correctamente", data };
  }
}
