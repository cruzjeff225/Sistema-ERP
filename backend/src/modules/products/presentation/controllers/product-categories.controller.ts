import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PRODUCT_CATEGORY_PERMISSIONS } from "../../../../common/constants/product-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateProductCategoryDto } from "../../application/dto/create-product-category.dto";
import { UpdateProductCategoryDto } from "../../application/dto/update-product-category.dto";
import { UpdateProductStatusDto } from "../../application/dto/update-product-status.dto";
import { ProductsService } from "../../application/services/products.service";

@ApiTags("product-categories")
@ApiBearerAuth()
@Controller("product-categories")
export class ProductCategoriesController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions(PRODUCT_CATEGORY_PERMISSIONS.VIEW)
  @Get()
  async findAll() {
    const data = await this.productsService.categories();
    return { success: true, message: "Categorías obtenidas correctamente", data };
  }

  @RequirePermissions(PRODUCT_CATEGORY_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar categoría de producto" })
  async create(@Body() dto: CreateProductCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.createCategory(dto, user.sub);
    return { success: true, message: "Categoría registrada correctamente", data };
  }

  @RequirePermissions(PRODUCT_CATEGORY_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.updateCategory(id, dto, user.sub);
    return { success: true, message: "Categoría actualizada correctamente", data };
  }

  @RequireStatusPermissions(PRODUCT_CATEGORY_PERMISSIONS.ACTIVATE, PRODUCT_CATEGORY_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.updateCategoryStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado de categoría actualizado correctamente", data };
  }
}
