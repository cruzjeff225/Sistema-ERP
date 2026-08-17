import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateSupplierContactDto {
  @IsInt()
  supplierId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+() .-]{7,25}$/, { message: "El telefono no tiene un formato valido" })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
