import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/application/services/audit.service';
import { OrganizationService } from '../src/modules/organization/application/services/organization.service';
import { CustomersService } from '../src/modules/customers/application/services/customers.service';
import { QueryCustomersDto } from '../src/modules/customers/application/dto/query-customers.dto';
import { TrashService } from '../src/modules/trash/trash.service';

// Fixtures, audit events and trash entries share one transaction that always rolls back.
const db = new PrismaService();
const key = 'QA-CUSTOMERS-' + randomUUID().slice(0, 8);
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
const rollback = new Error('ROLLBACK_CUSTOMERS_QA');
let access = '', companyId = 0;
async function api(path: string, method = 'GET', body?: unknown, expected = 200, authenticated = true) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authenticated && access ? { Authorization: 'Bearer ' + access } : {}), ...(companyId ? { 'X-Company-Id': String(companyId) } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expected, path + ': unexpected HTTP status');
  return (await response.json() as { data: any }).data;
}
async function rejectsStatus(task: Promise<unknown>, status: number) {
  await assert.rejects(task, (error: any) => error.getStatus?.() === status);
}
async function main() {
  const login = await api('/auth/login', 'POST', {
    email: process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL,
    password: process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD,
  });
  access = login.accessToken;
  companyId = (await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 } })).companyId;
  const actorId = login.user.id;
  await api('/customers', 'GET', undefined, 401, false);
  for (const query of ['status=invalid', 'page=0', 'limit=101', 'page=abc']) await api('/customers?' + query, 'GET', undefined, 400);
  const result = await api('/customers?status=active&limit=1');
  assert(Array.isArray(result.items));
  assert(result.items.every((row: any) => row.isActive && row.companyId === companyId));
  const entities = await api('/trash/entities');
  assert(entities.some((entity: any) => entity.key === 'customers'));
  for (const payload of [{ name: '   ', countryId: 1 }, { name: null }, { countryId: null }, { email: 'invalid' }]) {
    await api('/customers/2147483647', 'PATCH', payload, 400);
  }
  console.log('PASS HTTP: registered customer routes, authentication, query/body validation and trash registry');

  const country = await db.country.findFirstOrThrow({ where: { isoCode: 'SV', isActive: true } });
  const foreign = await db.country.findFirstOrThrow({ where: { isoCode: { not: 'SV' }, isActive: true } });
  const district = await db.district.findFirstOrThrow({ where: { isActive: true, municipality: { isActive: true, department: { isActive: true } } }, include: { municipality: true } });
  const counts = async () => Promise.all([db.customer.count({ where: { name: { startsWith: key } } }), db.trashEntry.count({ where: { label: { startsWith: key } } }), db.log.count({ where: { controller: 'customers' } })]);
  const before = await counts();
  let verified = false;
  try {
    await db.$transaction(async tx => {
      const scoped = new Proxy(tx, {
        get(target, property) {
          if (property === '$transaction') return (work: any) => typeof work === 'function' ? work(tx) : Promise.all(work);
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as unknown as PrismaService;
      const audit = new AuditService(scoped);
      const service = new CustomersService(scoped, audit, new OrganizationService(db, new AuditService(db)));
      const trash = new TrashService(scoped, audit);
      const input = { name: key + ' Empresa', document: key, countryId: country.id, departmentId: district.municipality.departmentId, municipalityId: district.municipalityId, districtId: district.id, phone: '   ', email: undefined, address: '   ' };
      const customer = await service.create(input, actorId, companyId);
      assert.equal(customer.phone, null); assert.equal(customer.email, null); assert.equal(customer.address, null);
      await rejectsStatus(service.create(input, actorId, companyId), 409);
      await rejectsStatus(service.customer(customer.id, 2147483647), 404);
      await rejectsStatus(service.update(customer.id, { departmentId: null } as any, actorId, companyId), 400);
      await service.update(customer.id, { phone: '555-1111', email: 'cliente@example.com', address: 'Dirección' }, actorId, companyId);
      const cleared = await service.update(customer.id, { phone: null, email: null, address: null } as any, actorId, companyId);
      assert.equal(cleared.phone, null); assert.equal(cleared.email, null); assert.equal(cleared.address, null);
      const abroad = await service.update(customer.id, { countryId: foreign.id }, actorId, companyId);
      assert.equal(abroad.departmentId, null); assert.equal(abroad.municipalityId, null); assert.equal(abroad.districtId, null);
      await service.create({ name: key + ' Otro', countryId: foreign.id }, actorId, companyId);
      const query = Object.assign(new QueryCustomersDto(), { search: key.toLowerCase(), status: 'active', limit: 1 });
      const page = await service.customers(companyId, query);
      assert.equal(page.total, 2); assert.equal(page.totalPages, 2); assert.equal(page.items.length, 1);
      await service.updateStatus(customer.id, false, actorId, companyId);
      const inactive = await service.customers(companyId, Object.assign(new QueryCustomersDto(), { search: key, status: 'inactive' }));
      assert.equal(inactive.total, 1); assert.equal(inactive.items[0]!.id, customer.id);
      console.log('PASS customer lifecycle: optional fields, duplicate documents, company isolation, valid location and paginated search');

      const entry = await trash.trash('customers', customer.id, actorId, companyId);
      assert.equal(Math.round((entry.expiresAt.getTime() - Date.now()) / 86400000), 30);
      await rejectsStatus(service.customer(customer.id, companyId), 404);
      await rejectsStatus(service.create(input, actorId, companyId), 409);
      await rejectsStatus(trash.restore(entry.id, 2147483647, actorId), 404);
      await trash.restore(entry.id, companyId, actorId);
      const recovered = await service.customer(customer.id, companyId);
      assert.equal(recovered.id, customer.id); assert.equal(recovered.isActive, false); assert.equal(recovered.document, key);
      const expired = await trash.trash('customers', customer.id, actorId, companyId);
      await tx.trashEntry.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await rejectsStatus(trash.restore(expired.id, companyId, actorId), 409);
      const actions = (await tx.log.findMany({ where: { controller: 'customers', recordId: customer.id }, select: { action: true } })).map(event => event.action);
      for (const action of ['CREATE', 'UPDATE', 'DEACTIVATE', 'TRASH', 'RESTORE']) assert(actions.includes(action));
      verified = true;
      console.log('PASS trash: 30-day recovery, original state and audit retained, expired/cross-company recovery rejected');
      throw rollback;
    }, { timeout: 45000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert(verified);
  assert.deepEqual(await counts(), before);
  console.log('PASS rollback: no fictitious customers, trash entries or customer audit events persisted');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
