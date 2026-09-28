import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CompanyScopeService } from '../../common/services/company-scope.service';
import { AuthenticatedUser, CurrentUser } from '../auth/presentation/decorators/current-user.decorator';
import { InventoryAdjustmentDto, InventoryQueryDto, WarehouseMapQueryDto } from './inventory.dto';
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
  @Get('catalogs') @RequirePermissions('inventory.view')
  async catalogs(@CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.catalogs(await this.scope.resolve(user, header)) }; }
  @Post('adjustments') @RequirePermissions('inventory.adjust')
  async adjust(@Body() dto: InventoryAdjustmentDto, @CurrentUser() user: AuthenticatedUser, @Headers('x-company-id') header?: string) { return { data: await this.service.adjust(await this.scope.resolve(user, header), user.sub, dto) }; }
}
