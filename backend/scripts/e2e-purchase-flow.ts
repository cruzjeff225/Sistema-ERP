// End-to-end check of the whole purchasing flow through the HTTP API: request -> quantities -> RFQs -> offers ->
// order -> receipts -> placement -> costs -> distribution -> branch delivery. After every step it compares what
// the purchase tracking says (stage, owner, next step) with what really happened.
//
// It creates its own temporary master data and removes everything it created, even when an assertion fails.
// Needs the API running (ERP_TEST_API_URL, default http://localhost:3000/api) and an administrator account
// (ERP_TEST_EMAIL / ERP_TEST_PASSWORD, or the SEED_ADMIN_* values). Run with: npm run e2e:purchases
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';

const db = new PrismaService();
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
let token = '', companyId = 0;
const created = { requests: [] as number[], consolidations: [] as number[], quotes: [] as number[], orders: [] as number[], receipts: [] as number[], retaceos: [] as number[], transfers: [] as number[],
  products: [] as number[], suppliers: [] as number[], locations: [] as number[], warehouses: [] as number[], branches: [] as number[], units: [] as number[], expenseTypes: [] as number[], categories: [] as number[], subcategories: [] as number[] };
let restoreGeneralWarehouse: { restore: boolean } = { restore: false };

async function api(path: string, method = 'GET', body?: unknown, expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(companyId ? { 'X-Company-Id': String(companyId) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text.slice(0, 800)}`);
  return JSON.parse(text).data;
}

type Tracking = { stages: { id: string; state: string; owner: string; progress?: { done: number; total: number } }[]; nextStep: { owner: string; label: string; stage: string } | null; alsoAvailable: { label: string }[]; completed: boolean; blockers: unknown[] };
const stageOf = (t: Tracking, id: string) => t.stages.find(s => s.id === id)!;
/** Asserts the tracking of the process that contains `type/id`: who must act and what the next step says. */
async function expectNext(step: string, type: string, id: number, owner: string, label: RegExp, extra?: (t: Tracking) => void) {
  const t: Tracking = await api(`/purchases/tracking/${type}/${id}`);
  assert.ok(t.nextStep, `${step}: el seguimiento no indica un siguiente paso`);
  assert.equal(t.nextStep.owner, owner, `${step}: responsable (${t.nextStep.label})`);
  assert.match(t.nextStep.label, label, `${step}: siguiente paso`);
  extra?.(t);
  console.log(`PASS ${step} -> [${t.nextStep.owner}] ${t.nextStep.label}`);
  return t;
}

const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
const future = new Date(Date.now() + 7 * 86400000).toISOString();

async function main() {
  const login = await api('/auth/login', 'POST', { email: process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL, password: process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD }, 200);
  token = login.accessToken; companyId = login.user.companies[0].id;
  const config = await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 }, include: { company: true, generalWarehouse: true } });
  const key = randomUUID().slice(0, 8);
  const place = { departmentId: config.company.departmentId, municipalityId: config.company.municipalityId, districtId: config.company.districtId };
  const warehouseCategory = config.generalWarehouse?.categoryId ?? (await db.warehouseCategory.findFirstOrThrow()).id;

  // --- Temporary master data -------------------------------------------------------------------------------------
  const category = await db.productCategory.create({ data: { name: `E2E ${key}` } }); created.categories.push(category.id);
  const subcategory = await db.productSubcategory.create({ data: { categoryId: category.id, name: `E2E ${key}` } }); created.subcategories.push(subcategory.id);
  const purchaseUnit = await db.productUnit.create({ data: { name: `E2E compra ${key}`, type: 'purchase' } }); created.units.push(purchaseUnit.id);
  const saleUnit = await db.productUnit.create({ data: { name: `E2E venta ${key}`, type: 'sale' } }); created.units.push(saleUnit.id);
  const product = await db.product.create({ data: { companyId, categoryId: category.id, subcategoryId: subcategory.id, purchaseUnitId: purchaseUnit.id, saleUnitId: saleUnit.id, sku: `E2E-${key}`, internalCode: `E2E-${key}`, name: `E2E producto ${key}` } }); created.products.push(product.id);
  const suppliers = [];
  for (let n = 0; n < 2; n++) suppliers.push(await db.supplier.create({ data: { companyId, code: `E2E-${key}-${n}`, name: `E2E proveedor ${key} ${n}`, countryId: 1 } }));
  created.suppliers.push(...suppliers.map(s => s.id));
  const expenseType = await db.expenseType.create({ data: { companyId, name: `E2E gasto ${key}` } }); created.expenseTypes.push(expenseType.id);

  const makeSite = async (label: string) => {
    const branch = await db.branch.create({ data: { companyId, name: `E2E ${label} ${key}`, address: 'E2E', ...place } }); created.branches.push(branch.id);
    const warehouse = await db.warehouse.create({ data: { branchId: branch.id, categoryId: warehouseCategory, name: `E2E ${label} ${key}` } }); created.warehouses.push(warehouse.id);
    const location = await db.location.create({ data: { warehouseId: warehouse.id, code: `E2E-${label}-${key}`.slice(0, 40), aisle: 'E2E', rack: 'E2E', level: '1', position: '1', capacity: 10000 } }); created.locations.push(location.id);
    return { branch, warehouse, location };
  };
  const branchSite = await makeSite('SUC');
  let general = config.generalWarehouse;
  let generalBranchId = general?.branchId ?? 0;
  if (!general) { // Fresh database: use a temporary receiving center and put the configuration back afterwards.
    const site = await makeSite('CENTRO');
    await db.erpConfiguration.update({ where: { id: 1 }, data: { generalWarehouseId: site.warehouse.id } });
    restoreGeneralWarehouse = { restore: true };
    general = site.warehouse; generalBranchId = site.branch.id;
  }
  const slot = await db.location.create({ data: { warehouseId: general.id, code: `E2E-${key}`, aisle: 'E2E', rack: 'E2E', level: '1', position: '1', capacity: 10000 } }); created.locations.push(slot.id);

  // --- 1. Request ------------------------------------------------------------------------------------------------
  const request = await api('/purchase-requests', 'POST', { branchId: branchSite.branch.id, warehouseId: general.id, purpose: 'resale', requiredDate: future, justification: `E2E ${key}`, details: [{ productId: product.id, unitId: purchaseUnit.id, quantity: 100 }] });
  created.requests.push(request.id);
  await expectNext('1. solicitud en borrador', 'request', request.id, 'Sucursal', /Enviar la solicitud .* a Compras/, t => assert.equal(stageOf(t, 'requests').state, 'in_progress'));
  await api(`/purchase-requests/${request.id}/submit`, 'POST');
  await expectNext('2. solicitud enviada', 'request', request.id, 'Compras', /Reunir las solicitudes en una gestión/);

  // --- 2. Quantities ---------------------------------------------------------------------------------------------
  let c = await api('/supply/consolidations', 'POST', { dateFrom: date, dateTo: date, requestIds: [request.id] }); created.consolidations.push(c.id);
  await expectNext('3. gestión creada', 'request', request.id, 'Compras', /Enviar las cantidades a Gerencia/);
  c = await api(`/supply/consolidations/${c.id}/lines`, 'PATCH', { productId: product.id, purchaseQuantity: 120, reason: 'E2E reserva de stock' });
  assert.equal(Number(c.lines[0].requestedQuantity), 100); assert.equal(Number(c.lines[0].purchaseQuantity), 120);
  c = await api(`/supply/consolidations/${c.id}/quantities/submit`, 'POST', { expectedRevision: c.quantityRevision });
  await expectNext('4. cantidades enviadas', 'consolidation', c.id, 'Gerencia', /autorizar las cantidades/);
  c = await api(`/supply/consolidations/${c.id}/quantities/approve`, 'POST', { expectedRevision: c.quantityRevision });
  await expectNext('5. cantidades autorizadas', 'request', request.id, 'Compras', /Preparar la solicitud de precios/, t => assert.equal(stageOf(t, 'quantities').state, 'complete'));

  // --- 3. Quotation ----------------------------------------------------------------------------------------------
  for (let n = 0; n < 2; n++) c = await api(`/supply/consolidations/${c.id}/rfqs`, 'POST', { supplierId: suppliers[n]!.id, lineIds: c.lines.map((l: any) => l.id) });
  await expectNext('6. solicitudes a proveedores', 'consolidation', c.id, 'Compras', /Registrar la oferta de 2 proveedores/);
  for (let n = 0; n < 2; n++) {
    const rfq = c.rfqs[n];
    const quote = await api('/purchase-quotations', 'POST', { rfqId: rfq.id, supplierId: rfq.supplierId, requestIds: [], quotationDate: date, validUntil: future, currency: 'USD', paymentTerms: '30 dias', deliveryDays: 2, expenses: [],
      details: rfq.lines.map((l: any) => ({ productId: l.line.productId, unitId: l.line.unitId, quantity: Number(l.quantity), availableQuantity: n === 0 ? Number(l.quantity) : 100, unitPrice: n === 0 ? 10.5 : 9.8, discount: 0, taxRate: 0, deliveryDays: 2, sources: [] })) });
    created.quotes.push(quote.id); await api(`/purchase-quotations/${quote.id}/receive`, 'POST');
    if (n === 0) await expectNext('7a. primera oferta', 'consolidation', c.id, 'Compras', /Registrar la oferta de 1 proveedor/, t => assert.ok(t.alsoAvailable.some(s => /Comparar ofertas/.test(s.label))));
  }
  await expectNext('7b. segunda oferta', 'consolidation', c.id, 'Compras', /Comparar ofertas y elegir proveedor/);

  // --- 4. Order --------------------------------------------------------------------------------------------------
  c = await api(`/supply/consolidations/${c.id}`);
  const offerDetail = c.rfqs[0].quotation.details.find((d: any) => d.productId === product.id);
  c = await api(`/supply/consolidations/${c.id}/award`, 'POST', { requestId: randomUUID(), branchId: generalBranchId, warehouseId: general.id, details: [{ quotationDetailId: offerDetail.id, quantity: 120 }] });
  const orderId = c.orders[0].id; created.orders.push(orderId);
  await expectNext('8. orden creada', 'order', orderId, 'Compras', /Enviar la orden .* a Gerencia/, t => assert.equal(stageOf(t, 'quotation').state, 'complete'));
  await api(`/purchase-orders/${orderId}/submit`, 'POST');
  await expectNext('9. orden en aprobación', 'order', orderId, 'Gerencia', /Aprobar la orden/);
  await api(`/purchase-orders/${orderId}/approve`, 'POST');
  await expectNext('10. orden aprobada', 'order', orderId, 'Compras', /Marcar la orden .* como enviada/);
  await api(`/purchase-orders/${orderId}/send`, 'POST');
  await expectNext('11. orden enviada', 'order', orderId, 'Bodega', /Registrar la recepción de la orden/, t => assert.equal(stageOf(t, 'order').state, 'complete'));

  // --- 5. Receipts, placement, verification ---------------------------------------------------------------------
  const detailId = (await db.purchaseOrderDetail.findFirstOrThrow({ where: { orderId } })).id;
  const receive = async (quantity: number) => {
    await api(`/purchase-orders/${orderId}/receive`, 'POST', { requestId: randomUUID(), items: [{ orderDetailId: detailId, quantity }] });
    const receipt = (await db.purchase.findMany({ where: { purchaseOrderId: orderId }, include: { items: true }, orderBy: { id: 'desc' } }))[0]!;
    if (!created.receipts.includes(receipt.id)) created.receipts.push(receipt.id);
    return receipt;
  };
  const placeAndVerify = async (receiptId: number, itemId: number, stepName: string) => {
    await api(`/supply/placements/${itemId}/confirm`, 'POST', { locationId: slot.id, barcode: product.internalCode, confirmed: true });
    await expectNext(`${stepName} ubicada`, 'receipt', receiptId, 'Bodega', /Verificar la recepción/);
    await api(`/purchases/${receiptId}/verify`, 'POST');
  };
  const first = await receive(70);
  await expectNext('12. primera recepción (70)', 'order', orderId, 'Bodega', /Ubicar los productos de/, t => {
    assert.deepEqual(stageOf(t, 'reception').progress, { done: 70, total: 120 });
    assert.ok(!t.alsoAvailable.some(s => /Despachar/.test(s.label)), 'lo que no está ubicado no se puede despachar');
  });
  await placeAndVerify(first.id, first.items[0]!.id, '13. recepción 1');
  await expectNext('14. recepción 1 verificada', 'order', orderId, 'Bodega', /Registrar la recepción de la orden/, t => {
    assert.ok(t.alsoAvailable.some(s => /retaceo/.test(s.label)), 'el retaceo de lo recibido puede avanzar en paralelo');
    assert.ok(t.alsoAvailable.some(s => /Despachar/.test(s.label)), 'lo ubicado ya se puede despachar');
  });
  const second = await receive(50);
  await placeAndVerify(second.id, second.items[0]!.id, '15. recepción 2');
  await expectNext('16. orden recibida completa', 'order', orderId, 'Compras', /Hacer el retaceo de/, t => assert.equal(stageOf(t, 'reception').state, 'complete'));

  // --- 6. Costs ----------------------------------------------------------------------------------------------------
  await api(`/supply/receipts/${first.id}/expenses`, 'POST', { expenseTypeId: expenseType.id, reference: `E2E-FLETE-${key}`, amount: 35, category: 'freight', capitalizable: true });
  for (const [receipt, label] of [[first, '17. retaceo 1'], [second, '18. retaceo 2']] as const) {
    let retaceo = await api('/retaceos', 'POST', { purchaseId: receipt.id, details: receipt.items.map(i => ({ purchaseItemId: i.id, costFob: Number(i.lineTotal) })) }); created.retaceos.push(retaceo.id);
    await expectNext(`${label} en borrador`, 'receipt', receipt.id, 'Compras', /Terminar el retaceo de/);
    retaceo = await api(`/retaceos/${retaceo.id}/calculate`, 'POST');
    if (receipt.id === first.id) assert.equal(Number(retaceo.totalCost), Number(retaceo.totalFob) + 35, 'el flete real se reparte una sola vez');
    await api(`/retaceos/${retaceo.id}/verify`, 'POST'); await api(`/retaceos/${retaceo.id}/close`, 'POST');
    await expectNext(`${label} cerrado`, 'receipt', receipt.id, 'Compras', /Cerrar la recepción/);
    await api(`/purchases/${receipt.id}/close`, 'POST');
  }
  await expectNext('19. costos completos', 'request', request.id, 'Bodega', /Despachar los productos recibidos/, t => assert.equal(stageOf(t, 'costs').state, 'complete'));

  // --- 7. Distribution and delivery --------------------------------------------------------------------------------
  const requestDetail = await db.purchaseRequestDetail.findFirstOrThrow({ where: { requestId: request.id } });
  let transfer = await api('/supply/transfers', 'POST', { requestId: randomUUID(), items: [{ requestDetailId: requestDetail.id, fromLocationId: slot.id, toLocationId: branchSite.location.id, quantity: 100 }] }); created.transfers.push(transfer.id);
  await expectNext('20. traslado despachado', 'request', request.id, 'Sucursal', /Recibir en la sucursal/, t => assert.equal(stageOf(t, 'distribution').state, 'complete'));
  transfer = await api(`/supply/transfers/${transfer.id}/receive`, 'POST', { requestId: randomUUID(), items: [{ itemId: transfer.items[0].id, quantity: 100, locationId: branchSite.location.id }] });

  const done: Tracking = await api(`/purchases/tracking/request/${request.id}`);
  assert.equal(done.completed, true, 'la compra debe quedar completa');
  assert.equal(done.nextStep, null);
  assert.ok(done.stages.every(s => s.state === 'complete'), `etapas: ${done.stages.map(s => `${s.id}=${s.state}`).join(', ')}`);
  assert.equal((await api(`/purchase-requests/${request.id}`)).status, 'fulfilled');
  const list = await api('/purchases/tracking/processes?scope=done&search=' + encodeURIComponent(request.code));
  assert.equal(list.items.length, 1, 'la compra completa aparece en el listado de completadas');
  console.log('PASS 21. compra completa: 8 etapas completas, solicitud entregada y presente en el listado');
}

async function cleanup() {
  const c = created;
  await db.$transaction(async tx => {
    const movementIds = (await tx.inventoryMovement.findMany({ where: { stock: { productId: { in: c.products } } }, select: { id: true } })).map(m => m.id);
    const expenseIds = (await tx.purchaseActualExpense.findMany({ where: { purchaseId: { in: c.receipts } }, select: { id: true } })).map(e => e.id);
    await tx.log.deleteMany({ where: { OR: [
      { controller: 'purchase_requests', recordId: { in: c.requests } }, { controller: 'purchase_quotations', recordId: { in: c.quotes } }, { controller: 'purchase_orders', recordId: { in: c.orders } },
      { controller: 'purchases', recordId: { in: c.receipts } }, { controller: 'retaceos', recordId: { in: c.retaceos } }, { controller: 'purchase_consolidations', recordId: { in: c.consolidations } },
      { controller: 'purchase_expenses', recordId: { in: expenseIds } }, { controller: 'transfers', recordId: { in: c.transfers } },
      { controller: 'inventory', recordId: { in: [...movementIds, ...c.transfers] } },
    ] } });
    await tx.inventoryMovement.deleteMany({ where: { stock: { productId: { in: c.products } } } });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: c.products } } });
    await tx.transferItem.deleteMany({ where: { transferId: { in: c.transfers } } }); await tx.transfer.deleteMany({ where: { id: { in: c.transfers } } });
    await tx.purchaseExpenseAllocation.deleteMany({ where: { retaceoId: { in: c.retaceos } } });
    await tx.retaceoDetail.deleteMany({ where: { retaceoId: { in: c.retaceos } } }); await tx.retaceo.deleteMany({ where: { id: { in: c.retaceos } } });
    await tx.purchaseActualExpense.deleteMany({ where: { purchaseId: { in: c.receipts } } });
    await tx.purchaseItem.deleteMany({ where: { purchaseId: { in: c.receipts } } }); await tx.purchase.deleteMany({ where: { id: { in: c.receipts } } });
    await tx.purchaseOrderDetail.deleteMany({ where: { orderId: { in: c.orders } } }); await tx.purchaseOrderExpense.deleteMany({ where: { orderId: { in: c.orders } } }); await tx.purchaseOrder.deleteMany({ where: { id: { in: c.orders } } });
    await tx.purchaseQuotation.deleteMany({ where: { id: { in: c.quotes } } });
    if (c.consolidations.length) {
      await tx.purchaseRfq.deleteMany({ where: { consolidationId: { in: c.consolidations } } });
      await tx.purchaseConsolidationSource.deleteMany({ where: { line: { consolidationId: { in: c.consolidations } } } });
      await tx.purchaseConsolidationLine.deleteMany({ where: { consolidationId: { in: c.consolidations } } });
      await tx.purchaseConsolidation.deleteMany({ where: { id: { in: c.consolidations } } });
    }
    await tx.purchaseRequest.deleteMany({ where: { id: { in: c.requests } } });
    if (restoreGeneralWarehouse.restore) await tx.erpConfiguration.update({ where: { id: 1 }, data: { generalWarehouseId: null } });
    await tx.location.deleteMany({ where: { id: { in: c.locations } } }); await tx.warehouse.deleteMany({ where: { id: { in: c.warehouses } } }); await tx.branch.deleteMany({ where: { id: { in: c.branches } } });
    await tx.product.deleteMany({ where: { id: { in: c.products } } }); await tx.supplier.deleteMany({ where: { id: { in: c.suppliers } } }); await tx.expenseType.deleteMany({ where: { id: { in: c.expenseTypes } } });
    await tx.productSubcategory.deleteMany({ where: { id: { in: c.subcategories } } }); await tx.productCategory.deleteMany({ where: { id: { in: c.categories } } }); await tx.productUnit.deleteMany({ where: { id: { in: c.units } } });
  }, { timeout: 30000 });
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await cleanup(); console.log('Datos temporales eliminados.'); } catch (error) { console.error('No se pudo limpiar por completo:', error); process.exitCode = 1; } finally { await db.$disconnect(); }
});
