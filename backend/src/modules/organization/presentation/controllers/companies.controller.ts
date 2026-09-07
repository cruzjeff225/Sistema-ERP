import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { COMPANY_PERMISSIONS } from "../../../../common/constants/organization-permissions.constant";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateCompanyDto } from "../../application/dto/create-company.dto";
import { UpdateCompanyDto } from "../../application/dto/update-company.dto";
import { UpdateOrganizationStatusDto } from "../../application/dto/update-status.dto";
import { OrganizationService } from "../../application/services/organization.service";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";

@ApiTags("companies")
@ApiBearerAuth()
@Controller("companies")
export class CompaniesController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  @RequirePermissions(COMPANY_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar empresas" })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.companies(user);
    return { success: true, message: "Empresas obtenidas correctamente", data };
  }

  @RequirePermissions(COMPANY_PERMISSIONS.VIEW)
  @Get(":id")
  @ApiOperation({ summary: "Obtener empresa por ID" })
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    await this.companyScope.resolve(user, String(id), true);
    const data = await this.organizationService.company(id);
    return { success: true, message: "Empresa obtenida correctamente", data };
  }

  @RequirePermissions(COMPANY_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar empresa" })
  async create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.organizationService.createCompany(dto, user.sub);
    return { success: true, message: "Empresa registrada correctamente", data };
  }

  @RequirePermissions(COMPANY_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar empresa" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.companyScope.resolve(user, String(id), true);
    const data = await this.organizationService.updateCompany(id, dto, user.sub);
    return { success: true, message: "Empresa actualizada correctamente", data };
  }

  @RequireStatusPermissions(COMPANY_PERMISSIONS.ACTIVATE, COMPANY_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar empresa" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.companyScope.resolve(user, String(id), true);
    const data = await this.organizationService.updateCompanyStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado de empresa actualizado correctamente", data };
  }
}
