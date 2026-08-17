import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from "class-validator";

export class CreateSupplierDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/, { message: "El codigo solo puede contener letras, numeros, guiones y guion bajo" })
  @MaxLength(40)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsInt()
  countryId: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+() .-]{7,25}$/, { message: "El telefono no tiene un formato valido" })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl({ require_protocol: false })
  website?: string;
}
