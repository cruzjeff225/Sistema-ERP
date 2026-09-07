import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { WAREHOUSE_CATEGORY_PERMISSIONS } from "../../../../common/constants/organization-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateWarehouseCategoryDto } from "../../application/dto/create-warehouse-category.dto";
import { UpdateOrganizationStatusDto } from "../../application/dto/update-status.dto";
import { UpdateWarehouseCategoryDto } from "../../application/dto/update-warehouse-category.dto";
import { OrganizationService } from "../../application/services/organization.service";

@ApiTags("warehouse-categories")
@ApiBearerAuth()
@Controller("warehouse-categories")
export class WarehouseCategoriesController {
  constructor(private readonly organizationService: OrganizationService) {}

  @RequirePermissions(WAREHOUSE_CATEGORY_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar categorías de almacén" })
  async findAll() {
    const data = await this.organizationService.warehouseCategories();
    return { success: true, message: "Categorías obtenidas correctamente", data };
  }

  @RequirePermissions(WAREHOUSE_CATEGORY_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar categoría de almacén" })
  async create(@Body() dto: CreateWarehouseCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.createWarehouseCategory(dto, user.sub);
    return { success: true, message: "Categoría registrada correctamente", data };
  }

  @RequirePermissions(WAREHOUSE_CATEGORY_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar categoría de almacén" })
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateWarehouseCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.updateWarehouseCategory(id, dto, user.sub);
    return { success: true, message: "Categoría actualizada correctamente", data };
  }

  @RequireStatusPermissions(WAREHOUSE_CATEGORY_PERMISSIONS.UPDATE, WAREHOUSE_CATEGORY_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar categoría de almacén" })
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateOrganizationStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.updateWarehouseCategoryStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado de categoría actualizado correctamente", data };
  }
}
