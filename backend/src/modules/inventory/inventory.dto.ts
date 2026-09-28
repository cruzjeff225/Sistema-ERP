import { Type, Transform } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, NotEquals } from "class-validator";

export class InventoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) warehouseId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) productId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) locationId?: number;
  @IsOptional() @IsIn(['OPENING', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT']) type?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateTo?: string;
}

export class InventoryAdjustmentDto {
  @IsInt() @Min(1) productId!: number;
  @IsInt() @Min(1) locationId!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(-9999999999.99) @Max(9999999999.99) @NotEquals(0) quantity!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsUUID() requestId!: string;
}

export class WarehouseMapQueryDto {
  @Type(() => Number) @IsInt() @Min(1) warehouseId!: number;
}
