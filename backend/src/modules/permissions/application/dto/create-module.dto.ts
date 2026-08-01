import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// DTO para la creación de un módulo
export class CreateModuleDto {
  // Nombre único del módulo
  @ApiProperty({ example: "inventory" })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  // Descripción opcional del módulo
  @ApiProperty({ example: "Gestión de inventario", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
