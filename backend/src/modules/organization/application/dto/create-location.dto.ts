import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class CreateLocationDto {
  @IsInt()
  warehouseId: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  code: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  aisle: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  rack: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  level: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  position: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
