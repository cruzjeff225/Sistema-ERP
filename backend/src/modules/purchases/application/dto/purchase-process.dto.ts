import { PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class QueryPurchaseDocumentsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  search?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(40)
  status?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestId?: number;
}

export class PurchaseRequestLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitId: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(1000)
  notes?: string;
}

export class CreatePurchaseRequestDto {
  @IsIn(["resale", "operations", "mixed"], { message: "Seleccione la finalidad de compra: reventa, operacion o mixta" })
  purpose: "resale" | "operations" | "mixed";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  warehouseId: number;

  @IsDateString()
  requiredDate: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trim)
  @MaxLength(1000)
  justification: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  details: PurchaseRequestLineDto[];
}

export class UpdatePurchaseRequestDto extends PartialType(CreatePurchaseRequestDto, { skipNullProperties: false }) {}

export class QuotationSourceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestDetailId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;
}

export class PurchaseQuotationLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryDays?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  availableQuantity: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((source: QuotationSourceDto) => source.requestDetailId)
  @ValidateNested({ each: true })
  @Type(() => QuotationSourceDto)
  sources: QuotationSourceDto[];
}

export class PurchaseExpenseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expenseTypeId: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}

export class CreatePurchaseQuotationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  requestIds: number[];

  @IsDateString()
  quotationDate: string;

  @IsDateString()
  validUntil: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  paymentTerms?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryDays?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseQuotationLineDto)
  details: PurchaseQuotationLineDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseExpenseDto)
  expenses?: PurchaseExpenseDto[];
}

export class UpdatePurchaseQuotationDto extends PartialType(CreatePurchaseQuotationDto, { skipNullProperties: false }) {}

export class OrderExpenseDto extends PurchaseExpenseDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;
}

export class PurchaseOrderSelectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quotationDetailId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;
}

export class GeneratePurchaseOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  warehouseId: number;

  @IsDateString()
  expectedDate: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  notes?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((line: PurchaseOrderSelectionDto) => line.quotationDetailId)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderSelectionDto)
  details?: PurchaseOrderSelectionDto[];
}

export class UpdatePurchaseOrderDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  expectedDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  paymentTerms?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  notes?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderExpenseDto)
  expenses?: OrderExpenseDto[];
}

export class WorkflowReasonDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  reason?: string;
}

export class ReceivePurchaseOrderLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderDetailId: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;
}

export class ReceivePurchaseOrderDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  requestId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  supplierInvoiceNumber?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  supplierInvoiceDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  items: ReceivePurchaseOrderLineDto[];
}

export class CreateExpenseTypeDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trim)
  @MaxLength(100)
  name: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  description?: string;
}

export class UpdateExpenseTypeDto extends PartialType(CreateExpenseTypeDto, { skipNullProperties: false }) {}

export class UpdateExpenseTypeStatusDto {
  @IsBoolean()
  isActive: boolean;
}

export class QueryRetaceosDto extends QueryPurchaseDocumentsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purchaseId?: number;
}

export class RetaceoFobLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purchaseItemId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costFob: number;
}

export class CreateRetaceoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purchaseId: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  retaceoDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  originCountry?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  importInvoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  importInvoiceDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  importPolicyNumber?: string;

  @IsOptional()
  @IsDateString()
  importPolicyDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalFreight?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalExpenses?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalDai?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  importVat?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((line: RetaceoFobLineDto) => line.purchaseItemId)
  @ValidateNested({ each: true })
  @Type(() => RetaceoFobLineDto)
  details: RetaceoFobLineDto[];
}

export class UpdateRetaceoDto extends PartialType(CreateRetaceoDto, { skipNullProperties: false }) {}
