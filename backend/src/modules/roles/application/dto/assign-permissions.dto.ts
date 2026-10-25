import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayUnique, IsArray, IsInt, Min } from "class-validator";

// DTO para asignar permisos a un rol
export class AssignPermissionsDto {
  // Lista de identificadores únicos de los permisos a asignar
  @ApiProperty({ example: [1, 2, 3], type: [Number] })
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds: number[];
}
