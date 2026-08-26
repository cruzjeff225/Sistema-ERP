import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export const SUPPLIER_CONTACT_ROLES = ["General", "Compras", "Repartidor", "Despacho", "Facturación", "Gerencia"] as const;

export class CreateSupplierContactDto {
  @IsInt()
  supplierId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @IsOptional()
  @IsIn(SUPPLIER_CONTACT_ROLES)
  role?: (typeof SUPPLIER_CONTACT_ROLES)[number];

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+() .-]{7,25}$/, { message: "El telefono no tiene un formato valido" })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
