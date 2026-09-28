import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class QueryReceiptsDto {
  @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(100)
  search?: string;

  @ValidateIf((_, value) => value !== undefined) @IsIn(["RECEIVED", "VERIFIED", "COSTED", "CLOSED", "CANCELLED"])
  status?: string;
}

export class UpdateReceiptDto {
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(100)
  supplierInvoiceNumber?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null) @IsDateString()
  supplierInvoiceDate?: string | null;

  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(2000)
  notes?: string;
}
