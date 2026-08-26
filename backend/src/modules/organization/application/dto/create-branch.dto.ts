import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class CreateBranchDto {
  @IsInt()
  companyId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsInt()
  departmentId: number;

  @IsInt()
  municipalityId: number;

  @IsInt()
  districtId: number;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+() .-]{7,25}$/, { message: "El telefono no tiene un formato valido" })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
