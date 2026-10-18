import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CompanyScopeService } from '../../common/services/company-scope.service';
import { AuthenticatedUser, CurrentUser } from '../auth/presentation/decorators/current-user.decorator';
import { InventoryAdjustmentDto, InventoryQueryDto, KardexQueryDto, LabelPrintDto, LotQueryDto, RelocationDto, WarehouseMapQueryDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService, private readonly scope: CompanyScopeService) {}
  @Get('map') @RequirePermissions('inventory.view')
  async map(@Query() q: WarehouseMapQueryDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.map(await this.scope.resolve(user, header), q.warehouseId) }; }
  @Get('stocks') @RequirePermissions('inventory.view')
  async stocks(@Query() q: InventoryQueryDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.stocks(await this.scope.resolve(user, header), q) }; }
  @Get('movements') @RequirePermissions('inventory.view')
  async movements(@Query() q: InventoryQueryDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.movements(await this.scope.resolve(user, header), q) }; }
  @Get('kardex') @RequirePermissions('inventory.kardex.view')
  async kardex(@Query() q: KardexQueryDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.kardex(await this.scope.resolve(user, header), q) }; }
  @Get('lots') @RequirePermissions('inventory.lots.view')
  async lots(@Query() q: LotQueryDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.lots(await this.scope.resolve(user, header), q) }; }
  @Get('lots/:id') @RequirePermissions('inventory.lots.view')
  async lot(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.lot(await this.scope.resolve(user, header), id) }; }
  @Post('lots/:id/labels') @RequirePermissions('inventory.label.print')
  async labels(@Param('id', ParseIntPipe) id: number, @Body() dto: LabelPrintDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.printLabels(await this.scope.resolve(user, header), user.sub, id, dto) }; }
  @Get('costs') @RequirePermissions('inventory.cost.view')
  async costs(@Query() q: InventoryQueryDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.costs(await this.scope.resolve(user, header), q) }; }
  @Get('reconciliation') @RequirePermissions('inventory.cost.view')
  async reconciliation(@CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.reconcile(await this.scope.resolve(user, header)) }; }
  @Get('catalogs') @RequirePermissions('inventory.view')
  async catalogs(@CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.catalogs(await this.scope.resolve(user, header)) }; }
  @Post('relocations') @RequirePermissions('inventory.location.assign')
  async relocate(@Body() dto: RelocationDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.relocate(await this.scope.resolve(user, header), user.sub, dto) }; }
  @Post('adjustments') @RequirePermissions('inventory.adjust')
  async adjust(@Body() dto: InventoryAdjustmentDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.adjust(await this.scope.resolve(user, header), user.sub, dto) }; }
}
