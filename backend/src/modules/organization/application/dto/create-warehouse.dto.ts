import { IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateWarehouseDto {
  @IsInt()
  branchId: number;

  @IsInt()
  categoryId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
