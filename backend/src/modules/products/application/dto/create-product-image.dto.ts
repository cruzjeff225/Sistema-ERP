import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, Matches, MaxLength, Min } from "class-validator";

export class CreateProductImageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^(https?:\/\/|data:image\/|\/uploads\/product-images\/[A-Za-z0-9._-]+$)/i, {
    message: "La imagen debe ser una URL http(s), una imagen embebida o un archivo cargado por el sistema",
  })
  path: string;
}
