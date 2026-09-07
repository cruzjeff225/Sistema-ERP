import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SUPPLIER_PERMISSIONS } from "../../../../common/constants/supplier-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateSupplierDto } from "../../application/dto/create-supplier.dto";
import { QuerySuppliersDto } from "../../application/dto/query-suppliers.dto";
import { UpdateSupplierStatusDto } from "../../application/dto/update-supplier-status.dto";
import { UpdateSupplierDto } from "../../application/dto/update-supplier.dto";
import { SuppliersService } from "../../application/services/suppliers.service";

@ApiTags("suppliers")
@ApiBearerAuth()
@Controller("suppliers")
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  @RequirePermissions(SUPPLIER_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Consultar y buscar proveedores" })
  async findAll(@Query() query: QuerySuppliersDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.suppliers(query, companyId);
    return { success: true, message: "Proveedores obtenidos correctamente", data };
  }

  @RequirePermissions(SUPPLIER_PERMISSIONS.VIEW)
  @Get(":id/history")
  @ApiOperation({ summary: "Consultar historial del proveedor" })
  async history(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.history(id, companyId);
    return { success: true, message: "Historial obtenido correctamente", data };
  }

  @RequirePermissions(SUPPLIER_PERMISSIONS.VIEW)
  @Get(":id/purchases")
  @ApiOperation({ summary: "Consultar compras realizadas al proveedor" })
  async purchases(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.purchases(id, companyId);
    return { success: true, message: "Compras del proveedor obtenidas correctamente", data };
  }

  @RequirePermissions(SUPPLIER_PERMISSIONS.VIEW)
  @Get(":id")
  @ApiOperation({ summary: "Consultar proveedor y sus contactos" })
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.supplier(id, companyId);
    return { success: true, message: "Proveedor obtenido correctamente", data };
  }

  @RequirePermissions(SUPPLIER_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar proveedor" })
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.createSupplier(dto, user.sub, companyId);
    return { success: true, message: "Proveedor registrado correctamente", data };
  }

  @RequirePermissions(SUPPLIER_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Modificar proveedor" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.updateSupplier(id, dto, user.sub, companyId);
    return { success: true, message: "Proveedor actualizado correctamente", data };
  }

  @RequireStatusPermissions(SUPPLIER_PERMISSIONS.ACTIVATE, SUPPLIER_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar proveedor" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.updateSupplierStatus(id, dto.isActive, user.sub, companyId);
    return { success: true, message: "Estado del proveedor actualizado correctamente", data };
  }
}
