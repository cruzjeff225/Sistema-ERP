import { PartialType } from "@nestjs/swagger";
import { CreateWarehouseCategoryDto } from "./create-warehouse-category.dto";

export class UpdateWarehouseCategoryDto extends PartialType(
  CreateWarehouseCategoryDto,
) {}
