/** Creates a complete, visibly marked DEMO through the ERP API; preserves its records for review. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
const db = new PrismaService();
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
const localDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(d);
const date = localDate(), due = localDate(new Date(Date.now() + 7 * 86400000));
const runId = `DEMO-${date.replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
const directory = resolve('tmp/demos', runId);
mkdirSync(directory, { recursive: true });
const report: any = { runId, date, status: 'running', records: [], checks: [], operations: [], pdfs: [] };
let token = '', companyId = 0;
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Company-Id': String(companyId) });
const save = () => writeFileSync(resolve(directory, 'resultado.json'), JSON.stringify(report, null, 2));
function pass(message: string) { if(!report.checks.includes(message)) report.checks.push(message); save(); console.log('PASS ' + message); }
async function api(path: string, method = 'GET', body?: unknown, expected = method === 'POST' ? 201 : 200) {
 const signature = JSON.stringify({method,path,body});
 const response = await fetch(base + path, { method, headers: headers(), signal: AbortSignal.timeout(20000), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
 const text = await response.text(); assert.equal(response.status, expected, `${method} ${path}: ${text.slice(0, 1200)}`);
 if (!path.startsWith('/auth/')) { report.operations.push({ method, path, status: response.status, signature, ...(method!=='GET'?{result:JSON.parse(text).data}:{}) }); save(); }
 return JSON.parse(text).data;
}
function remember(module: string, record: any) { const row={ module, id: record.id, code: record.code ?? record.documentNumber ?? record.sku ?? record.name, status: record.status };const index=report.records.findIndex((r:any)=>r.module===module&&r.id===record.id);if(index>=0)report.records[index]={...report.records[index],...row};else report.records.push(row); save(); return record; }
async function create(module: string, path: string, body: unknown) { return remember(module, await api(path,'POST',body)); }
function reference(name:string){report.references??={};report.references[name]??=randomUUID();save();return report.references[name];}
async function main() {
 const login = await api('/auth/login', 'POST', { email: process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL, password: process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD }, 200);
 token = login.accessToken;
 const configuration = await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 }, include: { company: true, generalWarehouse: { include: { branch: true } } } });
 companyId = configuration.companyId;
 const general = configuration.generalWarehouse!;
 assert(general?.isActive && !general.deletedAt && general.branch.isActive && !general.branch.deletedAt, 'El centro general debe estar activo');
 report.companyId = companyId; report.generalWarehouse = { id: general.id, name: general.name }; save();
 const category = await create('category', '/product-categories', { name: `${runId} Materiales de prueba`, description: 'Información ficticia para probar el flujo completo' });
 const subcategory = await create('subcategory', '/product-subcategories', { categoryId: category.id, name: `${runId} Cubiertas` });
 const purchaseUnit = await create('unit', '/product-units', { name: `${runId} Unidad compra`, type: 'purchase' });
 const saleUnit = await create('unit', '/product-units', { name: `${runId} Unidad venta`, type: 'sale' });
 const warehouseCategory = await create('warehouse_category', '/warehouse-categories', { name: `${runId} Almacén demo` });
 const products: Array<{ id: number; sku: string; internalCode: string }> = [];
 for (const [suffix, name, price] of [['TEJA', 'Teja asfáltica', 2], ['LAMINA', 'Lámina de cubierta', 3]] as const) {
  products.push(await create('product', '/products', { categoryId: category.id, subcategoryId: subcategory.id, purchaseUnitId: purchaseUnit.id, saleUnitId: saleUnit.id, sku: `${runId}-${suffix}`, name: `${runId} ${name}`, description: 'Producto ficticio; existencias generadas por una prueba completa', unitCost: price, salePrice: price * 2 }));
 }
 const branches = [], branchLocations = [], suppliers: Array<{ id: number }> = [];
 for (let n = 0; n < 2; n++) {
  const branch = await create('branch', '/branches', { companyId, name: `${runId} Sucursal ${n === 0 ? 'Norte' : 'Sur'}`, address: 'Dirección ficticia de demostración', departmentId: configuration.company.departmentId, municipalityId: configuration.company.municipalityId, districtId: configuration.company.districtId }); branches.push(branch);
  const warehouse = await create('warehouse', '/warehouses', { branchId: branch.id, categoryId: warehouseCategory.id, name: `${runId} Bodega sucursal ${n + 1}` });
  branchLocations.push(await create('location', '/locations', { warehouseId: warehouse.id, code: `${runId}-S${n + 1}`, aisle: 'DEMO', rack: '1', level: '1', position: '1', capacity: 10000, notes: 'Ubicación ficticia de demostración' }));
  suppliers.push(await create('supplier', '/suppliers', { code: `${runId}-P${n + 1}`, name: `${runId} Proveedor ${n === 0 ? 'Tejas del Pacífico' : 'Cubiertas del Norte'}`, countryId: 1, departmentId: configuration.company.departmentId, municipalityId: configuration.company.municipalityId, districtId: configuration.company.districtId, address: 'Dirección ficticia; no realizar compras reales' }));
 }
 const centralLocation = await create('location', '/locations', { warehouseId: general.id, code: `${runId}-GENERAL`, aisle: 'DEMO', rack: runId, level: '1', position: '1', capacity: 10000, notes: 'Espacio ficticio usado exclusivamente en esta prueba' });
 const expenseType = await create('expense_type', '/expense-types', { name: `${runId} Transporte y gestión`, description: 'Gastos ficticios de la prueba' });
 pass('Maestros ficticios creados por API: productos, proveedores, sucursales, bodegas y espacios');
 const requests = [];
 for (let n = 0; n < 2; n++) {
  let request = await create('request', '/purchase-requests', { branchId: branches[n].id, warehouseId: general.id, purpose: 'resale', requiredDate: due, justification: `${runId}: abastecimiento ficticio de tejas`, notes: 'DEMO, sin obligación comercial real', details: [{ productId: products[0].id, unitId: purchaseUnit.id, quantity: n === 0 ? 100 : 400 }] });
  assert.equal(request.status, 'draft');
  request = await api(`/purchase-requests/${request.id}/submit`, 'POST', {}); assert.equal(request.status, 'submitted');
  const available = await api('/supply/requests'); assert(available.find((r: any) => r.id === request.id)?.details.every((d: any) => d.eligible)); requests.push(request);
 }
 let procurement = await create('quotation_process', '/supply/consolidations', { dateFrom: date, dateTo: date, requestIds: requests.map(r => r.id) });
 assert.equal(Number(procurement.lines[0].requestedQuantity), 500);
 procurement = await api(`/supply/consolidations/${procurement.id}/lines`, 'PATCH', { productId: products[0].id, purchaseQuantity: 600, reason: `${runId}: 100 unidades de reserva autorizada` });
 procurement = await api(`/supply/consolidations/${procurement.id}/lines`, 'PATCH', { productId: products[1].id, purchaseQuantity: 10, reason: `${runId}: producto adicional de reserva` });
 assert.equal(Number(procurement.lines.find((l: any) => l.productId === products[0].id).requestedQuantity), 500);
 assert.equal(Number(procurement.lines.find((l: any) => l.productId === products[1].id).requestedQuantity), 0);
 pass('Dos solicitudes enviadas directamente a Compras: 100 + 400 solicitadas; Compras decide 600 y agrega 10 láminas');
 procurement = await api(`/supply/consolidations/${procurement.id}/quantities/submit`, 'POST', { expectedRevision: procurement.quantityRevision });
 procurement = await api(`/supply/consolidations/${procurement.id}/quantities/approve`, 'POST', { expectedRevision: procurement.quantityRevision });
 for (let n = 0; n < 2; n++) {
  procurement = await api(`/supply/consolidations/${procurement.id}/rfqs`, 'POST', { supplierId: suppliers[n].id, lineIds: procurement.lines.filter((l: any) => n === 1 || l.productId === products[0].id).map((l: any) => l.id) });
 }
 for (const rfq of procurement.rfqs) {
  const response = await fetch(`${base}/supply/rfqs/${rfq.id}/pdf`, { headers: headers() }); assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert(bytes.toString('latin1').startsWith('%PDF-'));
  if (rfq.supplierId === suppliers[0].id) assert(!bytes.toString('latin1').includes(products[1].sku), 'El PDF del proveedor A solo debe contener tejas');
  const filename = `${rfq.code}.pdf`; writeFileSync(resolve(directory, filename), bytes); report.pdfs=report.pdfs.filter((p:any)=>p.rfqId!==rfq.id);report.pdfs.push({ rfqId: rfq.id, supplierId: rfq.supplierId, file: filename }); save();
  const n = rfq.supplierId === suppliers[0].id ? 0 : 1;
  const quote = await create('quotation', '/purchase-quotations', { rfqId: rfq.id, supplierId: rfq.supplierId, requestIds: [], quotationDate: date, validUntil: `${due}T23:59:59-06:00`, currency: 'USD', paymentTerms: 'DEMO: crédito 30 días', deliveryDays: n + 1, notes: 'Oferta ficticia para prueba', details: rfq.lines.map((l: any) => ({ productId: l.line.productId, unitId: l.line.unitId, quantity: Number(l.quantity), availableQuantity: Number(l.quantity), unitPrice: l.line.productId === products[0].id ? (n === 0 ? 2 : 2.4) : 3, discount: 0, taxRate: 13, deliveryDays: n + 1, notes: 'DEMO: disponibilidad completa', sources: [] })) });
  await api(`/purchase-quotations/${quote.id}/receive`, 'POST', {}); await api(`/purchase-quotations/${quote.id}/review`, 'POST', {});
 }
 procurement = await api(`/supply/consolidations/${procurement.id}`);
 const quoteA = procurement.rfqs.find((r: any) => r.supplierId === suppliers[0].id).quotation;
 const quoteB = procurement.rfqs.find((r: any) => r.supplierId === suppliers[1].id).quotation;
 assert.equal(quoteA.status, 'under_review'); assert.equal(quoteB.status, 'under_review');
 pass('PDF específico por proveedor; dos ofertas recibidas y comparadas por producto');
 const awardPayload = { requestId: reference('award'), branchId: general.branchId, warehouseId: general.id, details: [{ quotationDetailId: quoteA.details.find((l: any) => l.productId === products[0].id).id, quantity: 600 }, { quotationDetailId: quoteB.details.find((l: any) => l.productId === products[1].id).id, quantity: 10 }] };
 procurement = await api(`/supply/consolidations/${procurement.id}/award`, 'POST', awardPayload);
 procurement = await api(`/supply/consolidations/${procurement.id}/award`, 'POST', awardPayload);
 assert.equal(procurement.orders.length, 2);
 const orders = [];
 for (const reference of procurement.orders) {
  let order = remember('order', await api(`/purchase-orders/${reference.id}`));
  order = await api(`/purchase-orders/${order.id}`, 'PATCH', { expenses: [{ expenseTypeId: expenseType.id, amount: order.supplierId === suppliers[0].id ? 100 : 10, description: `${runId} Flete previsto` }], notes: `${runId} Compra ficticia; no enviar al proveedor real` });
  order = await api(`/purchase-orders/${order.id}/submit`, 'POST', {}); assert.equal(order.status, 'pending_approval');
  order = await api(`/purchase-orders/${order.id}/approve`, 'POST', {}); assert.equal(order.status, 'approved');
  order = await api(`/purchase-orders/${order.id}/send`, 'POST', {}); assert.equal(order.status, 'sent'); orders.push(order);
 }
 pass('Adjudicación de tejas a A y láminas a B; una orden por proveedor, aprobadas y marcadas como enviadas');
 const receiptSummaries: Array<{ orderId: number; receiptId: number; code: string; quantity: number; status: string; retaceoId: number; retaceoCode: string; costFob: number; freight: number; other: number; dai: number; totalCost: number; unitCost: number }> = [];
 async function receiveAndFinish(order: any, quantity: number, freight: number, other: number, part: number, dai = 0) {
  const requestId = reference(`receipt-${part}`);
  let result = await api(`/purchase-orders/${order.id}/receive`, 'POST', { requestId, supplierInvoiceNumber: `${runId}-F${part}`, supplierInvoiceDate: date, notes: `${runId} Recepción ficticia ${part}`, items: [{ orderDetailId: order.details[0].id, quantity, locationId: centralLocation.id }] });
  const received = await db.purchase.findUniqueOrThrow({ where: { uuid: requestId } });
  let receipt = remember('receipt', await api(`/purchases/${received.id}`));
  assert(receipt.items.every((i: any) => i.locationId === null));
  const beforeStock = await db.inventoryStock.findUnique({ where: { productId_locationId: { productId: order.details[0].productId, locationId: centralLocation.id } } });
  const mapBefore = await api(`/inventory/map?warehouseId=${general.id}`);
  const slotBefore = mapBefore.locations.find((l: any) => l.id === centralLocation.id);
  assert.equal(Number(slotBefore.usedCapacity), Number((await db.inventoryStock.aggregate({ where: { locationId: centralLocation.id }, _sum: { quantity: true } }))._sum.quantity ?? 0));
  if (Number(slotBefore.usedCapacity) === 0) assert.equal(slotBefore.state, 'AVAILABLE', 'Una sugerencia no debe ocupar el mapa');
  for (const line of receipt.items) {
   const product = products.find(p => p.id === line.productId)!;
   const payload = { locationId: centralLocation.id, barcode: product.internalCode, confirmed: true };
   await api(`/supply/placements/${line.id}/confirm`, 'POST', payload); await api(`/supply/placements/${line.id}/confirm`, 'POST', payload);
   assert.equal(await db.inventoryMovement.count({ where: { purchaseItemId: line.id } }), 1);
  }
  const afterStock = await db.inventoryStock.findUniqueOrThrow({ where: { productId_locationId: { productId: order.details[0].productId, locationId: centralLocation.id } } });
  assert.equal(Number(afterStock.quantity), Number(beforeStock?.quantity ?? 0) + quantity);
  const firstForOrder = !receiptSummaries.some(r => r.orderId === order.id);
  const actual = { expenseTypeId: expenseType.id, ...(firstForOrder ? { plannedExpenseId: order.expenses[0].id } : {}), reference: `${runId}-FLETE-${part}`, amount: freight, category: 'freight', capitalizable: true };
  await api(`/supply/receipts/${receipt.id}/expenses`, 'POST', actual); await api(`/supply/receipts/${receipt.id}/expenses`, 'POST', actual);
  if (other) await api(`/supply/receipts/${receipt.id}/expenses`, 'POST', { expenseTypeId: expenseType.id, reference: `${runId}-OTROS-${part}`, amount: other, category: 'expense', capitalizable: true });
  if (dai) await api(`/supply/receipts/${receipt.id}/expenses`, 'POST', { expenseTypeId: expenseType.id, reference: `${runId}-DAI-${part}`, amount: dai, category: 'dai', capitalizable: true });
  await api(`/supply/receipts/${receipt.id}/expenses`, 'POST', { expenseTypeId: expenseType.id, reference: `${runId}-IVA-${part}`, amount: 20, category: 'expense', capitalizable: false });
  receipt = await api(`/purchases/${receipt.id}/verify`, 'POST', {}); assert.equal(receipt.status, 'VERIFIED');
  let cost = await create('retaceo', '/retaceos', { purchaseId: receipt.id, notes: `${runId} Retaceo ficticio ${part}`, details: receipt.items.map((i: any) => ({ purchaseItemId: i.id, costFob: Number(i.lineTotal) })) });
  cost = await api(`/retaceos/${cost.id}/calculate`, 'POST', {});
  assert.equal(Number(cost.totalFreight), freight); assert.equal(Number(cost.totalExpenses), other); assert.equal(Number(cost.totalDai), dai); assert.equal(Number(cost.totalCost), Number(cost.totalFob) + freight + other + dai);
  const allocations = await db.purchaseExpenseAllocation.count({ where: { retaceoId: cost.id } });
  cost = await api(`/retaceos/${cost.id}/calculate`, 'POST', {}); assert.equal(await db.purchaseExpenseAllocation.count({ where: { retaceoId: cost.id } }), allocations);
  cost = await api(`/retaceos/${cost.id}/verify`, 'POST', {}); assert.equal(cost.status, 'verified');
  cost = await api(`/retaceos/${cost.id}/close`, 'POST', {}); assert.equal(cost.status, 'closed');
  receipt = await api(`/purchases/${receipt.id}/close`, 'POST', {}); assert.equal(receipt.status, 'CLOSED');
  assert.equal(Number((await db.inventoryStock.findUniqueOrThrow({ where: { id: afterStock.id } })).quantity), Number(afterStock.quantity));
  receiptSummaries.push({ orderId: order.id, receiptId: receipt.id, code: receipt.documentNumber, quantity, status: receipt.status, retaceoId: cost.id, retaceoCode: cost.code, costFob: Number(cost.totalFob), freight, other, dai, totalCost: Number(cost.totalCost), unitCost: Number(cost.details[0].unitCost) });
  report.receipts = receiptSummaries; save(); return result;
 }
 const tejaOrder = orders.find(o => o.supplierId === suppliers[0].id)!, laminaOrder = orders.find(o => o.supplierId === suppliers[1].id)!;
 let partial = await receiveAndFinish(tejaOrder, 450, 120, 20, 1, 10); assert.equal(partial.status, 'partially_received');
 await receiveAndFinish(laminaOrder, 10, 12, 0, 2);
 partial = await receiveAndFinish(tejaOrder, 150, 40, 10, 3); assert.equal(partial.status, 'received');
 for (const order of orders) { const final = await api(`/purchase-orders/${order.id}`); assert.equal(final.status, 'received'); assert(final.details.every((d: any) => Number(d.receivedQuantity) === Number(d.quantity))); }
 assert.equal(receiptSummaries.reduce((total, r) => total + r.totalCost, 0), 1442);
 pass('Recepción parcial 450 + complemento 150; 10 láminas recibidas, ubicadas, verificadas, retaceadas y cerradas');
 pass('Gastos previstos separados de reales: costo FOB 1,230 + gastos capitalizables 212 = costo final 1,442; sin duplicar IVA ni inventario');
 const transfers = [];
 for (let n = 0; n < 2; n++) {
  const request = await api(`/purchase-requests/${requests[n].id}`); const quantity = n === 0 ? 100 : 400;
  let transfer = await create('transfer', '/supply/transfers', { requestId: reference(`dispatch-${n}`), items: [{ requestDetailId: request.details[0].id, fromLocationId: centralLocation.id, toLocationId: branchLocations[n].id, quantity }] });
  assert.equal(transfer.status, 'IN_TRANSIT');
  assert.equal(await db.inventoryStock.count({ where: { productId: products[0].id, locationId: branchLocations[n].id } }), 0);
  if (n === 0) {
   transfer = await api(`/supply/transfers/${transfer.id}/receive`, 'POST', { requestId: reference(`transfer-first-${n}`), items: [{ itemId: transfer.items[0].id, quantity: 30, locationId: branchLocations[n].id }] }); assert.equal(transfer.status, 'PARTIALLY_RECEIVED');
  }
  const payload = { requestId: reference(`transfer-last-${n}`), items: [{ itemId: transfer.items[0].id, quantity: n === 0 ? 70 : 400, locationId: branchLocations[n].id }] };
  transfer = await api(`/supply/transfers/${transfer.id}/receive`, 'POST', payload); await api(`/supply/transfers/${transfer.id}/receive`, 'POST', payload); assert.equal(transfer.status, 'COMPLETED');
  assert.equal(Number((await db.inventoryStock.findUniqueOrThrow({ where: { productId_locationId: { productId: products[0].id, locationId: branchLocations[n].id } } })).quantity), quantity);
  const fulfilled = await api(`/purchase-requests/${request.id}`); assert.equal(fulfilled.status, 'fulfilled'); transfers.push({ id: transfer.id, code: transfer.documentNumber, status: transfer.status, branch: branches[n].name, quantity });
 }
 procurement = await api(`/supply/consolidations/${procurement.id}`);
 const tejaLine = procurement.lines.find((l: any) => l.productId === products[0].id), laminaLine = procurement.lines.find((l: any) => l.productId === products[1].id);
 assert.equal(Number(tejaLine.requestedQuantity), 500); assert.equal(Number(tejaLine.purchasedQuantity), 600); assert.equal(Number(tejaLine.receivedQuantity), 600); assert.equal(Number(tejaLine.distributedQuantity), 500); assert(tejaLine.sources.every((s: any) => Number(s.pendingQuantity) === 0));
 assert.equal(Number(laminaLine.requestedQuantity), 0); assert.equal(Number(laminaLine.purchasedQuantity), 10); assert.equal(Number(laminaLine.receivedQuantity), 10); assert.equal(Number(laminaLine.distributedQuantity), 0);
 const centralStock = await db.inventoryStock.findMany({ where: { locationId: centralLocation.id, productId: { in: products.map(p => p.id) } } });
 assert.equal(Number(centralStock.find(s => s.productId === products[0].id)!.quantity), 100); assert.equal(Number(centralStock.find(s => s.productId === products[1].id)!.quantity), 10);
 const finalMap = await api(`/inventory/map?warehouseId=${general.id}`); const finalSlot = finalMap.locations.find((l: any) => l.id === centralLocation.id); assert.equal(finalSlot.state, 'OCCUPIED'); assert.equal(Number(finalSlot.usedCapacity), 110);
 const movements = await api(`/inventory/movements?productId=${products[0].id}&page=1&limit=100`);
 assert.equal(movements.items.filter((m: any) => m.type === 'RECEIPT' && m.costReference?.source === 'retaceo').length, 2);
 report.transfers = transfers; report.processId = procurement.id; report.balance = { tejas: { requested: 500, bought: 600, received: 600, distributed: 500, central: 100, pendingBranches: 0 }, laminas: { requested: 0, bought: 10, received: 10, distributed: 0, central: 10 }, totalCost: 1442 };
 pass('Traslados completados: Norte 100 y Sur 400; solicitudes atendidas, sin pendientes; reserva general 100 tejas y 10 láminas');
 report.status = 'passed'; report.finishedAt = new Date().toISOString(); save();
 const labels: Record<string,string> = { request:'Solicitud', quotation:'Cotización', order:'Orden de compra', receipt:'Recepción', retaceo:'Retaceo', transfer:'Traslado' };
 const rows = report.records.filter((r: any) => ['request', 'quotation', 'order', 'receipt', 'retaceo', 'transfer'].includes(r.module));
 const markdown = `# Prueba completa de compras: ${runId}\n\nFecha: ${date}, El Salvador. Resultado: **APROBADA**. Los datos son ficticios y permanecen identificados como DEMO para revisarlos en el ERP. Las operaciones se ejecutaron por API y las verificaciones de inventario se contrastaron con la base de datos.\n\n${report.checks.map((c: string) => '- ' + c).join('\n')}\n\n| Producto | Solicitado | Comprado | Recibido | Distribuido | Reserva general |\n|---|---:|---:|---:|---:|---:|\n| Tejas | 500 | 600 | 600 | 500 | 100 |\n| Láminas adicionales | 0 | 10 | 10 | 0 | 10 |\n\nAmbas solicitudes quedaron atendidas; las dos órdenes recibidas; las tres recepciones y sus retaceos cerrados; los dos traslados completados. Costo FOB: $1,230. Gastos capitalizables reales: $212. Costo final: $1,442. Las reservas adicionales no pertenecen a solicitudes pendientes.\n\n| Documento | Código | ID |\n|---|---|---:|\n${rows.map((r: any) => `| ${labels[r.module]} | ${r.code} | ${r.id} |`).join('\n')}\n\nEvidencia y PDFs: ${directory}. El JSON registra cada operación HTTP sin contraseñas ni tokens.\n`;
 writeFileSync(resolve(directory, 'resultado.md'), markdown); writeFileSync(resolve('../docs', 'prueba-completa-compras.md'), markdown);
 console.log(JSON.stringify({ runId, status: report.status, processId: procurement.id, report: resolve(directory, 'resultado.md'), requests: requests.map(r => r.code), orders: orders.map(o => o.code), receipts: receiptSummaries.map(r => r.code), transfers: transfers.map(t => t.code), balance: report.balance }));
}
main().catch(e => { report.status = 'failed'; report.error = e.message; save(); console.error(e); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
