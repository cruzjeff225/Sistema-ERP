import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateProductSupplierDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MaxLength(100)
  supplierCode?: string;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}
