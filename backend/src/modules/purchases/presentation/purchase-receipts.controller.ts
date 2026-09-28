import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { QueryReceiptsDto, UpdateReceiptDto } from "../application/dto/purchase-receipt.dto";
import { WorkflowReasonDto } from "../application/dto/purchase-process.dto";
import { PurchaseReceiptsService } from "../application/services/purchase-receipts.service";

@ApiTags("purchases")
@ApiBearerAuth()
@Controller("purchases")
export class PurchaseReceiptsController {
  constructor(private readonly receipts: PurchaseReceiptsService, private readonly scope: CompanyScopeService) {}

  @RequirePermissions("purchases.view") @Get()
  async list(@Query() query: QueryReceiptsDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    return { success: true, data: await this.receipts.findAll(query, await this.scope.resolve(user, company)) };
  }
  @RequirePermissions("purchases.view") @Get(":id")
  async detail(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    return { success: true, data: await this.receipts.findOne(id, await this.scope.resolve(user, company)) };
  }
  @RequirePermissions("purchases.update") @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateReceiptDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    return { success: true, data: await this.receipts.update(id, dto, user.sub, await this.scope.resolve(user, company)) };
  }
  @RequirePermissions("purchases.update") @Post(":id/verify")
  async verify(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    return { success: true, data: await this.receipts.transition(id, "verify", undefined, user.sub, await this.scope.resolve(user, company)) };
  }
  @RequirePermissions("purchases.close") @Post(":id/close")
  async close(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    return { success: true, data: await this.receipts.transition(id, "close", undefined, user.sub, await this.scope.resolve(user, company)) };
  }
  @RequirePermissions("purchases.cancel") @Post(":id/cancel")
  async cancel(@Param("id", ParseIntPipe) id: number, @Body() dto: WorkflowReasonDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    return { success: true, data: await this.receipts.transition(id, "cancel", dto.reason, user.sub, await this.scope.resolve(user, company)) };
  }
}
