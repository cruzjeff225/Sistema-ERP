import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin@erp.local" })
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLocaleLowerCase() : value)
  @IsEmail({}, { message: "El correo no es válido" })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: "ChangeMe123!" })
  @IsString()
  @MinLength(1, { message: "La contraseña es obligatoria" })
  @MaxLength(128)
  password: string;
}
