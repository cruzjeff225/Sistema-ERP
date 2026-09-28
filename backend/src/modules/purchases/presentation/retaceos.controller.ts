import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RETACEO_PERMISSIONS } from "../../../common/constants/purchase-permissions.constant";
import { RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { CreateRetaceoDto, QueryRetaceosDto, UpdateRetaceoDto, WorkflowReasonDto } from "../application/dto/purchase-process.dto";
import { RetaceosService } from "../application/services/retaceos.service";

@ApiTags("retaceos")
@ApiBearerAuth()
@Controller("retaceos")
export class RetaceosController {
  constructor(
    private readonly retaceos: RetaceosService,
    private readonly companyScope: CompanyScopeService,
  ) {}

  @RequirePermissions(RETACEO_PERMISSIONS.VIEW)
  @Get("purchases")
  async purchases(@CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Recepciones disponibles obtenidas", data: await this.retaceos.purchases(await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryRetaceosDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Retaceos obtenidos", data: await this.retaceos.findAll(query, await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.VIEW)
  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Retaceo obtenido", data: await this.retaceos.findOne(id, await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.CREATE)
  @Post()
  async create(@Body() dto: CreateRetaceoDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Retaceo registrado en borrador", data: await this.retaceos.create(dto, user.sub, await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateRetaceoDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Retaceo actualizado", data: await this.retaceos.update(id, dto, user.sub, await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.CALCULATE)
  @Post(":id/calculate")
  async calculate(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Costos distribuidos proporcionalmente al FOB", data: await this.retaceos.calculate(id, user.sub, await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.VERIFY)
  @Post(":id/verify")
  async verify(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Retaceo verificado", data: await this.retaceos.verify(id, user.sub, await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.CLOSE)
  @Post(":id/close")
  async close(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Retaceo cerrado y costo real determinado", data: await this.retaceos.close(id, user.sub, await this.companyScope.resolve(user, companyHeader)) };
  }

  @RequirePermissions(RETACEO_PERMISSIONS.CANCEL)
  @Post(":id/cancel")
  async cancel(@Param("id", ParseIntPipe) id: number, @Body() dto: WorkflowReasonDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Retaceo cancelado", data: await this.retaceos.cancel(id, dto.reason, user.sub, await this.companyScope.resolve(user, companyHeader)) };
  }
}
