import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class DuplicateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;
}
