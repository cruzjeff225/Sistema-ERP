import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class QuerySupplierContactsDto {
  @Type(() => Number)
  @IsInt()
  supplierId: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activeOnly?: boolean;
}
