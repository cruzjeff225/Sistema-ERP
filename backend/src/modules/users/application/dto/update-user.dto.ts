import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trimText = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const normalizedEmail = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toLocaleLowerCase() : value;
const normalizedUsername = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toLocaleLowerCase() : value;
const normalizedEmployeeCode = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toLocaleUpperCase() : value;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export class UpdateUserDto {
  @ApiProperty({ example: "usuario1", required: false })
  @IsOptional()
  @IsString()
  @Transform(normalizedUsername)
  @Matches(USERNAME_PATTERN, { message: "El usuario debe tener 3 a 50 caracteres y usar solo letras, números, punto, guion o guion bajo" })
  @MaxLength(50)
  username?: string;

  @ApiProperty({ example: "nuevo@empresa.com", required: false })
  @IsOptional()
  @Transform(normalizedEmail)
  @IsEmail({}, { message: "El correo no es válido" })
  @MaxLength(254)
  email?: string;

  @ApiProperty({ example: "EMP-001", required: false })
  @IsOptional()
  @IsString()
  @Transform(normalizedEmployeeCode)
  @MinLength(2)
  @MaxLength(40)
  employeeCode?: string;

  @ApiProperty({ example: "Juan Perez", required: false })
  @IsOptional()
  @IsString()
  @Transform(trimText)
  @MinLength(3)
  @Matches(/\S/, { message: "El nombre de la persona no puede contener solo espacios" })
  @MaxLength(150)
  employeeName?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  countryId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  municipalityId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  districtId?: number;

  @ApiProperty({ example: [1], type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: "Selecciona al menos un rol" })
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds?: number[];

  @ApiProperty({ example: [1], type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: "Selecciona al menos una empresa" })
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  companyIds?: number[];
}
