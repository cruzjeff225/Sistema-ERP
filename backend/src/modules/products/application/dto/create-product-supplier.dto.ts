import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateProductSupplierDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsInt()
  supplierId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierCode?: string;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}
