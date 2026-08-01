import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

// DTO para los filtros y opciones de paginación de usuarios
export class QueryUsersDto {
  // Número de página a consultar
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Cantidad de registros por página
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  // Texto para buscar por usuario o correo
  @ApiPropertyOptional({ example: "juan" })
  @IsOptional()
  @IsString()
  search?: string;

  // Filtra usuarios según su estado
  @ApiPropertyOptional({ example: "true" })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  // Filtra usuarios por rol asignado
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  roleId?: number;

  // Campo utilizado para ordenar los resultados
  @ApiPropertyOptional({
    example: "createdAt",
    enum: ["createdAt", "username", "email"],
  })
  @IsOptional()
  @IsIn(["createdAt", "username", "email"])
  sortBy?: string = "createdAt";

  // Dirección del ordenamiento de los resultados
  @ApiPropertyOptional({ example: "desc", enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "desc";
}
