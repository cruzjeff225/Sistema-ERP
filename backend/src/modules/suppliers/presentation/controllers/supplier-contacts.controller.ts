import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SUPPLIER_CONTACT_PERMISSIONS } from "../../../../common/constants/supplier-permissions.constant";
import { RequireAnyPermission, RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateSupplierContactDto } from "../../application/dto/create-supplier-contact.dto";
import { UpdateSupplierContactDto } from "../../application/dto/update-supplier-contact.dto";
import { UpdateSupplierStatusDto } from "../../application/dto/update-supplier-status.dto";
import { SuppliersService } from "../../application/services/suppliers.service";

@ApiTags("supplier-contacts")
@ApiBearerAuth()
@Controller("supplier-contacts")
export class SupplierContactsController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @RequirePermissions(SUPPLIER_CONTACT_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Consultar contactos por proveedor" })
  async findAll(
    @Query("supplierId", ParseIntPipe) supplierId: number,
    @Query("activeOnly") activeOnly?: string,
  ) {
    const data = await this.suppliersService.contacts(supplierId, activeOnly === "true");
    return { success: true, message: "Contactos obtenidos correctamente", data };
  }

  @RequirePermissions(SUPPLIER_CONTACT_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar contacto de proveedor" })
  async create(@Body() dto: CreateSupplierContactDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.suppliersService.createContact(dto, user.sub);
    return { success: true, message: "Contacto registrado correctamente", data };
  }

  @RequirePermissions(SUPPLIER_CONTACT_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Modificar contacto de proveedor" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.suppliersService.updateContact(id, dto, user.sub);
    return { success: true, message: "Contacto actualizado correctamente", data };
  }

  @RequireAnyPermission(SUPPLIER_CONTACT_PERMISSIONS.ACTIVATE, SUPPLIER_CONTACT_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar contacto" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.suppliersService.updateContactStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado del contacto actualizado correctamente", data };
  }
}
