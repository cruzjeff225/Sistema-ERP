import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}
