import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateWarehouseCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
