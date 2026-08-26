import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PRODUCT_UNIT_PERMISSIONS } from "../../../../common/constants/product-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateProductUnitDto } from "../../application/dto/create-product-unit.dto";
import { QueryProductCatalogDto } from "../../application/dto/query-product-catalog.dto";
import { UpdateProductStatusDto } from "../../application/dto/update-product-status.dto";
import { UpdateProductUnitDto } from "../../application/dto/update-product-unit.dto";
import { ProductsService } from "../../application/services/products.service";

@ApiTags("product-units")
@ApiBearerAuth()
@Controller("product-units")
export class ProductUnitsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions(PRODUCT_UNIT_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryProductCatalogDto) {
    const data = await this.productsService.units(query.type);
    return { success: true, message: "Unidades obtenidas correctamente", data };
  }

  @RequirePermissions(PRODUCT_UNIT_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Registrar unidad de compra o venta" })
  async create(@Body() dto: CreateProductUnitDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.createUnit(dto, user.sub);
    return { success: true, message: "Unidad registrada correctamente", data };
  }

  @RequirePermissions(PRODUCT_UNIT_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductUnitDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.updateUnit(id, dto, user.sub);
    return { success: true, message: "Unidad actualizada correctamente", data };
  }

  @RequireStatusPermissions(PRODUCT_UNIT_PERMISSIONS.ACTIVATE, PRODUCT_UNIT_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.productsService.updateUnitStatus(id, dto.isActive, user.sub);
    return { success: true, message: "Estado de unidad actualizado correctamente", data };
  }
}
