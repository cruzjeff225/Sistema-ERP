import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CUSTOMER_PERMISSIONS } from "../../../../common/constants/customer-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateCustomerDto } from "../../application/dto/create-customer.dto";
import { UpdateCustomerDto } from "../../application/dto/update-customer.dto";
import { UpdateCustomerStatusDto } from "../../application/dto/update-customer-status.dto";
import { CustomersService } from "../../application/services/customers.service";
import { QueryCustomersDto } from '../../application/dto/query-customers.dto';

@ApiTags("customers")
@ApiBearerAuth()
@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService, private readonly companyScope: CompanyScopeService) {}

  @RequirePermissions(CUSTOMER_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Consultar clientes" })
  async findAll(@Query() query: QueryCustomersDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.customersService.customers(await this.companyScope.resolve(user, companyHeader), query);
    return { success: true, message: "Clientes obtenidos correctamente", data };
  }

  @RequirePermissions(CUSTOMER_PERMISSIONS.VIEW)
  @Get(":id")
  @ApiOperation({ summary: "Consultar cliente" })
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.customersService.customer(id, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Cliente obtenido correctamente", data };
  }

  @RequirePermissions(CUSTOMER_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar cliente" })
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.customersService.create(dto, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Cliente registrado correctamente", data };
  }

  @RequirePermissions(CUSTOMER_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Modificar cliente" })
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.customersService.update(id, dto, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Cliente actualizado correctamente", data };
  }

  @RequireStatusPermissions(CUSTOMER_PERMISSIONS.ACTIVATE, CUSTOMER_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar cliente" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    const data = await this.customersService.updateStatus(id, dto.isActive, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Estado del cliente actualizado", data };
  }
}
