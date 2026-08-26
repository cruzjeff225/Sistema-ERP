import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ProductsService } from "./application/services/products.service";
import { ProductCategoriesController } from "./presentation/controllers/product-categories.controller";
import { ProductImagesController } from "./presentation/controllers/product-images.controller";
import { ProductSubcategoriesController } from "./presentation/controllers/product-subcategories.controller";
import { ProductSuppliersController } from "./presentation/controllers/product-suppliers.controller";
import { ProductUnitsController } from "./presentation/controllers/product-units.controller";
import { ProductsController } from "./presentation/controllers/products.controller";

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    ProductCategoriesController,
    ProductSubcategoriesController,
    ProductUnitsController,
    ProductImagesController,
    ProductSuppliersController,
  ],
  providers: [ProductsService],
})
export class ProductsModule {}
