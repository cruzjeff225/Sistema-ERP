import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean } from "class-validator";
import { transformStatusBoolean } from "../../../../common/transforms/status-boolean.transform";

export class UpdatePermissionStatusDto {
  @ApiProperty({ example: true })
  @Transform(transformStatusBoolean)
  @IsBoolean()
  isActive: boolean;
}
