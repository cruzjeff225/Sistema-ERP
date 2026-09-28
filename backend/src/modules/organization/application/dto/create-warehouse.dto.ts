import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateWarehouseDto {
  @IsInt()
  branchId: number;

  @IsInt()
  categoryId: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
