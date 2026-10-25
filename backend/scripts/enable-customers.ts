import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/application/services/audit.service';

// Enable only the customer directory. Do not rerun the general seed or change other roles.
const actions = [
  ['customers.view', 'Consultar clientes'], ['customers.create', 'Registrar clientes'], ['customers.update', 'Actualizar clientes'],
  ['customers.activate', 'Activar clientes'], ['customers.deactivate', 'Desactivar clientes'],
] as const;
const db = new PrismaService();
async function main() {
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(68432, 1)::text`;
    const previous = await tx.module.findUnique({ where: { name: 'customers' } });
    const module = await tx.module.upsert({ where: { name: 'customers' }, create: { name: 'customers', description: 'Directorio de clientes de Ventas' }, update: { isActive: true, deletedAt: null } });
    const superadmin = await tx.role.findUnique({ where: { name: 'superadmin' } });
    for (const [action, name] of actions) {
      const permission = await tx.permission.upsert({ where: { action }, create: { action, name, moduleId: module.id, isSystem: true }, update: { moduleId: module.id, isActive: true, deletedAt: null } });
      if (superadmin) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: superadmin.id, permissionId: permission.id } }, create: { roleId: superadmin.id, permissionId: permission.id }, update: {} });
    }
    await new AuditService(db).record(tx, { controller: 'customers', action: 'ENABLE_MODULE', recordId: module.id, originalData: previous, modifiedData: { module: 'customers', actions: actions.map(([action]) => action) } });
    return { module: module.name, permissions: actions.length };
  });
  console.log(JSON.stringify({ enabled: result, customerRecordsChanged: false, otherRolesChanged: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());
