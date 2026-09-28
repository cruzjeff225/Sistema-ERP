import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
const db = new PrismaService();
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
let authorization = '';
let productId = 0, branchId = 0, warehouseId = 0, locationId = 0;
let supplierId = 0, requestId = 0, quotationId = 0, orderId = 0, purchaseId = 0;
let secondaryRequestId = 0, cancelledQuotationId = 0;
let secondWarehouseId = 0, unitId = 0, readerId = 0, employeeId = 0, roleId = 0;
const mapLocationIds: number[] = [];
async function request(path: string, method = 'GET', body?: unknown, companyId?: number) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}), ...(companyId ? { 'X-Company-Id': String(companyId) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function api(path: string, method = 'GET', body?: unknown, expected = method === 'POST' ? 201 : 200) {
  const response = await request(path, method, body);
  const payload = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(payload)}`);
  return payload.data;
}
async function run() {
  const config = await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 }, include: { company: true } });
  assert.equal(config.company.commercialName.toLowerCase(), 'atlas roofing');
  const companiesBefore = await db.company.count();
  const email = process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password = process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  assert(email && password, 'Faltan credenciales de prueba');
  const login = await api('/auth/login', 'POST', { email, password }, 200);
  authorization = `Bearer ${login.accessToken}`;
  assert.deepEqual(login.user.companies.map((company: { id: number }) => company.id), [config.companyId]);
  assert.deepEqual((await api('/companies')).map((company: { id: number }) => company.id), [config.companyId]);
  const other = await db.company.findFirstOrThrow({ where: { id: { not: config.companyId }, isActive: true, deletedAt: null } });
  for (const path of ['/branches', '/suppliers', '/products', '/purchase-orders', '/purchases', '/retaceos', '/inventory/stocks', '/inventory/movements']) {
    assert.equal((await request(path, 'GET', undefined, other.id)).status, 403, path);
    await api(path);
  }
  assert.equal((await request(`/companies/${other.id}`)).status, 403);
  await api(`/companies/${config.companyId}/status`, 'PATCH', { isActive: false }, 409);
  console.log('PASS Empresa fija en login, catalogos y APIs; cambio por cabecera rechazado');

  const key = randomUUID().slice(0, 8);
  const template = await db.product.findFirstOrThrow({ where: { isActive: true, deletedAt: null } });
  const category = await db.warehouseCategory.findFirstOrThrow({ where: { isActive: true } });
  const c = config.company;
  const branch = await db.branch.create({ data: { companyId: c.id, name: `QA SINGLE ${key}`, address: 'QA', departmentId: c.departmentId, municipalityId: c.municipalityId, districtId: c.districtId } }); branchId = branch.id;
  const warehouse = await db.warehouse.create({ data: { branchId, categoryId: category.id, name: `QA ${key}` } }); warehouseId = warehouse.id;
  const location = await db.location.create({ data: { warehouseId, code: `QA-${key}`, aisle: 'QA', rack: '1', level: '1', position: '1', capacity: 100 } }); locationId = location.id;
  const product = await db.product.create({ data: { companyId: c.id, categoryId: template.categoryId, subcategoryId: template.subcategoryId, purchaseUnitId: template.purchaseUnitId, saleUnitId: template.saleUnitId, sku: `SINGLE-${key}`, internalCode: `SINGLE-${key}`, name: `QA SINGLE ${key}` } }); productId = product.id;
  const dto = { productId, locationId, quantity: 2.5, reason: 'Entrada de prueba aislada', requestId: randomUUID() };
  const entered = await api('/inventory/adjustments', 'POST', dto);
  assert.equal((await api('/inventory/adjustments', 'POST', dto)).id, entered.id);
  await api('/inventory/adjustments', 'POST', { ...dto, quantity: 3 }, 409);
  await api('/inventory/adjustments', 'POST', { ...dto, quantity: -3, requestId: randomUUID() }, 409);
  await api('/inventory/adjustments', 'POST', { ...dto, quantity: 0, requestId: randomUUID() }, 400);
  await api('/inventory/adjustments', 'POST', { ...dto, quantity: 0.001, requestId: randomUUID() }, 400);
  const result = await api(`/inventory/stocks?productId=${productId}`);
  assert.equal(result.total, 1); assert.equal(Number(result.items[0].quantity), 2.5);
  const ledger = await api(`/inventory/movements?productId=${productId}`);
  assert.equal(ledger.total, 1); assert.equal(Number(ledger.items[0].balance), 2.5);
  assert.equal(await db.log.count({ where: { controller: 'inventory', recordId: entered.id, userId: login.user.id } }), 1);
  assert.equal(await db.company.count(), companiesBefore);
  console.log('PASS Inventario Atlas: ajuste, idempotencia, validaciones, saldo, kardex y auditoria');
  await api(`/locations/${locationId}`, 'PATCH', { capacity: 2 }, 409);
  assert.equal((await db.location.findUniqueOrThrow({ where: { id: locationId } })).capacity, 100);
  await api(`/locations/${locationId}`, 'PATCH', { capacity: null }, 400);
  await api(`/locations/${locationId}`, 'PATCH', { capacity: 0 }, 400);
  await api(`/locations/${locationId}`, 'PATCH', { code: '   ' }, 400);
  await api(`/locations/${locationId}`, 'PATCH', { notes: 'Temporal', capacity: 3 });
  await api(`/locations/${locationId}`, 'PATCH', { notes: null, capacity: 100 });
  assert.equal((await db.location.findUniqueOrThrow({ where: { id: locationId } })).notes, null);
  await api(`/branches/${branchId}`, 'PATCH', { name: '   ' }, 400);
  await api(`/warehouses/${warehouseId}`, 'PATCH', { name: null }, 400);
  console.log('PASS Organizacion: capacidad protege existencias, campos vacios rechazados y notas eliminables');
  unitId = (await db.productUnit.create({ data: { name: `QA UNIT ${key}`, type: 'purchase' } })).id;
  secondWarehouseId = (await db.warehouse.create({ data: { branchId, categoryId: category.id, name: `QA DESTINO ${key}` } })).id;
  await api(`/products/${productId}`, 'PATCH', { purchaseUnitId: unitId }, 409);
  await api(`/products/${productId}/status`, 'PATCH', { isActive: false }, 409);
  await api(`/locations/${locationId}`, 'PATCH', { warehouseId: secondWarehouseId }, 409);
  for (const path of [`/locations/${locationId}`, `/warehouses/${warehouseId}`, `/branches/${branchId}`]) await api(`${path}/status`, 'PATCH', { isActive: false }, 409);
  assert.equal((await db.location.findUniqueOrThrow({ where: { id: locationId } })).warehouseId, warehouseId);
  console.log('PASS Historial: unidad y ubicacion protegidas; producto, sucursal y almacen con stock no desactivables');

  const withdrawals = await Promise.all([request('/inventory/adjustments', 'POST', { ...dto, quantity: -2, requestId: randomUUID() }), request('/inventory/adjustments', 'POST', { ...dto, quantity: -2, requestId: randomUUID() })]);
  assert.deepEqual(withdrawals.map(r => r.status).sort(), [201, 409]);
  assert.equal(Number((await api(`/inventory/stocks?productId=${productId}`)).items[0].quantity), 0.5);
  await api('/inventory/adjustments', 'POST', { ...dto, quantity: 2, requestId: randomUUID() });
  const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
  const filtered = await api(`/inventory/movements?productId=${productId}&type=ADJUSTMENT&dateFrom=${localToday}&dateTo=${localToday}&limit=1`);
  assert.equal(filtered.total, 3); assert.equal(filtered.items.length, 1); assert.equal(filtered.totalPages, 3);
  assert.equal((await api(`/inventory/movements?productId=${productId}&type=RECEIPT`)).total, 0);
  await api('/inventory/movements?type=UNKNOWN', 'GET', undefined, 400);
  await api('/inventory/movements?dateFrom=2026-02-30', 'GET', undefined, 400);
  await api('/inventory/movements?dateFrom=2026-09-25&dateTo=2026-09-24', 'GET', undefined, 400);
  console.log('PASS Concurrencia de salidas, filtros de kardex, fechas y paginacion');

  const readerPassword = `Qa!${randomUUID()}9`;
  const permission = await db.permission.findUniqueOrThrow({ where: { action: 'inventory.view' } });
  roleId = (await db.role.create({ data: { name: `qa-reader-${key}`, rolePermissions: { create: { permissionId: permission.id } } } })).id;
  employeeId = (await db.employee.create({ data: { code: `QA-${key}`, fullName: 'QA Inventory Reader' } })).id;
  readerId = (await db.user.create({ data: { employeeId, username: `qa-reader-${key}`, email: `qa-${key}@example.test`, passwordHash: await argon2.hash(readerPassword), userRoles: { create: { roleId } }, userCompanies: { create: { companyId: c.id } } } })).id;
  const readerLogin = await api('/auth/login', 'POST', { email: `qa-${key}@example.test`, password: readerPassword }, 200);
  const adminAuthorization = authorization;
  authorization = `Bearer ${readerLogin.accessToken}`;
  try {
    await api('/inventory/stocks'); await api('/inventory/movements');
    await api('/inventory/adjustments', 'POST', { ...dto, requestId: randomUUID() }, 403);
  } finally { authorization = adminAuthorization; }
  console.log('PASS RBAC: usuario lector consulta inventario pero no registra ajustes');
  const country = await db.country.findFirstOrThrow();
  supplierId = (await db.supplier.create({ data: { companyId: c.id, countryId: country.id, name: `QA SINGLE ${key}`, code: `QA-${key}` } })).id;
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const req = await api('/purchase-requests', 'POST', { branchId, warehouseId, requiredDate: future, purpose: "operations", justification: 'Prueba aislada Atlas', details: [{ productId, unitId: product.purchaseUnitId, quantity: 2 }] }); requestId = req.id;
  await api(`/purchase-requests/${requestId}/submit`, 'POST', {});
  await db.product.update({ where: { id: productId }, data: { isActive: false } });
  await api(`/purchase-requests/${requestId}/approve`, 'POST', {}, 400);
  await db.product.update({ where: { id: productId }, data: { isActive: true } });
  await api(`/purchase-requests/${requestId}/approve`, 'POST', {});
  const secondary = await api('/purchase-requests', 'POST', { branchId, warehouseId, requiredDate: future, purpose: "operations", justification: 'Segunda solicitud QA', details: [{ productId, unitId: product.purchaseUnitId, quantity: 2 }] }); secondaryRequestId = secondary.id;
  for (const action of ['submit', 'approve']) await api(`/purchase-requests/${secondary.id}/${action}`, 'POST', {});
  const quoteDto = { supplierId, requestIds: [requestId], quotationDate: today, validUntil: future, currency: 'USD', details: [{ productId, unitId: product.purchaseUnitId, quantity: 2, availableQuantity: 2, unitPrice: 10, taxRate: 0, sources: [{ requestDetailId: req.details[0].id, quantity: 2 }] }] };
  await api('/purchase-quotations', 'POST', { ...quoteDto, requestIds: [requestId, secondary.id] }, 400);
  const cancelledQuote = await api('/purchase-quotations', 'POST', quoteDto); cancelledQuotationId = cancelledQuote.id;
  assert.equal((await api(`/purchase-requests/${requestId}`)).status, 'in_quotation');
  await api(`/purchase-quotations/${cancelledQuote.id}`, 'PATCH', { requestIds: [secondary.id], details: [{ ...quoteDto.details[0], sources: [{ requestDetailId: secondary.details[0].id, quantity: 2 }] }] });
  assert.equal((await api(`/purchase-requests/${requestId}`)).status, 'approved');
  assert.equal((await api(`/purchase-requests/${secondary.id}`)).status, 'in_quotation');
  await api(`/purchase-quotations/${cancelledQuote.id}/cancel`, 'POST', { reason: 'Cancelacion de cotizacion QA' });
  assert.equal((await api(`/purchase-requests/${secondary.id}`)).status, 'approved');
  const quote = await api('/purchase-quotations', 'POST', quoteDto); quotationId = quote.id;
  await db.product.update({ where: { id: productId }, data: { isActive: false } });
  await api(`/purchase-quotations/${quotationId}/receive`, 'POST', {}, 400);
  await api('/purchase-quotations', 'POST', quoteDto, 400);
  await db.product.update({ where: { id: productId }, data: { isActive: true } });
  console.log('PASS Compras: aprobacion revalidada, cotizacion sin origen rechazada y estados sincronizados al editar/cancelar');
  for (const action of ['receive', 'select']) await api(`/purchase-quotations/${quotationId}/${action}`, 'POST', {});
  const order = await api(`/purchase-orders/from-quotation/${quotationId}`, 'POST', { branchId, warehouseId, expectedDate: future }); orderId = order.id;
  for (const action of ['submit', 'approve']) await api(`/purchase-orders/${orderId}/${action}`, 'POST', {});
  await db.location.update({ where: { id: locationId }, data: { capacity: 3 } });
  await api(`/purchase-orders/${orderId}/receive`, 'POST', { items: [{ orderDetailId: order.details[0].id, quantity: 1 }] }, 409);
  assert.equal((await api(`/purchase-orders/${orderId}`)).purchases.length, 0);
  await db.location.update({ where: { id: locationId }, data: { capacity: 100 } });
  const receiveDto = { requestId: randomUUID(), supplierInvoiceDate: today, items: [{ orderDetailId: order.details[0].id, quantity: 1 }] };
  const received = await api(`/purchase-orders/${orderId}/receive`, 'POST', receiveDto); purchaseId = received.purchases[0].id;
  const retries = await Promise.all([api(`/purchase-orders/${orderId}/receive`, 'POST', receiveDto), api(`/purchase-orders/${orderId}/receive`, 'POST', receiveDto)]);
  for (const retry of retries) { assert.equal(retry.purchases.length, 1); assert.equal(retry.purchases[0].id, purchaseId); }
  await api(`/purchase-orders/${orderId}/receive`, 'POST', { ...receiveDto, items: [{ ...receiveDto.items[0], quantity: 0.5 }] }, 409);
  const receiptDetail = await api(`/purchases/${purchaseId}`);
  assert.equal(receiptDetail.items[0].location.aisle, 'QA');
  assert.equal((await api(`/purchases?search=${order.code}`)).items[0].id, purchaseId);
  assert.equal((await api(`/purchases?search=${product.sku}`)).items[0].id, purchaseId);
  assert.equal((await api(`/purchases/${purchaseId}`, 'PATCH', { supplierInvoiceDate: null })).supplierInvoiceDate, null);
  console.log('PASS Recepciones: reintentos sin duplicados, contenido cambiado rechazado, busqueda y correccion de factura');
  const mapped = await api(`/inventory/map?warehouseId=${warehouseId}`);
  assert.equal(mapped.locations.length, 1);
  assert.equal(mapped.locations[0].id, locationId);
  assert.equal(Number(mapped.locations[0].stocks[0].quantity), 3.5);
  assert.equal(mapped.locations[0].state, 'OCCUPIED');
  assert.equal((await api(`/inventory/movements?productId=${productId}&locationId=${locationId}&type=RECEIPT`)).total, 1);
  for (const [index, isActive] of [true, false].entries()) {
    const extra = await db.location.create({ data: { warehouseId, code: `QA-MAP-${key}-${index}`, aisle: 'QA', rack: '2', level: '2', position: String(index + 1), capacity: 5, isActive } });
    mapLocationIds.push(extra.id);
  }
  const updatedMap = await api(`/inventory/map?warehouseId=${warehouseId}`);
  assert.equal(updatedMap.locations.length, 3);
  assert.equal(updatedMap.locations.find((l: any) => l.id === mapLocationIds[0]).state, 'AVAILABLE');
  assert.equal(updatedMap.locations.find((l: any) => l.id === mapLocationIds[1]).state, 'INACTIVE');
  await api('/inventory/map?warehouseId=0', 'GET', undefined, 400);
  assert.equal((await request(`/inventory/map?warehouseId=${warehouseId}`, 'GET', undefined, other.id)).status, 403);
  console.log('PASS Ubicacion automatica, falta de capacidad sin escrituras parciales y mapa de existencias');
  assert.equal(received.status, 'partially_received');
  assert.equal(Number((await api(`/inventory/stocks?productId=${productId}`)).items[0].quantity), 3.5);
  await api(`/purchases/${purchaseId}/cancel`, 'POST', { reason: 'Reversion de prueba aislada' });
  assert.equal(Number((await api(`/inventory/stocks?productId=${productId}`)).items[0].quantity), 2.5);
  assert.equal(Number((await api(`/purchase-orders/${orderId}`)).details[0].receivedQuantity), 0);
  await api(`/purchases/${purchaseId}/cancel`, 'POST', { reason: 'No duplicar reversion' }, 409);
  await api(`/purchase-orders/${orderId}/receive`, 'POST', receiveDto, 409);
  console.log('PASS Flujo Atlas: solicitud, cotizacion, orden, recepcion parcial, inventario y reversion unica');
}
async function cleanup() {
  if (mapLocationIds.length) await db.location.deleteMany({ where: { id: { in: mapLocationIds } } });
  if (readerId) { await db.log.deleteMany({ where: { userId: readerId } }); await db.user.delete({ where: { id: readerId } }); }
  if (employeeId) await db.employee.delete({ where: { id: employeeId } });
  if (roleId) await db.role.delete({ where: { id: roleId } });
  if (productId) {
    const records = await db.inventoryMovement.findMany({ where: { stock: { productId } }, select: { id: true } });
    await db.log.deleteMany({ where: { controller: 'inventory', recordId: { in: records.map(r => r.id) } } });
    await db.inventoryMovement.deleteMany({ where: { stock: { productId } } });
    for (const [controller, id] of [['purchase_requests', requestId], ['purchase_requests', secondaryRequestId], ['purchase_quotations', quotationId], ['purchase_quotations', cancelledQuotationId], ['purchase_orders', orderId], ['purchases', purchaseId]] as const) {
      if (id) await db.log.deleteMany({ where: { controller, recordId: id } });
    }
    if (purchaseId) await db.purchase.delete({ where: { id: purchaseId } });
    if (orderId) await db.purchaseOrder.delete({ where: { id: orderId } });
    if (quotationId) await db.purchaseQuotation.delete({ where: { id: quotationId } });
    if (cancelledQuotationId) await db.purchaseQuotation.delete({ where: { id: cancelledQuotationId } });
    if (secondaryRequestId) await db.purchaseRequest.delete({ where: { id: secondaryRequestId } });
    if (requestId) await db.purchaseRequest.delete({ where: { id: requestId } });
    if (supplierId) await db.supplier.delete({ where: { id: supplierId } });
    await db.inventoryStock.deleteMany({ where: { productId } });
    await db.product.delete({ where: { id: productId } });
  }
  if (locationId) await db.location.delete({ where: { id: locationId } });
  if (warehouseId) await db.warehouse.delete({ where: { id: warehouseId } });
  if (secondWarehouseId) await db.warehouse.delete({ where: { id: secondWarehouseId } });
  if (branchId) await db.branch.delete({ where: { id: branchId } });
  if (unitId) await db.productUnit.delete({ where: { id: unitId } });
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { try { await cleanup(); } finally { await db.$disconnect(); } });
