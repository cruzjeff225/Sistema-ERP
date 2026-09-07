import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { BUSINESS_PERMISSIONS } from "../../../common/constants/business-permissions.constant";
import { RequireAnyPermission, RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { BusinessService } from "../application/business.service";

@ApiTags("business")
@ApiBearerAuth()
@Controller()
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @RequirePermissions(BUSINESS_PERMISSIONS.CUSTOMERS_VIEW)
  @Get("customers")
  customers() {
    return this.wrap("Clientes obtenidos correctamente", this.businessService.customers());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.CUSTOMERS_CREATE)
  @Post("customers")
  createCustomer(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Cliente registrado correctamente", this.businessService.createCustomer(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.CUSTOMERS_UPDATE)
  @Patch("customers/:id")
  updateCustomer(@Param("id", ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Cliente actualizado correctamente", this.businessService.updateCustomer(id, dto, user.sub));
  }

  @RequireAnyPermission(BUSINESS_PERMISSIONS.CUSTOMERS_UPDATE)
  @Patch("customers/:id/status")
  customerStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Estado de cliente actualizado", this.businessService.setStatus("customers", id, dto.isActive, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.SUPPLIERS_VIEW)
  @Get("suppliers")
  suppliers() {
    return this.wrap("Proveedores obtenidos correctamente", this.businessService.suppliers());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.SUPPLIERS_CREATE)
  @Post("suppliers")
  createSupplier(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Proveedor registrado correctamente", this.businessService.createSupplier(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.SUPPLIERS_UPDATE)
  @Patch("suppliers/:id")
  updateSupplier(@Param("id", ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Proveedor actualizado correctamente", this.businessService.updateSupplier(id, dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.PRODUCTS_VIEW)
  @Get("products")
  products() {
    return this.wrap("Productos obtenidos correctamente", this.businessService.products());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.PRODUCTS_CREATE)
  @Post("products")
  createProduct(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Producto registrado correctamente", this.businessService.createProduct(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.PRODUCTS_UPDATE)
  @Patch("products/:id")
  updateProduct(@Param("id", ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Producto actualizado correctamente", this.businessService.updateProduct(id, dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.INVENTORY_VIEW)
  @Get("inventory")
  inventory() {
    return this.wrap("Inventario obtenido correctamente", this.businessService.inventory());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.INVENTORY_UPDATE)
  @Post("inventory/adjust")
  adjustInventory(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Inventario ajustado correctamente", this.businessService.adjustInventory(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.PURCHASES_VIEW)
  @Get("purchases")
  purchases() {
    return this.wrap("Compras obtenidas correctamente", this.businessService.purchases());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.PURCHASES_CREATE)
  @Post("purchases")
  @ApiOperation({ summary: "Registrar compra y aumentar inventario" })
  createPurchase(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Compra registrada correctamente", this.businessService.createPurchase(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.QUOTATIONS_VIEW)
  @Get("quotations")
  quotations() {
    return this.wrap("Cotizaciones obtenidas correctamente", this.businessService.quotations());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.QUOTATIONS_CREATE)
  @Post("quotations")
  createQuotation(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Cotización registrada correctamente", this.businessService.createQuotation(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.SALES_VIEW)
  @Get("sales")
  sales() {
    return this.wrap("Ventas obtenidas correctamente", this.businessService.sales());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.SALES_CREATE)
  @Post("sales")
  @ApiOperation({ summary: "Registrar venta y descontar inventario" })
  createSale(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Venta registrada correctamente", this.businessService.createSale(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.TRANSFERS_VIEW)
  @Get("transfers")
  transfers() {
    return this.wrap("Traslados obtenidos correctamente", this.businessService.transfers());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.TRANSFERS_CREATE)
  @Post("transfers")
  createTransfer(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Traslado registrado correctamente", this.businessService.createTransfer(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.VEHICLES_VIEW)
  @Get("vehicles")
  vehicles() {
    return this.wrap("Vehículos obtenidos correctamente", this.businessService.vehicles());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.VEHICLES_CREATE)
  @Post("vehicles")
  createVehicle(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Vehículo registrado correctamente", this.businessService.createVehicle(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.VEHICLES_UPDATE)
  @Patch("vehicles/:id")
  updateVehicle(@Param("id", ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Vehículo actualizado correctamente", this.businessService.updateVehicle(id, dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.DRIVERS_VIEW)
  @Get("drivers")
  drivers() {
    return this.wrap("Conductores obtenidos correctamente", this.businessService.drivers());
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.DRIVERS_CREATE)
  @Post("drivers")
  createDriver(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Conductor registrado correctamente", this.businessService.createDriver(dto, user.sub));
  }

  @RequirePermissions(BUSINESS_PERMISSIONS.DRIVERS_UPDATE)
  @Patch("drivers/:id")
  updateDriver(@Param("id", ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.wrap("Conductor actualizado correctamente", this.businessService.updateDriver(id, dto, user.sub));
  }

  private async wrap(message: string, promise: Promise<unknown> | unknown) {
    const data = await promise;
    return { success: true, message, data };
  }
}
