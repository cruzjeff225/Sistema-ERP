import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin@erp.local" })
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @ApiProperty({ example: "ChangeMe123!" })
  @IsString()
  @MinLength(1, { message: "La contraseña es obligatoria" })
  password: string;
}
