import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import { basename, extname, join } from "path";
import { PRODUCT_IMAGE_PERMISSIONS } from "../../../../common/constants/product-permissions.constant";
import { RequirePermissions, RequireStatusPermissions } from "../../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateProductImageDto } from "../../application/dto/create-product-image.dto";
import { QueryProductCatalogDto } from "../../application/dto/query-product-catalog.dto";
import { UpdateProductImageDto } from "../../application/dto/update-product-image.dto";
import { UpdateProductStatusDto } from "../../application/dto/update-product-status.dto";
import { ProductsService } from "../../application/services/products.service";

const { diskStorage } = require("multer") as { diskStorage: (options: Record<string, unknown>) => unknown };
const productImagesDirectory = join(process.cwd(), "uploads", "product-images");
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

@ApiTags("product-images")
@ApiBearerAuth()
@Controller("product-images")
export class ProductImagesController {
  constructor(private readonly productsService: ProductsService, private readonly companyScope: CompanyScopeService) {}

  @RequirePermissions(PRODUCT_IMAGE_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryProductCatalogDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    if (!query.productId) throw new BadRequestException("Debe indicar el producto a consultar");
    const data = await this.productsService.images(query.productId, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Imágenes obtenidas correctamente", data };
  }

  @RequirePermissions(PRODUCT_IMAGE_PERMISSIONS.CREATE)
  @Post("upload")
  @ApiOperation({ summary: "Cargar y asociar una imagen de producto" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", required: ["productId", "file"], properties: { productId: { type: "integer" }, file: { type: "string", format: "binary" } } } })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: productImagesDirectory,
        filename: (_request: any, file: { originalname: string }, callback: (error: Error | null, filename?: string) => void) => {
          callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request: any, file: { originalname: string; mimetype: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
        const extension = extname(file.originalname).toLowerCase();
        if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
          callback(new BadRequestException("El archivo debe ser una imagen JPG, PNG o WEBP"), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: { filename: string } | undefined,
    @Body("productId", ParseIntPipe) productId: number,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    if (!file) throw new BadRequestException("Debe seleccionar una imagen");
    try {
      const data = await this.productsService.createImage({ productId, path: `/uploads/product-images/${file.filename}` }, user.sub, await this.companyScope.resolve(user, companyHeader));
      return { success: true, message: "Imagen cargada correctamente", data };
    } catch (error) {
      await unlink(join(productImagesDirectory, file.filename)).catch(() => undefined);
      throw error;
    }
  }

  @RequirePermissions(PRODUCT_IMAGE_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Asociar imagen a producto" })
  async create(@Body() dto: CreateProductImageDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.createImage(dto, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Imagen asociada correctamente", data };
  }

  @RequirePermissions(PRODUCT_IMAGE_PERMISSIONS.UPDATE)
  @Patch(":id/upload")
  @ApiOperation({ summary: "Reemplazar una imagen de producto por un archivo" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: productImagesDirectory,
        filename: (_request: any, file: { originalname: string }, callback: (error: Error | null, filename?: string) => void) => {
          callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request: any, file: { originalname: string; mimetype: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
        const extension = extname(file.originalname).toLowerCase();
        if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
          callback(new BadRequestException("El archivo debe ser una imagen JPG, PNG o WEBP"), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async replaceUpload(
    @Param("id", ParseIntPipe) id: number,
    @UploadedFile() file: { filename: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    if (!file) throw new BadRequestException("Debe seleccionar una imagen");
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const current = await this.productsService.image(id, companyId);
    try {
      const data = await this.productsService.updateImage(id, { path: `/uploads/product-images/${file.filename}` }, user.sub, companyId);
      await this.removeManagedFile(current.path);
      return { success: true, message: "Imagen reemplazada correctamente", data };
    } catch (error) {
      await unlink(join(productImagesDirectory, file.filename)).catch(() => undefined);
      throw error;
    }
  }

  @RequirePermissions(PRODUCT_IMAGE_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductImageDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const companyId = await this.companyScope.resolve(user, companyHeader);
    const current = await this.productsService.image(id, companyId);
    const data = await this.productsService.updateImage(id, dto, user.sub, companyId);
    if (dto.path !== undefined && current.path !== data.path) await this.removeManagedFile(current.path);
    return { success: true, message: "Imagen actualizada correctamente", data };
  }

  @RequireStatusPermissions(PRODUCT_IMAGE_PERMISSIONS.ACTIVATE, PRODUCT_IMAGE_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductStatusDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.updateImageStatus(id, dto.isActive, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Estado de imagen actualizado correctamente", data };
  }

  @RequirePermissions(PRODUCT_IMAGE_PERMISSIONS.DELETE)
  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.productsService.removeImage(id, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Imagen eliminada correctamente", data };
  }

  private async removeManagedFile(path: string) {
    const prefix = "/uploads/product-images/";
    if (!path.startsWith(prefix)) return;
    const filename = path.slice(prefix.length);
    if (!filename || filename !== basename(filename)) return;
    await unlink(join(productImagesDirectory, filename)).catch(() => undefined);
  }
}
