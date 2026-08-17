import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

// DTO para la creación de un usuario
export class CreateUserDto {
  // Nombre de usuario único para iniciar sesión
  @ApiProperty({ example: "jperez" })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  // Correo electrónico del usuario
  @ApiProperty({ example: "micorreo@empresa.com" })
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  // Contraseña inicial del usuario
  @ApiProperty({ example: "Contraseña123!" })
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(100)
  password: string;

  @ApiProperty({ example: "EMP-001" })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  employeeCode: string;

  @ApiProperty({ example: "Juan Perez" })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  employeeName: string;

  // Todo usuario debe iniciar con al menos un rol.
  @ApiProperty({ example: [1], type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  roleIds: number[];
}
