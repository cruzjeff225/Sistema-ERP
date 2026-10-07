import { BadRequestException, Controller, Delete, Get, Headers, NotFoundException, Param, ParseIntPipe, Post, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import { readFile, unlink } from "fs/promises";
import { basename, extname, join } from "path";
import { PURCHASE_EXPENSE_PERMISSIONS, PURCHASE_ORDER_PERMISSIONS } from "../../../common/constants/purchase-permissions.constant";
import { RequireAnyPermission, RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { PurchaseExpenseDocumentsService } from "../application/services/purchase-expense-documents.service";

const { diskStorage } = require("multer") as { diskStorage: (options: Record<string, unknown>) => unknown };
const documentsDirectory = join(process.cwd(), "uploads", "purchase-expenses");
const allowedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

@ApiTags("purchase-order-expense-documents")
@ApiBearerAuth()
@Controller("purchase-order-expenses")
export class PurchaseExpenseDocumentsController {
  constructor(
    private readonly documents: PurchaseExpenseDocumentsService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  @RequirePermissions(PURCHASE_EXPENSE_PERMISSIONS.CREATE)
  @Post(":expenseId/documents")
  @ApiOperation({ summary: "Adjuntar evidencia a un gasto de orden" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } })
  @UseInterceptors(FileInterceptor("file", {
    storage: diskStorage({
      destination: documentsDirectory,
      filename: (_request: unknown, file: { originalname: string }, callback: (error: Error | null, filename?: string) => void) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_request: unknown, file: { originalname: string; mimetype: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
      const extension = extname(file.originalname).toLowerCase();
      if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
        callback(new BadRequestException("El documento debe ser PDF, JPG, PNG o WEBP"), false);
        return;
      }
      callback(null, true);
    },
  }))
  async upload(
    @Param("expenseId", ParseIntPipe) expenseId: number,
    @UploadedFile() file: { originalname: string; mimetype: string; filename: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-company-id") companyHeader?: string,
  ) {
    if (!file) throw new BadRequestException("Debe seleccionar un documento");
    try {
      const bytes = await readFile(join(documentsDirectory, file.filename));
      const valid = file.mimetype === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-"
        : file.mimetype === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.mimetype === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
      if (!valid) throw new BadRequestException("El contenido del documento no corresponde al tipo de archivo indicado");
      const data = await this.documents.create(expenseId, file, user.sub, await this.companyScope.resolve(user, companyHeader));
      return { success: true, message: "Documento adjuntado", data };
    } catch (error) {
      await unlink(join(documentsDirectory, file.filename)).catch(() => undefined);
      throw error;
    }
  }

  @RequireAnyPermission(PURCHASE_EXPENSE_PERMISSIONS.VIEW, PURCHASE_ORDER_PERMISSIONS.VIEW)
  @Get("documents/:id/content")
  async download(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const document = await this.documents.findOne(id, await this.companyScope.resolve(user, companyHeader));
    const filename = basename(document.filePath);
    const bytes = await readFile(join(documentsDirectory, filename)).catch(() => { throw new NotFoundException("El archivo adjunto no está disponible"); });
    return new StreamableFile(bytes, { type: document.fileType ?? "application/octet-stream", disposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}` });
  }

  @RequirePermissions(PURCHASE_EXPENSE_PERMISSIONS.UPDATE)
  @Delete("documents/:id")
  async remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    const data = await this.documents.remove(id, user.sub, await this.companyScope.resolve(user, companyHeader));
    return { success: true, message: "Documento eliminado", data };
  }
}
