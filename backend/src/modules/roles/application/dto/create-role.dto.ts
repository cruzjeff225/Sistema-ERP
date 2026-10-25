import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

// DTO para la creación de un rol
export class CreateRoleDto {
  // Nombre único del rol.
  @ApiProperty({ example: "ventas_supervisor" })
  @Transform(({ value }) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value)
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  // Descripción opcional del rol
  @ApiProperty({ example: "Supervisor del área de ventas", required: false })
  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value)
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ example: [1, 2, 3], type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  permissionIds?: number[];
}
