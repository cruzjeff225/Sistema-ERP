import { IsString, MaxLength, MinLength } from "class-validator";
import { ChangePasswordDto } from "../../../users/application/dto/change-password.dto";

export class ChangeOwnPasswordDto extends ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;
}
