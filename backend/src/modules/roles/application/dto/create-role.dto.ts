import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// DTO para la creación de un rol
export class CreateRoleDto {
  // Nombre único del rol.
  @ApiProperty({ example: "ventas_supervisor" })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  // Descripción opcional del rol
  @ApiProperty({ example: "Supervisor del área de ventas", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
