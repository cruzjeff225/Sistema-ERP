import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// DTO para la actualización de un rol
export class UpdateRoleDto {
  // Nuevo nombre del rol.
  @ApiProperty({ example: "ventas_supervisor", required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  // Nueva descripción del rol
  @ApiProperty({ example: "Supervisor del área de ventas", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
