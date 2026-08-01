import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

// DTO para actualizar el estado de un registro
export class UpdateStatusDto {
  // Indica si el registro permanecerá activo o inactivo
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
