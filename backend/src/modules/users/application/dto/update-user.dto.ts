import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

// DTO para la actualización de un usuario
export class UpdateUserDto {
  // Nuevo nombre de usuario
  @ApiProperty({ example: "usuario1", required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username?: string;

  // Nuevo correo electrónico del usuario
  @ApiProperty({ example: "nuevo@empresa.com", required: false })
  @IsOptional()
  @IsEmail({}, { message: "El correo no es válido" })
  email?: string;

  @ApiProperty({ example: "EMP-001", required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  employeeCode?: string;

  @ApiProperty({ example: "Juan Perez", required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  employeeName?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  countryId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  districtId?: number;

  @ApiProperty({ example: [1], type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  companyIds?: number[];
}
