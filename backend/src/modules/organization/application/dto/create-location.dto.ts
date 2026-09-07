import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class CreateLocationDto {
  @IsInt()
  warehouseId: number;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  aisle: string;

  @IsString()
  @IsNotEmpty()
  rack: string;

  @IsString()
  @IsNotEmpty()
  level: string;

  @IsString()
  @IsNotEmpty()
  position: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
