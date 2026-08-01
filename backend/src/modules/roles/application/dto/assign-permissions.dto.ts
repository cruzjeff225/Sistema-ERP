import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsInt } from "class-validator";

// DTO para asignar permisos a un rol
export class AssignPermissionsDto {
  // Lista de identificadores únicos de los permisos a asignar
  @ApiProperty({ example: [1, 2, 3], type: [Number] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  permissionIds: number[];
}
