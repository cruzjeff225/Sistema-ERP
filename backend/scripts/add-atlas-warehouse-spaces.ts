import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';

const db = new PrismaService();
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
const apply = process.argv.includes('--apply');
const normalize = (value: string) => /^\d+$/.test(value.trim()) ? String(Number(value)) : value.trim().toUpperCase();

async function main() {
  const config = await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 }, include: { company: true } });
  assert.equal(config.companyId, 3, 'La empresa configurada cambio; revise el destino');
  const warehouses = await db.warehouse.findMany({
    where: { id: { in: [1, 18, 29] }, isActive: true, deletedAt: null, branch: { companyId: config.companyId, isActive: true, deletedAt: null } },
    include: { locations: true },
  });
  assert.equal(warehouses.length, 3, 'Revise los almacenes antes de continuar');
  const stockBefore = JSON.stringify(await db.inventoryStock.findMany({ orderBy: { id: 'asc' } }));
  const email = process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password = process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  let token = '';
  if (apply) {
    assert(email && password, 'Faltan credenciales locales');
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(login.status, 200, 'No se pudo autenticar');
    token = (await login.json()).data.accessToken;
  }
  let created = 0, skipped = 0;
  for (const warehouse of warehouses) {
    let count = 0;
    for (const aisle of ['A', 'B']) for (const rack of ['2', '3']) for (const position of ['1', '2']) {
      const level = '1';
      const code = `ALM-${warehouse.id}-${aisle}-E${rack}-N${level}-P${position}`;
      const exists = warehouse.locations.some(location => location.code === code ||
        normalize(location.aisle) === aisle && normalize(location.rack) === rack &&
        normalize(location.level) === level && normalize(location.position) === position);
      if (exists) { skipped++; continue; }
      const data = { warehouseId: warehouse.id, code, aisle, rack, level, position, capacity: 100,
        notes: 'Distribucion inicial de espacios. Capacidad referencial: validar contra la bodega fisica antes de uso operativo.' };
      if (apply) {
        const response: Awaited<ReturnType<typeof fetch>> = await fetch(base + '/locations', { method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Company-Id': String(config.companyId) },
          body: JSON.stringify(data) });
        assert.equal(response.status, 201, `No se pudo crear ${code}: ${await response.text()}`);
        const saved = await db.location.findFirstOrThrow({ where: { warehouseId: warehouse.id, code } });
        assert(saved.isActive && saved.capacity === 100);
      }
      count++; created++;
    }
    console.log(`${warehouse.name}: ${count} espacios ${apply ? 'creados' : 'previstos'}`);
  }
  assert.equal(JSON.stringify(await db.inventoryStock.findMany({ orderBy: { id: 'asc' } })), stockBefore, 'Las existencias cambiaron durante la ejecucion');
  console.log(`Total: ${created}; existentes omitidos: ${skipped}. Existencias conservadas.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
