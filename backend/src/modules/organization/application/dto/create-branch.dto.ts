import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";

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
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
