import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from "class-validator";

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  commercialName: string;

  @IsString()
  @IsNotEmpty()
  nit: string;

  @IsString()
  @IsNotEmpty()
  nrc: string;

  @IsOptional()
  @IsString()
  commercialLine1?: string;

  @IsOptional()
  @IsString()
  commercialLine2?: string;

  @IsOptional()
  @IsString()
  commercialLine3?: string;

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

  @IsOptional()
  @IsUrl({ require_protocol: false })
  webSite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2800000)
  @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, {
    message: "El logo debe ser una imagen PNG, JPEG o WEBP valida",
  })
  logo?: string;
}
