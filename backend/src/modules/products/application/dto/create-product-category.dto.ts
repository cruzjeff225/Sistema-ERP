import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MinLength(2, { message: "La categoría debe tener al menos 2 caracteres" })
  @Matches(/\S/, { message: "La categoría no puede contener solo espacios" })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MaxLength(300)
  description?: string;
}
