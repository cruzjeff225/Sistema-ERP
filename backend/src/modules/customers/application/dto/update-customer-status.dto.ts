import { Transform } from "class-transformer";
import { IsBoolean } from "class-validator";
import { transformStatusBoolean } from "../../../../common/transforms/status-boolean.transform";

export class UpdateCustomerStatusDto {
  @Transform(transformStatusBoolean)
  @IsBoolean()
  isActive: boolean;
}
