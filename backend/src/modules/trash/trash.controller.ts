import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CompanyScopeService } from '../../common/services/company-scope.service';
import { CurrentUser, AuthenticatedUser } from '../auth/presentation/decorators/current-user.decorator';
import { TrashService } from './trash.service';
import { TrashEntity } from './trash.registry';
import {PurgeTrashDto} from './trash.dto';
@Controller('trash')
export class TrashController {
    constructor(private readonly service: TrashService, private readonly scope: CompanyScopeService) { }
    private page(p?: string) { return Math.max(1, Math.min(100000, Math.floor(Number(p)) || 1)); }
    @Get('purge-preview')
    @RequirePermissions('trash.purge')
    async purgePreview(@CurrentUser() u: AuthenticatedUser,@Headers('x-company-id') h?: string) {
        return {data:await this.service.purgePreview(await this.scope.resolve(u,h))};
    }
    @Post('purge')
    @RequirePermissions('trash.purge')
    async purge(@Body() dto:PurgeTrashDto,@CurrentUser() u:AuthenticatedUser,@Headers('x-company-id') h?:string) {
        return {data:await this.service.purge(dto.ids,await this.scope.resolve(u,h),u.sub,dto.confirmed)};
    }
    @Get('entities')
    @RequirePermissions('trash.view')
    entities(
    @CurrentUser()
    u: AuthenticatedUser) { return { data: this.service.entities(u) }; }
    @Get('records/:entity')
    @RequirePermissions('trash.delete')
    async records(
    @Param('entity')
    e: TrashEntity, 
    @Query('search')
    s: string, 
    @Query('page')
    p: string, 
    @CurrentUser()
    u: AuthenticatedUser, 
    @Headers('x-company-id')
    h?: string) { return { data: await this.service.records(e, await this.scope.resolve(u, h), s, this.page(p)) }; }
    @Get()
    @RequirePermissions('trash.view')
    async list(
    @Query('search')
    s: string, 
    @Query('entity')
    e: string, 
    @Query('page')
    p: string, 
    @CurrentUser()
    u: AuthenticatedUser, 
    @Headers('x-company-id')
    h?: string) { return { data: await this.service.list(await this.scope.resolve(u, h), s, e, this.page(p)) }; }
    @Delete(':entity/:id')
    @RequirePermissions('trash.delete')
    async remove(
    @Param('entity')
    e: TrashEntity, 
    @Param('id', ParseIntPipe)
    id: number, 
    @CurrentUser()
    u: AuthenticatedUser, 
    @Headers('x-company-id')
    h?: string) { return { data: await this.service.trash(e, id, u.sub, await this.scope.resolve(u, h)), message: 'Registro enviado a la papelera por 30 días' }; }
    @Post(':id/restore')
    @RequirePermissions('trash.restore')
    async restore(
    @Param('id', ParseIntPipe)
    id: number, 
    @CurrentUser()
    u: AuthenticatedUser, 
    @Headers('x-company-id')
    h?: string) { return { data: await this.service.restore(id, await this.scope.resolve(u, h), u.sub), message: 'Registro restaurado' }; }
}
