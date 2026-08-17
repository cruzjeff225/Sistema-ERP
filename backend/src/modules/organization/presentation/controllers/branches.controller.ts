import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { BRANCH_PERMISSIONS } from "../../../../common/constants/organization-permissions.constant";
import { RequireAnyPermission, RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateBranchDto } from "../../application/dto/create-branch.dto";
import { UpdateBranchDto } from "../../application/dto/update-branch.dto";
import { UpdateStatusDto } from "../../application/dto/update-status.dto";
import { OrganizationService } from "../../application/services/organization.service";

@ApiTags("branches")
@ApiBearerAuth()
@Controller("branches")
export class BranchesController {
  constructor(private readonly organizationService: OrganizationService) {}

  @RequirePermissions(BRANCH_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar sucursales" })
  async findAll(@Query("companyId") companyId?: string) {
    const data = await this.organizationService.branches(companyId ? Number(companyId) : undefined);
    return { success: true, message: "Sucursales obtenidas correctamente", data };
  }

  @RequirePermissions(BRANCH_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar sucursal" })
  async create(@Body() dto: CreateBranchDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.createBranch(dto, user.sub);
    return { success: true, message: "Sucursal registrada correctamente", data };
  }

  @RequirePermissions(BRANCH_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar sucursal" })
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.updateBranch(id, dto, user.sub);
    return { success: true, message: "Sucursal actualizada correctamente", data };
  }

  @RequireAnyPermission(BRANCH_PERMISSIONS.ACTIVATE, BRANCH_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar sucursal" })
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.updateBranchStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado de sucursal actualizado correctamente", data };
  }
}
