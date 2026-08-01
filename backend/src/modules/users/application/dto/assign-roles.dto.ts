import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsInt } from "class-validator";

// DTO para asignar roles a un usuario
export class AssignRolesDto {
  // Lista de identificadores únicos de los roles a asignar
  @ApiProperty({ example: [1, 2], type: [Number] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  roleIds: number[];
}
