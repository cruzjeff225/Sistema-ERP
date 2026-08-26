import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean } from "class-validator";
import { transformStatusBoolean } from "../../../../common/transforms/status-boolean.transform";

// DTO para actualizar el estado de un registro
export class UpdateUserStatusDto {
  // Indica si el registro permanecerá activo o inactivo
  @ApiProperty({ example: true })
  @Transform(transformStatusBoolean)
  @IsBoolean()
  isActive: boolean;
}
