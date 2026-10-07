import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import { AuditService } from '../audit/application/services/audit.service';
import { TRASH_TABLES } from './trash.tables';
import { TRASH_ENTITIES, TrashEntity, trashScope } from './trash.registry';
const DAY = 86400000;
@Injectable()
export class TrashService implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private cleaning = false;
    private readonly logger = new Logger(TrashService.name);
    constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) { }
    onModuleInit() { void this.cleanup().catch(() => this.logger.error('No se pudo depurar la papelera')); this.timer = setInterval(() => { void this.cleanup().catch(() => this.logger.error('No se pudo depurar la papelera')); }, 3600000); this.timer.unref(); }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
    private definition(entity: string) { if (!Object.prototype.hasOwnProperty.call(TRASH_ENTITIES, entity))
        throw new BadRequestException('Tipo de registro no válido'); return TRASH_ENTITIES[entity as TrashEntity]; }
    private delegate(tx: any, entity: string) { return tx[this.definition(entity).model]; }
    private async lock(tx: Prisma.TransactionClient, companyId: number) { await tx.$queryRaw `SELECT pg_advisory_xact_lock(68431, ${companyId}::integer)::text`; }
    async primaryCompany() { const c = await this.prisma.erpConfiguration.findUnique({ where: { id: 1 } }); if (!c)
        throw new ForbiddenException('Empresa no configurada'); return c.companyId; }
    entities(user: {
        roles: string[];
        permissions: string[];
    }) { return Object.entries(TRASH_ENTITIES).filter(([, d]) => user.roles.includes('superadmin') || user.permissions.includes(d.view)).map(([key, d]) => ({ key, label: d.label })); }
    private async authorizeRecord(tx: any, entity: TrashEntity, id: number, companyId: number, actorId: number) {
        const row = await this.delegate(tx, entity).findFirst({ where: { ...trashScope(entity, companyId), id } });
        if (!row)
            throw new NotFoundException('Registro no disponible en esta empresa');
        if (entity === 'companies' && row.id === companyId)
            throw new ConflictException('La empresa configurada mantiene el acceso al ERP y no puede enviarse a la papelera');
        if (entity === 'users' && id === actorId)
            throw new ConflictException('No puede eliminar su propia cuenta desde la sesión activa');
        if (entity === 'users' && await tx.userRole.count({ where: { userId: id, role: { name: 'superadmin' } } })) {
            const others = await tx.userRole.count({ where: { userId: { not: id }, role: { name: 'superadmin', isActive: true, deletedAt: null }, user: { isActive: true, deletedAt: null } } });
            if (!others)
                throw new ConflictException('Debe conservarse al menos un superadministrador para recuperar registros');
        }
        if (entity === 'roles' && row.name === 'superadmin')
            throw new ConflictException('El rol de recuperación superadmin no puede eliminarse');
        if (entity === 'permissions' && row.action.startsWith('trash.'))
            throw new ConflictException('Los permisos de recuperación de la papelera no pueden eliminarse');
        if (entity === 'modules' && row.name === 'trash')
            throw new ConflictException('La configuración de la papelera no puede eliminarse');
        return row;
    }
    async records(entity: TrashEntity, companyId: number, search = '', page = 1) {
        const d = this.definition(entity), title = d.title === 'fileName' ? 'path' : d.title;
        const where = { ...trashScope(entity, companyId), deletedAt: null, ...(search.trim() ? { OR: [{ [title]: { contains: search.trim(), mode: 'insensitive' } }, ...(Number.isInteger(Number(search)) && Number(search) > 0 ? [{ id: Number(search) }] : [])] } : {}) };
        const [rows, total] = await Promise.all([this.delegate(this.prisma, entity).findMany({ where, select: { id: true, [title]: true }, orderBy: { id: 'desc' }, skip: (page - 1) * 30, take: 30 }), this.delegate(this.prisma, entity).count({ where })]);
        return { items: rows.map((r: any) => ({ id: r.id, label: r[title] || d.label + ' #' + r.id })), total, page, pages: Math.ceil(total / 30) };
    }
    async list(companyId: number, search = '', entity = '', page = 1) {
        const where = { companyId, restoredAt: null, purgedAt: null, expiresAt: { gt: new Date() }, ...(entity ? { entity } : {}), ...(search.trim() ? { label: { contains: search.trim(), mode: 'insensitive' as const } } : {}) };
        const [items, total] = await Promise.all([this.prisma.trashEntry.findMany({ where, select: { id: true, entity: true, recordId: true, label: true, deletedBy: true, deletedAt: true, expiresAt: true }, orderBy: { deletedAt: 'desc' }, skip: (page - 1) * 30, take: 30 }), this.prisma.trashEntry.count({ where })]);
        return { items: items.map(i => ({ ...i, module: this.definition(i.entity).label, daysLeft: Math.max(0, Math.ceil((i.expiresAt.getTime() - Date.now()) / DAY)) })), total, page, pages: Math.ceil(total / 30) };
    }
    async purgePreview(companyId:number) {
        const items=await this.prisma.trashEntry.findMany({where:{companyId,restoredAt:null,purgedAt:null,expiresAt:{gt:new Date()}},select:{id:true},orderBy:{id:'asc'},take:1001});
        if(items.length>1000)throw new BadRequestException('Hay más de 1000 registros. Elimine registros por separado antes de vaciar la papelera');
        return {ids:items.map(item=>item.id),count:items.length};
    }
    async purge(ids:number[],companyId:number,actorId:number,confirmed:boolean) {
        if(confirmed!==true||!ids.length||ids.length>1000||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new BadRequestException('Confirme los registros que desea eliminar definitivamente');
        return this.prisma.$transaction(async tx=>{
            await this.lock(tx,companyId);
            const entries=await tx.trashEntry.findMany({where:{id:{in:ids},companyId},orderBy:{id:'asc'}});
            if(entries.length!==ids.length)throw new NotFoundException('Uno de los registros no pertenece a la papelera de esta empresa');
            if(entries.some(entry=>entry.restoredAt))throw new ConflictException('Un registro ya fue restaurado. Actualice la papelera');
            let removed=0,retained=0;
            for(const entry of entries){
                if(entry.purgedAt)continue;
                const table=TRASH_TABLES[this.definition(entry.entity).model];
                await tx.$queryRaw(Prisma.sql`SELECT 1 FROM ${this.identifier('public',table.table)} WHERE ${this.identifier(table.id)}=${entry.recordId} FOR UPDATE`);
                const row=await this.delegate(tx,entry.entity).findUnique({where:{id:entry.recordId}});
                if(row&&!row.deletedAt)throw new ConflictException('Un registro ya está activo. Actualice la papelera');
                let keep=!!row&&await this.hasReferences(tx,entry.entity,entry.recordId);
                if(row&&!keep){
                    // A concurrent relation must never trigger a cascade through business history.
                    await tx.$executeRawUnsafe('SAVEPOINT trash_permanent_delete');
                    try{await this.delegate(tx,entry.entity).delete({where:{id:entry.recordId}});await tx.$executeRawUnsafe('RELEASE SAVEPOINT trash_permanent_delete');}
                    catch(error){await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT trash_permanent_delete');await tx.$executeRawUnsafe('RELEASE SAVEPOINT trash_permanent_delete');if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2003')keep=true;else throw error;}
                }
                const purgedAt=new Date();
                await tx.trashEntry.update({where:{id:entry.id},data:{purgedAt,retainedForHistory:keep,originalState:{}}});
                await this.audit.record(tx,{controller:entry.entity,action:'PURGE',recordId:entry.recordId,originalData:{trashId:entry.id,label:entry.label},modifiedData:{purgedAt,retainedForHistory:keep},userId:actorId});
                if(keep)retained++;else removed++;
            }
            return {processed:removed+retained,removed,retained};
        },{timeout:60000});
    }
    async trash(entity: TrashEntity, id: number, actorId: number, companyId: number) {
        this.definition(entity);
        return this.prisma.$transaction(async (tx) => {
            await this.lock(tx, companyId);
            const row = await this.authorizeRecord(tx, entity, id, companyId, actorId);
            if (row.deletedAt) {
                const entry = await tx.trashEntry.findFirst({ where: { companyId, entity, recordId: id, restoredAt: null, purgedAt: null, expiresAt: { gt: new Date() } } });
                if (entry)
                    return { id: entry.id, recordId: id, expiresAt: entry.expiresAt };
                throw new ConflictException('El registro ya está eliminado');
            }
            const deletedAt = new Date(), expiresAt = new Date(deletedAt.getTime() + 30 * DAY);
            const state: Record<string, any> = {};
            if (typeof row.isActive === 'boolean')
                state.isActive = row.isActive;
            if (entity === 'users') {
                const employee = await tx.employee.findUnique({ where: { id: row.employeeId } });
                if (employee && !employee.deletedAt) {
                    state.employee = { id: employee.id, isActive: employee.isActive };
                    await tx.employee.update({ where: { id: employee.id }, data: { deletedAt, isActive: false } });
                }
            }
            await this.delegate(tx, entity).update({ where: { id }, data: { deletedAt, ...('isActive' in state ? { isActive: false } : {}) } });
            await this.revoke(tx, entity, id);
            const label = row[this.definition(entity).title] || row.path || this.definition(entity).label + ' #' + id;
            const entry = await tx.trashEntry.create({ data: { companyId, entity, recordId: id, label, deletedBy: actorId, deletedAt, expiresAt, originalState: state } });
            await this.audit.record(tx, { controller: entity, action: 'TRASH', recordId: id, originalData: { id, label }, modifiedData: { trashId: entry.id, deletedAt, expiresAt }, userId: actorId });
            return { id: entry.id, recordId: id, expiresAt };
        }, { timeout: 15000 });
    }
    async restore(id: number, companyId: number, actorId: number) {
        return this.prisma.$transaction(async (tx) => {
            await this.lock(tx, companyId);
            const entry = await tx.trashEntry.findFirst({ where: { id, companyId } });
            if (!entry)
                throw new NotFoundException('Registro no disponible en la papelera');
            if (entry.restoredAt)
                return { recordId: entry.recordId, entity: entry.entity };
            if (entry.purgedAt) throw new ConflictException('El registro fue eliminado definitivamente y no puede recuperarse');
            if (entry.expiresAt.getTime() <= Date.now())
                throw new ConflictException('Los 30 días de recuperación ya vencieron');
            const row = await this.delegate(tx, entry.entity).findUnique({ where: { id: entry.recordId } });
            if (!row?.deletedAt)
                throw new ConflictException('El registro ya no coincide con esta eliminación');
            const state = entry.originalState as Record<string, any>;
            // Parent records must be restored first. IDs and historical links stay intact.
            const table = TRASH_TABLES[this.definition(entry.entity).model];
            for (const fk of await this.foreignKeys(tx, table.table, true)) {
                if (!fk.softDelete || (fk.relatedTable === 'employees' && state.employee))
                    continue;
                if (fk.fromColumns.length !== 1)
                    throw new ConflictException('La relación requiere una revisión antes de recuperar el registro');
                const rows = await tx.$queryRaw<any[]>(Prisma.sql `SELECT p.deleted_at FROM ${this.identifier('public', table.table)} c JOIN ${this.identifier(fk.relatedSchema, fk.relatedTable)} p ON c.${this.identifier(fk.fromColumns[0])}=p.${this.identifier(fk.toColumns[0])} WHERE c.${this.identifier(table.id)}=${entry.recordId} AND p.deleted_at IS NOT NULL LIMIT 1`);
                if (rows.length)
                    throw new ConflictException('Restaure primero el registro relacionado: ' + (Object.values(TRASH_ENTITIES).find(d => TRASH_TABLES[d.model].table === fk.relatedTable)?.label || 'registro de origen'));
            }
            await this.delegate(tx, entry.entity).update({ where: { id: entry.recordId }, data: { deletedAt: null, ...(typeof state.isActive === 'boolean' ? { isActive: state.isActive } : {}) } });
            if (state.employee) {
                const separate = await tx.trashEntry.count({ where: { entity: 'employees', recordId: state.employee.id, restoredAt: null, purgedAt: null } });
                if (!separate)
                    await tx.employee.update({ where: { id: state.employee.id }, data: { deletedAt: null, isActive: state.employee.isActive } });
            }
            await this.revoke(tx, entry.entity, entry.recordId);
            await tx.trashEntry.update({ where: { id }, data: { restoredAt: new Date() } });
            await this.audit.record(tx, { controller: entry.entity, action: 'RESTORE', recordId: entry.recordId, modifiedData: { trashId: id }, userId: actorId });
            return { recordId: entry.recordId, entity: entry.entity };
        }, { timeout: 15000 });
    }
    private async revoke(tx: Prisma.TransactionClient, entity: string, id: number) {
        let ids: number[] = [];
        if (entity === 'users')
            ids = [id];
        if (entity === 'roles')
            ids = (await tx.userRole.findMany({ where: { roleId: id }, select: { userId: true } })).map(r => r.userId);
        if (entity === 'permissions' || entity === 'modules')
            ids = (await tx.userRole.findMany({ where: { role: { rolePermissions: { some: { permission: entity === 'permissions' ? { id } : { moduleId: id } } } } }, select: { userId: true } })).map(r => r.userId);
        if (ids.length) {
            await tx.user.updateMany({ where: { id: { in: ids } }, data: { sessionVersion: { increment: 1 } } });
            await tx.refreshToken.updateMany({ where: { userId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date() } });
        }
    }
    private identifier(...parts: string[]) { return Prisma.raw(parts.map(p => '"' + p.replace(/"/g, '""') + '"').join('.')); }
    private async foreignKeys(tx: Prisma.TransactionClient, table: string, parents: boolean) {
        // Prisma 7's runtime DMMF omits relation fields; use the actual database constraints.
        return tx.$queryRaw<{
            relatedSchema: string;
            relatedTable: string;
            fromColumns: string[];
            toColumns: string[];
            softDelete: boolean;
        }[]>(Prisma.sql `
   SELECT n.nspname::text AS "relatedSchema", r.relname::text AS "relatedTable",
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS "fromColumns",
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS "toColumns",
    EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.confrelid AND a.attname='deleted_at' AND NOT a.attisdropped) AS "softDelete"
   FROM pg_constraint c JOIN pg_class r ON r.oid=${parents ? Prisma.raw('c.confrelid') : Prisma.raw('c.conrelid')}
    JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE c.contype='f' AND ${parents ? Prisma.raw('c.conrelid') : Prisma.raw('c.confrelid')}=to_regclass(${'public.' + table})
  `);
    }
    private async hasReferences(tx: Prisma.TransactionClient, entity: string, id: number) {
        const table = TRASH_TABLES[this.definition(entity).model];
        for (const fk of await this.foreignKeys(tx, table.table, false)) {
            if (fk.fromColumns.length !== 1 || fk.toColumns[0] !== table.id)
                return true;
            const rows = await tx.$queryRaw<any[]>(Prisma.sql `SELECT 1 FROM ${this.identifier(fk.relatedSchema, fk.relatedTable)} WHERE ${this.identifier(fk.fromColumns[0])}=${id} LIMIT 1`);
            if (rows.length)
                return true;
        }
        return false;
    }
    async cleanup(now = new Date()) {
        if (this.cleaning)
            return;
        this.cleaning = true;
        try {
            const entries = await this.prisma.trashEntry.findMany({ where: { restoredAt: null, purgedAt: null, expiresAt: { lte: now } }, orderBy: { id: 'asc' }, take: 100 });
            for (const e of entries) {
                // A referenced document is kept as an inaccessible historical tombstone; never cascade through live business records.
                try {
                    await this.prisma.$transaction(async (tx) => { await this.lock(tx, e.companyId); const current = await tx.trashEntry.findUnique({ where: { id: e.id } }); if (current?.restoredAt || current?.purgedAt)
                        return; const row = await this.delegate(tx, e.entity).findUnique({ where: { id: e.recordId } }); const retained = !!row?.deletedAt && await this.hasReferences(tx, e.entity, e.recordId); if (row?.deletedAt && !retained)
                        await this.delegate(tx, e.entity).delete({ where: { id: e.recordId } }); if (e.entity === 'users' && !retained) {
                        const state = e.originalState as any;
                        if (state.employee)
                            await tx.employee.deleteMany({ where: { id: state.employee.id, deletedAt: { not: null }, user: { is: null } } });
                    } await tx.trashEntry.update({ where: { id: e.id }, data: { purgedAt: now, retainedForHistory: retained, originalState: {} } }); });
                }
                catch (err) {
                    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
                        await this.prisma.$transaction(async (tx) => { await this.lock(tx, e.companyId); const current = await tx.trashEntry.findUnique({ where: { id: e.id } }); if (current?.restoredAt || current?.purgedAt)
                            return; await tx.trashEntry.update({ where: { id: e.id }, data: { purgedAt: now, retainedForHistory: true, originalState: {} } }); });
                    }
                    else
                        throw err;
                }
            }
        }
        finally {
            this.cleaning = false;
        }
    }
}
