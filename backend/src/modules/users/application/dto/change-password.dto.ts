import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import {
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../../../common/security/password-security";

export class ChangePasswordDto {
  @ApiProperty({ example: "ClaveSegura2026!" })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: "La contraseña debe tener al menos 12 caracteres" })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_PATTERN, { message: "La contraseña debe incluir mayúscula, minúscula, número y símbolo, sin espacios" })
  newPassword: string;
}
