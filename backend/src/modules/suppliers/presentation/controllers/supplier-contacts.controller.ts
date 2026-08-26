import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SUPPLIER_CONTACT_PERMISSIONS } from "../../../../common/constants/supplier-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateSupplierContactDto } from "../../application/dto/create-supplier-contact.dto";
import { QuerySupplierContactsDto } from "../../application/dto/query-supplier-contacts.dto";
import { UpdateSupplierContactDto } from "../../application/dto/update-supplier-contact.dto";
import { UpdateSupplierStatusDto } from "../../application/dto/update-supplier-status.dto";
import { SuppliersService } from "../../application/services/suppliers.service";

@ApiTags("supplier-contacts")
@ApiBearerAuth()
@Controller("supplier-contacts")
export class SupplierContactsController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  @RequirePermissions(SUPPLIER_CONTACT_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Consultar contactos por proveedor" })
  async findAll(@Query() query: QuerySupplierContactsDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.contacts(query, companyId);
    return { success: true, message: "Contactos obtenidos correctamente", data };
  }

  @RequirePermissions(SUPPLIER_CONTACT_PERMISSIONS.VIEW)
  @Get(":id/history")
  @ApiOperation({ summary: "Consultar historial de un contacto" })
  async history(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.contactHistory(id, companyId);
    return { success: true, message: "Historial del contacto obtenido correctamente", data };
  }

  @RequirePermissions(SUPPLIER_CONTACT_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar contacto de proveedor" })
  async create(@Body() dto: CreateSupplierContactDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.createContact(dto, user.sub, companyId);
    return { success: true, message: "Contacto registrado correctamente", data };
  }

  @RequirePermissions(SUPPLIER_CONTACT_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Modificar contacto de proveedor" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.updateContact(id, dto, user.sub, companyId);
    return { success: true, message: "Contacto actualizado correctamente", data };
  }

  @RequireStatusPermissions(SUPPLIER_CONTACT_PERMISSIONS.ACTIVATE, SUPPLIER_CONTACT_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar contacto" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const data = await this.suppliersService.updateContactStatus(id, dto.isActive, user.sub, companyId);
    return { success: true, message: "Estado del contacto actualizado correctamente", data };
  }
}
