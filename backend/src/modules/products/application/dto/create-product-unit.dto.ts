import { Transform } from "class-transformer";
import { IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateProductUnitDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MinLength(2, { message: "La unidad debe tener al menos 2 caracteres" })
  @Matches(/\S/, { message: "La unidad no puede contener solo espacios" })
  @MaxLength(60)
  name: string;

  @IsIn(["purchase", "sale"])
  type: "purchase" | "sale";
}
