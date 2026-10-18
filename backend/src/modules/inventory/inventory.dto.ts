import { Type, Transform } from "class-transformer";
import { ArrayMinSize, ArrayUnique, IsArray, ValidateNested, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, NotEquals } from "class-validator";

export const MOVEMENT_TYPES = ['OPENING', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RETURN'];

export class InventoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) warehouseId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) productId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) locationId?: number;
  @IsOptional() @IsIn(MOVEMENT_TYPES) type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) lotId?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateTo?: string;
}

export class InventoryAdjustmentDto {
  @IsInt() @Min(1) productId!: number;
  @IsInt() @Min(1) locationId!: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(-9999999999.99) @Max(9999999999) @NotEquals(0) quantity!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsUUID() requestId!: string;
  /** Lote a descontar o al que se reintegra; sin él, las salidas siguen FIFO y las entradas crean un lote de ajuste. */
  @IsOptional() @IsInt() @Min(1) lotId?: number;
}

export class WarehouseMapQueryDto {
  @Type(() => Number) @IsInt() @Min(1) warehouseId!: number;
}

export class RelocationDto {
  @IsInt() @Min(1) lotId!: number;
  @IsInt() @Min(1) fromLocationId!: number;
  @IsInt() @Min(1) toLocationId!: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(1) @Max(9999999999) quantity!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsUUID() requestId!: string;
}

export class ReturnDto {
  @IsInt() @Min(1) lotId!: number;
  @IsInt() @Min(1) locationId!: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(1) @Max(9999999999) quantity!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsUUID() requestId!: string;
  /** Venta de origen, cuando la devolución proviene de una. */
  @IsOptional() @IsInt() @Min(1) saleId?: number;
}

export class SaleLineDto {
  @IsInt() @Min(1) productId!: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(1) @Max(9999999999) quantity!: number;
}

export class SaleDeliveryDto {
  @IsUUID() requestId!: string;
  @IsInt() @Min(1) branchId!: number;
  @IsOptional() @IsInt() @Min(1) saleId?: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique((line: SaleLineDto) => line?.productId) @ValidateNested({ each: true }) @Type(() => SaleLineDto) lines!: SaleLineDto[];
}

export class SaleReversalDto {
  /** Referencia con la que se registró la entrega que se anula. */
  @IsUUID() requestId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class AvailabilityQueryDto {
  @Type(() => Number) @IsInt() @Min(1) branchId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) productId?: number;
}

export class KardexQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(500) limit = 100;
  @Type(() => Number) @IsInt() @Min(1) productId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) lotId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) warehouseId?: number;
  @IsOptional() @IsIn(MOVEMENT_TYPES) type?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateTo?: string;
}

export class LotQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) productId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) warehouseId?: number;
  @IsOptional() @IsIn(['ACTIVE', 'DEPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() onlyAvailable?: boolean;
}

export class LabelPrintDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) quantity!: number;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(255) reprintReason?: string;
}
