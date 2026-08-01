import { ApiProperty } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from "class-validator";

// DTO para la creación de un permiso
export class CreatePermissionDto {
  // Código único del permiso con formato modulo.accion
  @ApiProperty({ example: "inventory.view" })
  @IsString()
  @Matches(/^[a-z0-9_]+\.[a-z0-9_]+$/, {
    message:
      'El código debe seguir el formato "modulo.accion", ej. inventory.view',
  })
  action: string;

  // Nombre descriptivo del permiso
  @ApiProperty({ example: "Ver inventario" })
  @IsString()
  @MaxLength(100)
  name: string;

  // Descripción opcional del permiso
  @ApiProperty({ example: "Permite consultar el inventario", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  // Identificador del módulo al que pertenece el permiso
  @ApiProperty({ example: 1 })
  @IsInt()
  moduleId: number;
}