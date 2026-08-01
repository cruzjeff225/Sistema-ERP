import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

// DTO para el cambio de contraseña de un usuario
export class ChangePasswordDto {
  // Nueva contraseña que se asignará al usuario
  @ApiProperty({ example: "Contraseña123!" })
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(100)
  newPassword: string;
}
