import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';

// Read-only verification against existing inventory; no stock or master records are created.
const db = new PrismaService();
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
let token = '', companyId = 0;
async function api(path: string, expected = 200) {
  const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}`, 'X-Company-Id': String(companyId) } });
  const result = await response.json() as any;
  assert.equal(response.status, expected, path);
  return result.data;
}
async function main() {
  const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL, password: process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD }) });
  assert.equal(response.status, 200, 'Inicio de sesión para verificar');
  const login = (await response.json() as any).data;
  token = login.accessToken; companyId = login.user.companies[0].id;
  const catalogs = await api('/inventory/catalogs');
  assert(catalogs.warehouses.every((warehouse: any) => warehouse.branch.id === warehouse.branchId), 'La sucursal debe tener un identificador estable');
  const branches = await db.branch.findMany({ where: { companyId }, select: { id: true } });
  for (const branch of branches) {
    const where = { product: { companyId }, location: { warehouse: { branch: { id: branch.id, companyId } } } };
    const stockCount = await db.inventoryStock.count({ where });
    const stocks = await api('/inventory/stocks?branchId=' + branch.id + '&limit=1');
    assert.equal(stocks.total, stockCount, 'El total de la sucursal debe calcularse en el servidor');
    assert(stocks.items.every((stock: any) => stock.location.warehouse.branch.id === branch.id));
    if (stockCount > 1) {
      const last = await api('/inventory/stocks?branchId=' + branch.id + '&limit=1&page=' + stockCount);
      assert.equal(last.items.length, 1); assert.equal(last.items[0].location.warehouse.branch.id, branch.id);
    }
    const movementCount = await db.inventoryMovement.count({ where: { stock: where } });
    const movements = await api('/inventory/movements?branchId=' + branch.id + '&limit=1');
    assert.equal(movements.total, movementCount);
    assert(movements.items.every((movement: any) => movement.stock.location.warehouse.branch.id === branch.id));
  }
  await api('/inventory/stocks?branchId=0', 400);
  await api('/inventory/movements?branchId=no-valido', 400);
  console.log('PASS sucursal: identificadores, filtros y paginación reales en existencias y movimientos');
  const all = await api('/inventory/stocks?limit=100');
  const sorted = await db.inventoryStock.findMany({ where: { product: { companyId }, location: { warehouse: { branch: { companyId } } } }, orderBy: [{ product: { name: 'asc' } }, { location: { warehouse: { name: 'asc' } } }, { location: { code: 'asc' } }, { id: 'asc' }], take: 100, select: { id: true } });
  assert.deepEqual(all.items.map((stock: any) => stock.id), sorted.map(stock => stock.id));
  for (const warehouse of catalogs.warehouses.slice(0, 2)) {
    const map = await api('/inventory/map?warehouseId=' + warehouse.id);
    assert.equal(map.branch.id, warehouse.branchId);
    assert(map.locations.every((location: any) => location.stocks.every((stock: any) => Number(stock.quantity) > 0)));
  }
  console.log('PASS orden por producto y espacio; mapa con existencias confirmadas y contexto de sucursal');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
