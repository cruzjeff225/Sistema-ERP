import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateProductUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsIn(["purchase", "sale"])
  type: "purchase" | "sale";
}
