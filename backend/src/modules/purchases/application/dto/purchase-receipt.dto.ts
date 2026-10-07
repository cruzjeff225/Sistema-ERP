import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class QueryReceiptsDto {
  @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(100)
  search?: string;

  @ValidateIf((_, value) => value !== undefined) @IsIn(["RECEIVED", "VERIFIED", "COSTED", "CLOSED", "CANCELLED"])
  status?: string;

  @ValidateIf((_, value) => value !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  dateFrom?: string;

  @ValidateIf((_, value) => value !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  dateTo?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ obj, key }) => obj[key] === true || obj[key] === 'true' ? true : obj[key] === false || obj[key] === 'false' ? false : obj[key])
  @IsBoolean()
  pendingOnly?: boolean;
}

export class UpdateReceiptDto {
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(100)
  supplierInvoiceNumber?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null) @IsDateString()
  supplierInvoiceDate?: string | null;

  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(2000)
  notes?: string;
}
