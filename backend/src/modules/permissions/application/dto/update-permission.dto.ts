import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength } from "class-validator";

// DTO para la actualización de un permiso
export class UpdatePermissionDto {
  // Nuevo nombre descriptivo del permiso
  @ApiProperty({ example: "Ver inventario", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  // Nueva descripción del permiso
  @ApiProperty({ example: "Permite consultar el inventario", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  // Nuevo módulo al que pertenecerá el permiso
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  moduleId?: number;
}