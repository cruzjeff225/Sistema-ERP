import { BadRequestException, Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PRODUCT_SUPPLIER_PERMISSIONS } from "../../../../common/constants/product-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateProductSupplierDto } from "../../application/dto/create-product-supplier.dto";
import { QueryProductCatalogDto } from "../../application/dto/query-product-catalog.dto";
import { UpdateProductStatusDto } from "../../application/dto/update-product-status.dto";
import { UpdateProductSupplierDto } from "../../application/dto/update-product-supplier.dto";
import { ProductsService } from "../../application/services/products.service";

@ApiTags("product-suppliers")
@ApiBearerAuth()
@Controller("product-suppliers")
export class ProductSuppliersController {
  constructor(private readonly productsService: ProductsService, private readonly companyScope: CompanyScopeService) {}

  @RequirePermissions(PRODUCT_SUPPLIER_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryProductCatalogDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    if (!query.productId) throw new BadRequestException("Debe indicar el producto a consultar");
    const data = await this.productsService.supplierLinks(query.productId, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Proveedores asociados obtenidos correctamente", data };
  }

  @RequirePermissions(PRODUCT_SUPPLIER_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Asociar proveedor a producto" })
  async create(@Body() dto: CreateProductSupplierDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.createSupplierLink(dto, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Proveedor asociado correctamente", data };
  }

  @RequirePermissions(PRODUCT_SUPPLIER_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductSupplierDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.updateSupplierLink(id, dto, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Asociación actualizada correctamente", data };
  }

  @RequireStatusPermissions(PRODUCT_SUPPLIER_PERMISSIONS.ACTIVATE, PRODUCT_SUPPLIER_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductStatusDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.updateSupplierLinkStatus(id, dto.isActive, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Estado de asociación actualizado correctamente", data };
  }
}
