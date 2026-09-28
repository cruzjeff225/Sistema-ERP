import { Transform, Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from "class-validator";

const trimText = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/i;

export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  subcategoryId: number;

  @IsString()
  @IsNotEmpty()
  @Transform(trimText)
  @Matches(SKU_PATTERN, { message: "El SKU debe tener entre 3 y 80 caracteres y usar solo letras, números, punto, guion, guion bajo o barra" })
  @MaxLength(80)
  sku: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimText)
  @MinLength(3, { message: "El nombre del producto debe tener al menos 3 caracteres" })
  @Matches(/\S/, { message: "El nombre del producto no puede contener solo espacios" })
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  @MaxLength(100)
  originalCode?: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  @MaxLength(100)
  size?: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  @MaxLength(150)
  dimensions?: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @Transform(trimText)
  @MaxLength(150)
  presentation?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  purchaseUnitId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  saleUnitId: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;
}
