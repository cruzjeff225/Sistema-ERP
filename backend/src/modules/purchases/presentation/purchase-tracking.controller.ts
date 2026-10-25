import { BadRequestException, Controller, Get, Headers, Param, ParseIntPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { PurchaseTrackingService, TRACKING_ANCHORS, TrackingAnchor } from "../application/services/purchase-tracking.service";

@ApiTags("purchases")
@ApiBearerAuth()
@Controller("purchases/tracking")
export class PurchaseTrackingController {
  constructor(private readonly tracking: PurchaseTrackingService, private readonly scope: CompanyScopeService) {}

  /** Purchase processes, one row each, with their current stage and next step. */
  @RequirePermissions("purchases.view") @Get("processes")
  async processes(@Query("scope") scope: string | undefined, @Query("search") search: string | undefined, @Query("limit") limit: string | undefined, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    const normalizedScope = scope ?? "open";
    if (!["open", "done", "all"].includes(normalizedScope)) throw new BadRequestException("El filtro debe ser open, done o all");
    const parsed = Number(limit ?? 30);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new BadRequestException("El límite debe ser un entero entre 1 y 100");
    return { success: true, data: await this.tracking.list(await this.scope.resolve(user, company), { scope: normalizedScope as "open" | "done" | "all", search: search?.slice(0, 60), limit: parsed }) };
  }

  /** Stage timeline and next step for the purchase process that contains the given document. */
  @RequirePermissions("purchases.view") @Get(":type/:id")
  async track(@Param("type") type: string, @Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") company?: string) {
    if (!(TRACKING_ANCHORS as readonly string[]).includes(type)) throw new BadRequestException(`Tipo de documento no válido. Use: ${TRACKING_ANCHORS.join(", ")}`);
    return { success: true, data: await this.tracking.track(type as TrackingAnchor, id, await this.scope.resolve(user, company)) };
  }
}
