import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PRODUCT_SUBCATEGORY_PERMISSIONS } from "../../../../common/constants/product-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateProductSubcategoryDto } from "../../application/dto/create-product-subcategory.dto";
import { QueryProductCatalogDto } from "../../application/dto/query-product-catalog.dto";
import { UpdateProductStatusDto } from "../../application/dto/update-product-status.dto";
import { UpdateProductSubcategoryDto } from "../../application/dto/update-product-subcategory.dto";
import { ProductsService } from "../../application/services/products.service";

@ApiTags("product-subcategories")
@ApiBearerAuth()
@Controller("product-subcategories")
export class ProductSubcategoriesController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions(PRODUCT_SUBCATEGORY_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryProductCatalogDto) {
    const data = await this.productsService.subcategories(query.categoryId);
    return { success: true, message: "Subcategorías obtenidas correctamente", data };
  }

  @RequirePermissions(PRODUCT_SUBCATEGORY_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar subcategoría de producto" })
  async create(@Body() dto: CreateProductSubcategoryDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.createSubcategory(dto, user.sub);
    return { success: true, message: "Subcategoría registrada correctamente", data };
  }

  @RequirePermissions(PRODUCT_SUBCATEGORY_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductSubcategoryDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.updateSubcategory(id, dto, user.sub);
    return { success: true, message: "Subcategoría actualizada correctamente", data };
  }

  @RequireStatusPermissions(PRODUCT_SUBCATEGORY_PERMISSIONS.ACTIVATE, PRODUCT_SUBCATEGORY_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.updateSubcategoryStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado de subcategoría actualizado correctamente", data };
  }
}
