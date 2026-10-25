import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class DuplicateRoleDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value)
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;
}
