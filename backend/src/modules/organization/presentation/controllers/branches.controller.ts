import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { BRANCH_PERMISSIONS } from "../../../../common/constants/organization-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateBranchDto } from "../../application/dto/create-branch.dto";
import { UpdateBranchDto } from "../../application/dto/update-branch.dto";
import { UpdateOrganizationStatusDto } from "../../application/dto/update-status.dto";
import { OrganizationService } from "../../application/services/organization.service";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";

@ApiTags("branches")
@ApiBearerAuth()
@Controller("branches")
export class BranchesController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  @RequirePermissions(BRANCH_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar sucursales" })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.branches(companyId);
    return { success: true, message: "Sucursales obtenidas correctamente", data };
  }

  @RequirePermissions(BRANCH_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar sucursal" })
  async create(@Body() dto: CreateBranchDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.createBranch({ ...dto, companyId }, user.sub, companyId);
    return { success: true, message: "Sucursal registrada correctamente", data };
  }

  @RequirePermissions(BRANCH_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar sucursal" })
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.updateBranch(id, dto, user.sub, companyId);
    return { success: true, message: "Sucursal actualizada correctamente", data };
  }

  @RequireStatusPermissions(BRANCH_PERMISSIONS.ACTIVATE, BRANCH_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar sucursal" })
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateOrganizationStatusDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.organizationService.updateBranchStatus(id, dto.isActive, user.sub, companyId);
    return { success: true, message: "Estado de sucursal actualizado correctamente", data };
  }
}
