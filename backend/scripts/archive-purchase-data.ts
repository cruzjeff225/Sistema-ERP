import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/application/services/audit.service';
import { TrashService } from '../src/modules/trash/trash.service';
import { TRASH_ENTITIES, trashScope, type TrashEntity } from '../src/modules/trash/trash.registry';

// Explicit one-time maintenance requested by the user. No physical deletion or stock reversal.
const entities: TrashEntity[] = ['purchase_expense_documents', 'purchase_expenses', 'retaceos', 'purchases', 'purchase_orders', 'purchase_quotations', 'rfqs', 'purchase_processes', 'purchase_requests', 'transfers', 'supplier_contacts', 'suppliers', 'expense_types'];
const details: Record<string, unknown> = {
  purchase_requests: { details: true },
  purchase_quotations: { details: { include: { requestDetailLinks: true } }, requestLinks: true, expenses: true },
  purchase_orders: { details: true, expenses: { include: { documents: true } } },
  purchases: { items: true, actualExpenses: { include: { allocations: true } } },
  retaceos: { details: true, expenseAllocations: true },
  purchase_processes: { lines: { include: { sources: true } } },
  rfqs: { lines: true }, transfers: { items: true }, suppliers: { contacts: true },
};
const db = new PrismaService();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main() {
  const config = await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 }, include: { company: true } });
  const companyId = Number(process.argv.find(argument => argument.startsWith('--company='))?.split('=')[1] ?? config.companyId);
  assert.equal(companyId, config.companyId, 'This maintenance only targets the configured ERP company');
  const scope = (entity: TrashEntity) => trashScope(entity, companyId);
  const counts = await Promise.all(entities.map(async entity => ({ entity, active: await (db as any)[TRASH_ENTITIES[entity].model].count({ where: { ...scope(entity), deletedAt: null } }) })));
  console.log(JSON.stringify({ companyId, company: config.company.commercialName, mode: process.argv.includes('--archive') ? 'archive' : 'inspect', counts }));
  if (!process.argv.includes('--archive')) return;
  assert(process.argv.includes('--company=' + companyId), 'Archival requires an explicit --company=<id>');
  const actor = await db.user.findFirstOrThrow({ where: { isActive: true, deletedAt: null, userRoles: { some: { role: { name: 'superadmin', isActive: true, deletedAt: null } } } } });
  const directory = resolve('tmp/purchase-backups', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(directory, { recursive: true });
  const snapshotPath = resolve(directory, 'before.json');
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(68431, ${companyId}::integer)::text`;
    const data: Record<string, any[]> = {};
    for (const entity of entities) data[entity] = await (tx as any)[TRASH_ENTITIES[entity].model].findMany({ where: scope(entity), ...(details[entity] ? { include: details[entity] } : {}), orderBy: { id: 'asc' } });
    const stockWhere = { product: { companyId } };
    const stocks = await tx.inventoryStock.findMany({ where: stockWhere, orderBy: { id: 'asc' } });
    const movements = await tx.inventoryMovement.findMany({ where: { stock: stockWhere }, orderBy: { id: 'asc' } });
    const beforeStockHash = hash(stocks), beforeMovementHash = hash(movements);
    const snapshot = { schema: 1, companyId, createdAt: new Date().toISOString(), generalWarehouseId: config.generalWarehouseId, data, stocks, movements };
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    const scoped = new Proxy(tx, { get(target, property) {
      if (property === '$transaction') return (work: any) => typeof work === 'function' ? work(tx) : Promise.all(work);
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } }) as unknown as PrismaService;
    const trash = new TrashService(scoped, new AuditService(scoped));
    const archived: Array<{ entity: TrashEntity; recordId: number; trashId: number; expiresAt: Date }> = [];
    for (const entity of entities) for (const record of data[entity]!) {
      if (record.deletedAt) continue;
      const entry = await trash.trash(entity, record.id, actor.id, companyId);
      archived.push({ entity, recordId: record.id, trashId: entry.id, expiresAt: entry.expiresAt });
    }
    assert.equal(hash(await tx.inventoryStock.findMany({ where: stockWhere, orderBy: { id: 'asc' } })), beforeStockHash, 'Archival must preserve every stock balance');
    assert.equal(hash(await tx.inventoryMovement.findMany({ where: { stock: stockWhere }, orderBy: { id: 'asc' } })), beforeMovementHash, 'Archival must preserve every inventory movement');
    for (const entity of entities) assert.equal(await (tx as any)[TRASH_ENTITIES[entity].model].count({ where: { ...scope(entity), deletedAt: null } }), 0, entity + ' must be empty in management');
    return { companyId, archived, snapshotPath, snapshotHash: hash(snapshot), stockHash: beforeStockHash, movementHash: beforeMovementHash, stocksPreserved: stocks.length, movementsPreserved: movements.length };
  }, { timeout: 120000, maxWait: 20000 });
  writeFileSync(resolve(directory, 'archived.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: 'PASS', companyId, archived: result.archived.length, recoveryDays: 30, stocksPreserved: result.stocksPreserved, movementsPreserved: result.movementsPreserved, backup: directory }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
