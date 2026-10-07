import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequireAnyPermission, RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CompanyScopeService } from '../../../common/services/company-scope.service';
import { AuthenticatedUser, CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import { ActualExpenseDto, AwardDto, ComparePurchaseDto, ConsolidationDto, ConsolidationLineDto, QuantityReviewDto, GeneralWarehouseDto, PlacementDto, RfqDto, TransferDto, TransferReceiptDto } from '../application/dto/supply-workflow.dto';
import { SupplyWorkflowService } from '../application/services/supply-workflow.service';
import { rfqPdf } from '../application/services/rfq-pdf';

@Controller('supply')
export class SupplyWorkflowController {
  constructor(private readonly service: SupplyWorkflowService, private readonly scope: CompanyScopeService) {}
  private company(u: AuthenticatedUser, h?: string) { return this.scope.resolve(u, h); }
  @Get('configuration') @RequireAnyPermission('purchase_requests.view','warehouses.update')
  async configuration(@CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.configuration(await this.company(u,h)) }; }
  @Patch('configuration') @RequirePermissions('warehouses.update')
  async configure(@Body() dto: GeneralWarehouseDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.configure(dto.warehouseId, await this.company(u,h), u.sub) }; }

  @Get('requests') @RequirePermissions('purchase_requests.view')
  async requests(@CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.requests(await this.company(u,h)) }; }
  @Get('consolidations') @RequireAnyPermission('purchase_quotations.view','purchase_orders.approve')
  async list(@CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.list(await this.company(u,h)) }; }
  @Get('consolidations/:id') @RequireAnyPermission('purchase_quotations.view','purchase_orders.approve')
  async one(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.one(id, await this.company(u,h)) }; }
  @Post('consolidations') @RequirePermissions('purchase_quotations.create', 'purchase_requests.view')
  async create(@Body() dto: ConsolidationDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.create(dto, await this.company(u,h), u.sub) }; }
  @Patch('consolidations/:id/lines') @RequireAnyPermission('purchase_quotations.update','purchase_orders.approve')
  async line(@Param('id', ParseIntPipe) id: number, @Body() dto: ConsolidationLineDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.editLine(id, dto, await this.company(u,h), u.sub, u) }; }
  @Post('consolidations/:id/quantities/submit') @RequirePermissions('purchase_quotations.update')
  async submitQuantities(@Param('id', ParseIntPipe) id: number, @Body() dto: QuantityReviewDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.reviewQuantities(id,'submit',dto,await this.company(u,h),u.sub) }; }
  @Post('consolidations/:id/quantities/approve') @RequirePermissions('purchase_orders.approve')
  async approveQuantities(@Param('id', ParseIntPipe) id: number, @Body() dto: QuantityReviewDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.reviewQuantities(id,'approve',dto,await this.company(u,h),u.sub) }; }
  @Post('consolidations/:id/quantities/return') @RequirePermissions('purchase_orders.approve')
  async returnQuantities(@Param('id', ParseIntPipe) id: number, @Body() dto: QuantityReviewDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.reviewQuantities(id,'return',dto,await this.company(u,h),u.sub) }; }
  @Post('consolidations/:id/rfqs') @RequirePermissions('purchase_quotations.create')
  async rfq(@Param('id', ParseIntPipe) id: number, @Body() dto: RfqDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.rfq(id, dto, await this.company(u,h), u.sub) }; }
  @Get('rfqs/:id/pdf') @RequirePermissions('purchase_quotations.view')
  async pdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthenticatedUser, @Res() res: Response, @Headers('x-company-id') h?: string) {
    const r = await this.service.rfqDocument(id, await this.company(u,h));
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(r.createdAt);
    const pdf = await rfqPdf({reference:r.code,issuedOn:date,
      company:{name:r.consolidation.company.commercialName,email:r.consolidation.company.email,phone:r.consolidation.company.phone},
      supplier:{name:r.supplier.name,email:r.supplier.email,phone:r.supplier.phone,address:r.supplier.address},
      lines:r.lines.map(l=>({name:l.line.product.name,sku:l.line.product.sku,quantity:l.quantity.toString(),unit:l.line.unit.name}))});
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${r.code}.pdf"`); res.setHeader('Cache-Control','private, no-store');res.send(pdf);
  }
  @Post('consolidations/:id/award') @RequirePermissions('purchase_quotations.select', 'purchase_orders.create')
  async award(@Param('id', ParseIntPipe) id: number, @Body() dto: AwardDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.award(id, dto, await this.company(u,h), u) }; }
  @Post('consolidations/:id/compare') @RequirePermissions('purchase_quotations.view')
  async compare(@Param('id',ParseIntPipe) id:number,@Body() dto:ComparePurchaseDto,@CurrentUser() u:AuthenticatedUser,@Headers('x-company-id') h?:string){return{data:await this.service.comparison(id,await this.company(u,h),dto.details??[])};}
  @Post('consolidations/:id/award-and-submit') @RequirePermissions('purchase_quotations.select','purchase_orders.create','purchase_orders.update')
  async awardAndSubmit(@Param('id',ParseIntPipe) id:number,@Body() dto:AwardDto,@CurrentUser() u:AuthenticatedUser,@Headers('x-company-id') h?:string){return{data:await this.service.award(id,{...dto,submitForApproval:true},await this.company(u,h),u)};}
  @Get('placements') @RequirePermissions('purchases.view')
  async pending(@CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.pendingPlacement(await this.company(u,h)) }; }
  @Post('placements/:id/confirm') @RequirePermissions('inventory.adjust')
  async place(@Param('id', ParseIntPipe) id: number, @Body() dto: PlacementDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.place(id,dto,await this.company(u,h),u.sub) }; }
  @Get('transfers') @RequirePermissions('inventory.view')
  async transfers(@CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.transfers(await this.company(u,h)) }; }
  @Post('transfers') @RequirePermissions('inventory.adjust', 'purchase_requests.view')
  async dispatch(@Body() dto: TransferDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.dispatch(dto,await this.company(u,h),u.sub) }; }
  @Post('transfers/:id/receive') @RequirePermissions('inventory.adjust')
  async receive(@Param('id', ParseIntPipe) id: number, @Body() dto: TransferReceiptDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.receiveTransfer(id,dto,await this.company(u,h),u.sub) }; }
  @Get('receipts/:id/expenses') @RequirePermissions('purchases.view')
  async expenses(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.actualExpenses(id,await this.company(u,h)) }; }
  @Post('receipts/:id/expenses') @RequirePermissions('purchase_expenses.create')
  async expense(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualExpenseDto, @CurrentUser() u: AuthenticatedUser, @Headers('x-company-id') h?: string) { return { data: await this.service.expense(id,dto,await this.company(u,h),u.sub) }; }
}
