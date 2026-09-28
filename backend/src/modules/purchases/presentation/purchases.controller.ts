import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  EXPENSE_TYPE_PERMISSIONS,
  PURCHASE_ORDER_PERMISSIONS,
  PURCHASE_PERMISSIONS,
  PURCHASE_QUOTATION_PERMISSIONS,
  PURCHASE_REQUEST_PERMISSIONS,
} from "../../../common/constants/purchase-permissions.constant";
import { RequireAnyPermission, RequirePermissions, RequireStatusPermissions } from "../../../common/decorators/permissions.decorator";
import { CompanyScopeService } from "../../../common/services/company-scope.service";
import { AuthenticatedUser, CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import {
  CreateExpenseTypeDto,
  CreatePurchaseQuotationDto,
  CreatePurchaseRequestDto,
  GeneratePurchaseOrderDto,
  QueryPurchaseDocumentsDto,
  ReceivePurchaseOrderDto,
  UpdateExpenseTypeDto,
  UpdateExpenseTypeStatusDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseQuotationDto,
  UpdatePurchaseRequestDto,
  WorkflowReasonDto,
} from "../application/dto/purchase-process.dto";
import { PurchasesService } from "../application/services/purchases.service";

abstract class ScopedController {
  constructor(protected readonly companyScope: CompanyScopeService) {}

  protected company(user: AuthenticatedUser, companyHeader?: string) {
    return this.companyScope.resolve(user, companyHeader);
  }
}

@ApiTags("purchase-catalogs")
@ApiBearerAuth()
@Controller("purchase-catalogs")
export class PurchaseCatalogsController extends ScopedController {
  constructor(private readonly purchases: PurchasesService, companyScope: CompanyScopeService) {
    super(companyScope);
  }

  @RequireAnyPermission(PURCHASE_REQUEST_PERMISSIONS.VIEW, PURCHASE_QUOTATION_PERMISSIONS.VIEW, PURCHASE_ORDER_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Catálogos activos para el proceso de compras" })
  async catalogs(@CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Catálogos de compras obtenidos", data: await this.purchases.catalogs(await this.company(user, companyHeader)) };
  }
}

@ApiTags("purchase-requests")
@ApiBearerAuth()
@Controller("purchase-requests")
export class PurchaseRequestsController extends ScopedController {
  constructor(private readonly purchases: PurchasesService, companyScope: CompanyScopeService) {
    super(companyScope);
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryPurchaseDocumentsDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitudes obtenidas", data: await this.purchases.requests(query, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.VIEW)
  @Get("comparison-options")
  async comparisonOptions(@CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, data: await this.purchases.comparisonOptions(await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.VIEW)
  @Get(":id/quotation-comparison")
  async comparison(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Comparación obtenida", data: await this.purchases.comparison(id, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.VIEW)
  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitud obtenida", data: await this.purchases.request(id, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.CREATE)
  @Post()
  async create(@Body() dto: CreatePurchaseRequestDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitud registrada", data: await this.purchases.createRequest(dto, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdatePurchaseRequestDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitud actualizada", data: await this.purchases.updateRequest(id, dto, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.UPDATE)
  @Post(":id/submit")
  async submit(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitud enviada a aprobación", data: await this.purchases.submitRequest(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.APPROVE)
  @Post(":id/approve")
  async approve(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitud aprobada", data: await this.purchases.approveRequest(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.REJECT)
  @Post(":id/reject")
  async reject(@Param("id", ParseIntPipe) id: number, @Body() dto: WorkflowReasonDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitud rechazada", data: await this.purchases.rejectRequest(id, dto.reason, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_REQUEST_PERMISSIONS.CANCEL)
  @Post(":id/cancel")
  async cancel(@Param("id", ParseIntPipe) id: number, @Body() dto: WorkflowReasonDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Solicitud cancelada", data: await this.purchases.cancelRequest(id, dto.reason, user.sub, await this.company(user, companyHeader)) };
  }
}

@ApiTags("purchase-quotations")
@ApiBearerAuth()
@Controller("purchase-quotations")
export class PurchaseQuotationsController extends ScopedController {
  constructor(private readonly purchases: PurchasesService, companyScope: CompanyScopeService) {
    super(companyScope);
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryPurchaseDocumentsDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotizaciones obtenidas", data: await this.purchases.quotations(query, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.VIEW)
  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización obtenida", data: await this.purchases.quotation(id, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.CREATE)
  @Post()
  async create(@Body() dto: CreatePurchaseQuotationDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización registrada", data: await this.purchases.createQuotation(dto, user.sub, await this.company(user, companyHeader), user) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdatePurchaseQuotationDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización actualizada", data: await this.purchases.updateQuotation(id, dto, user.sub, await this.company(user, companyHeader), user) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.UPDATE)
  @Post(":id/receive")
  async receive(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización marcada como recibida", data: await this.purchases.receiveQuotation(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.UPDATE)
  @Post(":id/review")
  async review(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización en evaluación", data: await this.purchases.reviewQuotation(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.SELECT)
  @Post(":id/select")
  async select(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización seleccionada", data: await this.purchases.selectQuotation(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.REJECT)
  @Post(":id/reject")
  async reject(@Param("id", ParseIntPipe) id: number, @Body() dto: WorkflowReasonDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización rechazada", data: await this.purchases.rejectQuotation(id, dto.reason, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_QUOTATION_PERMISSIONS.CANCEL)
  @Post(":id/cancel")
  async cancel(@Param("id", ParseIntPipe) id: number, @Body() dto: WorkflowReasonDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Cotización cancelada", data: await this.purchases.cancelQuotation(id, dto.reason, user.sub, await this.company(user, companyHeader)) };
  }
}

@ApiTags("purchase-orders")
@ApiBearerAuth()
@Controller("purchase-orders")
export class PurchaseOrdersController extends ScopedController {
  constructor(private readonly purchases: PurchasesService, companyScope: CompanyScopeService) {
    super(companyScope);
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.VIEW)
  @Get()
  async findAll(@Query() query: QueryPurchaseDocumentsDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Órdenes obtenidas", data: await this.purchases.orders(query, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.VIEW)
  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Orden obtenida", data: await this.purchases.order(id, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.CREATE)
  @Post("from-quotation/:quotationId")
  async createFromQuotation(@Param("quotationId", ParseIntPipe) quotationId: number, @Body() dto: GeneratePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Orden generada desde la cotización", data: await this.purchases.generateOrder(quotationId, dto, user.sub, await this.company(user, companyHeader), user) };
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdatePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Orden actualizada", data: await this.purchases.updateOrder(id, dto, user.sub, await this.company(user, companyHeader), user) };
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.UPDATE)
  @Post(":id/submit")
  async submit(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Orden enviada a aprobación", data: await this.purchases.submitOrder(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.APPROVE)
  @Post(":id/approve")
  async approve(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Orden aprobada", data: await this.purchases.approveOrder(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.SEND)
  @Post(":id/send")
  async send(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Orden enviada al proveedor", data: await this.purchases.sendOrder(id, user.sub, await this.company(user, companyHeader)) };
  }

  @RequireAnyPermission(PURCHASE_ORDER_PERMISSIONS.RECEIVE, PURCHASE_PERMISSIONS.CREATE)
  @Post(":id/receive")
  async receive(@Param("id", ParseIntPipe) id: number, @Body() dto: ReceivePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Recepción registrada", data: await this.purchases.receiveOrder(id, dto, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(PURCHASE_ORDER_PERMISSIONS.CANCEL)
  @Post(":id/cancel")
  async cancel(@Param("id", ParseIntPipe) id: number, @Body() dto: WorkflowReasonDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Orden cancelada", data: await this.purchases.cancelOrder(id, dto.reason, user.sub, await this.company(user, companyHeader)) };
  }
}

@ApiTags("expense-types")
@ApiBearerAuth()
@Controller("expense-types")
export class ExpenseTypesController extends ScopedController {
  constructor(private readonly purchases: PurchasesService, companyScope: CompanyScopeService) {
    super(companyScope);
  }

  @RequirePermissions(EXPENSE_TYPE_PERMISSIONS.VIEW)
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Tipos de gasto obtenidos", data: await this.purchases.expenseTypes(await this.company(user, companyHeader)) };
  }

  @RequirePermissions(EXPENSE_TYPE_PERMISSIONS.CREATE)
  @Post()
  async create(@Body() dto: CreateExpenseTypeDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Tipo de gasto registrado", data: await this.purchases.createExpenseType(dto, user.sub, await this.company(user, companyHeader)) };
  }

  @RequirePermissions(EXPENSE_TYPE_PERMISSIONS.UPDATE)
  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateExpenseTypeDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Tipo de gasto actualizado", data: await this.purchases.updateExpenseType(id, dto, user.sub, await this.company(user, companyHeader)) };
  }

  @RequireStatusPermissions(EXPENSE_TYPE_PERMISSIONS.ACTIVATE, EXPENSE_TYPE_PERMISSIONS.DEACTIVATE)
  @Patch(":id/status")
  async updateStatus(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateExpenseTypeStatusDto, @CurrentUser() user: AuthenticatedUser, @Headers("x-company-id") companyHeader?: string) {
    return { success: true, message: "Estado del tipo de gasto actualizado", data: await this.purchases.updateExpenseTypeStatus(id, dto, user.sub, await this.company(user, companyHeader)) };
  }
}
