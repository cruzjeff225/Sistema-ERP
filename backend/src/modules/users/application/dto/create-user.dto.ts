import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
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

  // Lista opcional de roles a asignar al crear el usuario
  @ApiProperty({ example: [1], required: false, type: [Number] })
  @IsOptional()
  roleIds?: number[];
}
