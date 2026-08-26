import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProductSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierCode?: string;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}
