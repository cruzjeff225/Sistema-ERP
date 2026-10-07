import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ConsolidationDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateFrom: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateTo: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) requestIds: number[];
}
export class GeneralWarehouseDto {
  @IsInt() @Min(1) warehouseId: number;
}
export class ConsolidationLineDto {
  @IsOptional() @IsInt() @Min(1) expectedRevision?: number;
  @IsInt() @Min(1) productId: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(0) @Max(9999999999) purchaseQuantity: number;
  @IsString() @MaxLength(1000) reason: string;
}
export class QuantityReviewDto {
  @IsInt() @Min(1) expectedRevision: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class RfqDto {
  @IsInt() @Min(1) supplierId: number;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) lineIds: number[];
}
export class AwardLineDto {
  @IsInt() @Min(1) quotationDetailId: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(1) @Max(9999999999) quantity: number;
}
export class AwardDto {
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) expectedComparisonHash?: string;
  @IsOptional() @IsBoolean() submitForApproval?: boolean;
  @IsOptional() @IsBoolean() acceptPartialComparison?: boolean;
  @IsOptional() @IsUUID() requestId?: string;
  @IsInt() @Min(1) branchId: number;
  @IsInt() @Min(1) warehouseId: number;
  @IsArray() @ArrayMinSize(1) @ArrayUnique((l: AwardLineDto) => l.quotationDetailId)
  @ValidateNested({ each: true }) @Type(() => AwardLineDto) details: AwardLineDto[];
}
export class ComparePurchaseDto {
  @IsOptional() @IsArray() @ArrayUnique((l:AwardLineDto)=>l.quotationDetailId)
  @ValidateNested({each:true}) @Type(()=>AwardLineDto) details?: AwardLineDto[];
}
export class PlacementDto {
  @IsInt() @Min(1) locationId: number;
  @IsString() @MaxLength(100) barcode: string;
  @IsBoolean() confirmed: boolean;
}
export class TransferLineDto {
  @IsInt() @Min(1) requestDetailId: number;
  @IsInt() @Min(1) fromLocationId: number;
  @IsInt() @Min(1) toLocationId: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(1) @Max(9999999999) quantity: number;
}
export class TransferDto {
  @IsUUID() requestId: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique((line: TransferLineDto) => `${line?.requestDetailId}:${line?.fromLocationId}:${line?.toLocationId}`)
  @ValidateNested({ each: true }) @Type(() => TransferLineDto) items: TransferLineDto[];
}
export class TransferReceiptLineDto {
  @IsInt() @Min(1) itemId: number;
  @IsInt({ message: "La cantidad de productos debe ser un número entero" }) @Min(1) quantity: number;
  @IsInt() @Min(1) locationId: number;
}
export class TransferReceiptDto {
  @IsUUID() requestId: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique((l: TransferReceiptLineDto) => l.itemId)
  @ValidateNested({ each: true }) @Type(() => TransferReceiptLineDto) items: TransferReceiptLineDto[];
}
export class ActualExpenseDto {
  @IsOptional() @IsInt() @Min(1) plannedExpenseId?: number;
  @IsInt() @Min(1) expenseTypeId: number;
  @IsString() @MaxLength(100) reference: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount: number;
  @IsIn(['freight', 'expense', 'dai']) category: string;
  @IsBoolean() capitalizable: boolean;
}
