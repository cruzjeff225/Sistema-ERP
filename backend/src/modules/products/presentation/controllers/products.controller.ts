import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PRODUCT_PERMISSIONS } from "../../../../common/constants/product-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateProductDto } from "../../application/dto/create-product.dto";
import { QueryProductsDto } from "../../application/dto/query-products.dto";
import { UpdateProductDto } from "../../application/dto/update-product.dto";
import { UpdateProductStatusDto } from "../../application/dto/update-product-status.dto";
import { ProductsService } from "../../application/services/products.service";

@ApiTags("products")
@ApiBearerAuth()
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService, private readonly companyScope: CompanyScopeService) {}

  @RequirePermissions(PRODUCT_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Consultar y buscar productos" })
  async findAll(@Query() query: QueryProductsDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.products(query, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Productos obtenidos correctamente", data };
  }

  @RequirePermissions(PRODUCT_PERMISSIONS.VIEW)
  @Get("catalogs")
  @ApiOperation({ summary: "Consultar catálogos disponibles para productos" })
  async catalogs(@CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.catalogs(await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Catálogos obtenidos correctamente", data };
  }

  @RequirePermissions(PRODUCT_PERMISSIONS.VIEW)
  @Get(":id")
  @ApiOperation({ summary: "Consultar detalle de producto" })
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.product(id, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Producto obtenido correctamente", data };
  }

  @RequirePermissions(PRODUCT_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar producto" })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.createProduct(dto, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Producto registrado correctamente", data };
  }

  @RequirePermissions(PRODUCT_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Modificar producto" })
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.updateProduct(id, dto, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Producto actualizado correctamente", data };
  }

  @RequireStatusPermissions(PRODUCT_PERMISSIONS.ACTIVATE, PRODUCT_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar producto" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProductStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    const data = await this.productsService.updateProductStatus(id, dto.isActive, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Estado del producto actualizado correctamente", data };
  }
}
