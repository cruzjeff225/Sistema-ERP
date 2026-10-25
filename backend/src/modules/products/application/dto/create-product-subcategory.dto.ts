import { Transform, Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from "class-validator";

export class CreateProductSubcategoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MinLength(2, { message: "La subcategoría debe tener al menos 2 caracteres" })
  @Matches(/\S/, { message: "La subcategoría no puede contener solo espacios" })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MaxLength(300)
  description?: string;
}
