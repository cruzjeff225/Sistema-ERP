import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional } from "class-validator";

export class QueryProductCatalogDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsIn(["purchase", "sale"])
  type?: "purchase" | "sale";
}
