import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { PrismaService } from "../src/infrastructure/database/prisma/prisma.service";
import { allocateCost } from "../src/modules/purchases/application/services/cost-allocation";
import * as argon2 from 'argon2';

const base = process.env.ERP_TEST_API_URL ?? "http://localhost:3000/api";
const db = new PrismaService();
let companyId = 0;
let fixtureBranchId = 0, fixtureExpenseTypeId = 0, readerId = 0, roleId = 0, employeeId = 0;
const fixtureProducts: number[] = [], fixtureSuppliers: number[] = [];
let headers: Record<string, string> = {};
let checks = 0;
const ok = (name: string) => { checks += 1; console.log(`OK ${name}`); };
const sum = (items: any[], field: string) => Math.round(items.reduce((value, item) => value + Number(item[field]), 0) * 100) / 100;

async function response(path: string, method = "GET", body?: unknown, customHeaders = headers) {
  return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...customHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function api(path: string, method = "GET", body?: unknown, expected = method === "POST" ? 201 : 200) {
  const result = await response(path, method, body);
  const data = await result.json();
  assert.equal(result.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data.data;
}

async function main() {
  assert.deepEqual(allocateCost(0.02, [1, 1, 1, 0]), [0.01, 0.01, 0, 0]);
  assert.deepEqual(allocateCost(1, [0, 0, 10]), [0, 0, 1]);
  for (let count = 1; count <= 50; count += 1) {
    const bases = Array.from({ length: count }, (_, index) => (index * 17 + count) % 11);
    const amount = count * 0.03;
    const allocation = allocateCost(amount, bases);
    assert.equal(Math.round(allocation.reduce((total, value) => total + value, 0) * 100), Math.round(amount * 100));
    assert(allocation.every((value, index) => value >= 0 && (bases[index] !== 0 || value === 0)));
  }
  ok("Reparto exacto de centavos en 52 escenarios, sin costos negativos ni gastos sobre FOB cero");

  const email = process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password = process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  assert(email && password, "Configure las credenciales de prueba");
  const login = await api("/auth/login", "POST", { email, password }, 200);
  const config = await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 }, include: { company: true } });
  const template = config.company;
  const foreignCompany = await db.company.findFirstOrThrow({ where: { id: { not: template.id }, isActive: true } });
  const productTemplate = await db.product.findFirstOrThrow({ where: { companyId: template.id, isActive: true, deletedAt: null, purchaseUnit: { isActive: true, type: "purchase" } } });
  const category = await db.warehouseCategory.findFirstOrThrow({ where: { isActive: true } });
  const country = await db.country.findFirstOrThrow();
  const key = randomUUID().slice(0, 8);
  companyId = template.id;
  headers = { Authorization: `Bearer ${login.accessToken}`, "Content-Type": "application/json", "X-Company-Id": String(companyId) };
  const branch = await db.branch.create({ data: { companyId, name: `QA Procurement ${key}`, address: "QA", departmentId: template.departmentId, municipalityId: template.municipalityId, districtId: template.districtId } });
  fixtureBranchId = branch.id;
  const warehouse = await db.warehouse.create({ data: { branchId: branch.id, categoryId: category.id, name: "QA Warehouse" } });
  const location = await db.location.create({ data: { warehouseId: warehouse.id, code: "QA", aisle: "A", rack: "1", level: "1", position: "1", capacity: 100 } });
  const supplier = await db.supplier.create({ data: { companyId, countryId: country.id, code: `QA-A-${key}`, name: `QA Supplier A ${key}` } });
  fixtureSuppliers.push(supplier.id);
  const otherSupplier = await db.supplier.create({ data: { companyId, countryId: country.id, code: `QA-B-${key}`, name: `QA Supplier B ${key}` } });
  fixtureSuppliers.push(otherSupplier.id);
  const expenseType = await api("/expense-types", "POST", { name: `QA Freight ${key}` });
  fixtureExpenseTypeId = expenseType.id;
  await api("/expense-types", "POST", { name: `qa freight ${key}` }, 409);
  const renamedType = await api(`/expense-types/${expenseType.id}`, "PATCH", { description: "Flete de prueba" });
  assert.equal(renamedType.description, "Flete de prueba");
  assert.equal((await api(`/expense-types/${expenseType.id}/status`, "PATCH", { isActive: false })).isActive, false);
  assert(!(await api("/purchase-catalogs")).expenseTypes.some((item: { id: number }) => item.id === expenseType.id));
  assert.equal((await api(`/expense-types/${expenseType.id}/status`, "PATCH", { isActive: true })).isActive, true);
  assert((await api("/expense-types")).some((item: { id: number }) => item.id === expenseType.id));
  ok("Tipos de gasto: alta, duplicados, edicion, desactivacion y reactivacion con catalogos consistentes");
  const products = [];
  for (let index = 0; index < 2; index += 1) {
    const product = await db.product.create({ data: {
    companyId, categoryId: productTemplate.categoryId, subcategoryId: productTemplate.subcategoryId, purchaseUnitId: productTemplate.purchaseUnitId,
    saleUnitId: productTemplate.saleUnitId, sku: `QA-${key}-${index}`, internalCode: `QA-${key}-${index}`, name: `QA Product ${index}`, unitCost: 1,
    } }); products.push(product); fixtureProducts.push(product.id);
  }
  const date = new Date();
  const today = date.toISOString().slice(0, 10);
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  const requestPayload = { branchId: branch.id, warehouseId: warehouse.id, requiredDate: future, purpose: "operations", justification: "QA regression", details: products.map((product, index) => ({ productId: product.id, unitId: product.purchaseUnitId, quantity: index ? 1 : 2.5 })) };
  const request = await api("/purchase-requests", "POST", requestPayload);
  assert.equal(request.purpose, 'operations');
  await api('/purchase-requests', 'POST', { ...requestPayload, purpose: 'sale' }, 400);
  await api('/purchase-requests', 'POST', { ...requestPayload, purpose: undefined }, 400);
  await api('/purchase-requests', 'POST', { ...requestPayload, purpose: null }, 400);
  for (const purpose of ['resale', 'mixed', 'operations']) {
    assert.equal((await api(`/purchase-requests/${request.id}`, 'PATCH', { purpose })).purpose, purpose);
  }
  await api(`/purchase-requests/${request.id}`, 'PATCH', { purpose: null }, 400);
  await db.purchaseRequest.update({ where: { id: request.id }, data: { purpose: null } });
  await api(`/purchase-requests/${request.id}/submit`, 'POST', {}, 400);
  await api(`/purchase-requests/${request.id}`, 'PATCH', { purpose: 'operations' });
  assert.equal(await db.inventoryMovement.count({ where: { stock: { productId: { in: fixtureProducts } } } }), 0);
  ok('Finalidad obligatoria, historicos sin inferencias y solicitudes sin movimientos de inventario');
  await api(`/purchase-requests/${request.id}`, "PATCH", { details: null }, 400);
  await api(`/purchase-requests/${request.id}/submit`, "POST", {});
  await api(`/purchase-requests/${request.id}/approve`, "POST", {});
  await api(`/purchase-requests/${request.id}`, 'PATCH', { purpose: 'resale' }, 409);
  ok("Solicitud decimal y rechazo de datos nulos");
  const quotePayload = { supplierId: supplier.id, requestIds: [request.id], quotationDate: today, validUntil: today, currency: "USD", expenses: [{ expenseTypeId: expenseType.id, amount: 2 }], details: request.details.map((line: any) => ({ productId: line.productId, quantity: Number(line.quantity), unitId: line.unitId, unitPrice: 3.1234, discount: 0.01, taxRate: 13, availableQuantity: Number(line.quantity), sources: [{ requestDetailId: line.id, quantity: Number(line.quantity) }] })) };
  const invalidSources = structuredClone(quotePayload);
  invalidSources.details[0].sources.push({ ...invalidSources.details[0].sources[0] });
  await api("/purchase-quotations", "POST", invalidSources, 400);
  const quoteA = await api("/purchase-quotations", "POST", quotePayload);
  const quoteB = await api("/purchase-quotations", "POST", { ...quotePayload, supplierId: otherSupplier.id });
  for (const quote of [quoteA, quoteB]) {
    await api(`/purchase-quotations/${quote.id}/receive`, "POST", {});
    await api(`/purchase-quotations/${quote.id}/select`, "POST", {});
  }
  ok("Cotizaciones válidas durante todo el día y fuentes duplicadas rechazadas");
  const orderPayload = { branchId: branch.id, warehouseId: warehouse.id, expectedDate: future };
  const secondProductOrder = await api(`/purchase-orders/from-quotation/${quoteA.id}`, "POST", { ...orderPayload, details: [{ quotationDetailId: quoteA.details[1].id, quantity: 0.5 }] });
  assert.equal((await api(`/purchase-requests/${request.id}`)).status, "partially_ordered");
  await api(`/purchase-orders/${secondProductOrder.id}/cancel`, "POST", { reason: "QA: comprobar restauración de cantidades" });
  ok("Estado parcial correcto al ordenar solo el segundo producto y recuperación al cancelar");
  const order = await api(`/purchase-orders/from-quotation/${quoteA.id}`, "POST", { ...orderPayload, details: [{ quotationDetailId: quoteA.details[0].id, quantity: 1.25 }] });
  assert.equal(order.details.length, 1);
  assert.equal(Number(order.details[0].quantity), 1.25);
  const parallelOrders = await Promise.all([response(`/purchase-orders/from-quotation/${quoteA.id}`, "POST", orderPayload), response(`/purchase-orders/from-quotation/${quoteA.id}`, "POST", orderPayload)]);
  assert.deepEqual(parallelOrders.map((result) => result.status).sort(), [201, 409]);
  const activeOrders = await db.purchaseOrder.findMany({ where: { quotationId: quoteA.id, status: { not: "cancelled" } } });
  assert.equal(sum(activeOrders, "subtotal"), Math.round((Number(quoteA.subtotal) - Number(quoteA.discount)) * 100) / 100);
  assert.equal(sum(activeOrders, "discount"), Number(quoteA.discount));
  assert.equal(sum(activeOrders, "tax"), Number(quoteA.tax));
  ok("Órdenes parciales conservan los importes y descuentos de la cotización");
  await api(`/purchase-orders/from-quotation/${quoteB.id}`, "POST", orderPayload, 409);
  await api(`/purchase-requests/${request.id}/cancel`, "POST", { reason: "QA" }, 409);
  ok("Selección parcial exacta y protección contra sobrecompra concurrente o entre cotizaciones");

  const foreignHeaders = { ...headers, "X-Company-Id": String(foreignCompany.id) };
  const isolation = await response(`/purchase-orders/${order.id}`, "GET", undefined, foreignHeaders);
  assert([403, 404].includes(isolation.status));
  const invalidSupplier = await api("/purchase-quotations", "POST", { ...quotePayload, supplierId: (await db.supplier.findFirstOrThrow({ where: { companyId: { not: companyId } } })).id }, 400);
  ok("Aislamiento de órdenes y proveedores entre empresas");

  const evidence = new FormData();
  evidence.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLXDwAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "qa-regression.png");
  const upload = await fetch(`${base}/purchase-order-expenses/${order.expenses[0].id}/documents`, { method: "POST", headers: { Authorization: headers.Authorization, "X-Company-Id": String(companyId) }, body: evidence });
  assert.equal(upload.status, 201, await upload.clone().text());
  const document = (await upload.json()).data;
  const edited = await api(`/purchase-orders/${order.id}`, "PATCH", { expenses: order.expenses.map((expense: any) => ({ id: expense.id, expenseTypeId: expense.expenseTypeId, amount: Number(expense.amount), description: "Editado" })) });
  assert.equal(edited.expenses[0].documents[0].id, document.id);
  const permissions = await db.permission.findMany({ where: { action: { in: ['purchase_orders.create', 'purchase_orders.update', 'purchase_quotations.create', 'purchase_quotations.update'] } } });
  roleId = (await db.role.create({ data: { name: `qa-compras-${key}`, rolePermissions: { create: permissions.map(permission => ({ permissionId: permission.id })) } } })).id;
  employeeId = (await db.employee.create({ data: { code: `QA-${key}`, fullName: 'QA Compras RBAC' } })).id;
  const readerPassword = `Qa!${randomUUID()}aA9`;
  const reader = await db.user.create({ data: { employeeId, username: `qa-compras-${key}`, email: `qa-compras-${key}@example.test`, passwordHash: await argon2.hash(readerPassword), userRoles: { create: { roleId } }, userCompanies: { create: { companyId } } } });
  readerId = reader.id;
  const readerLogin = await api('/auth/login', 'POST', { email: reader.email, password: readerPassword }, 200);
  const restrictedHeaders = { ...headers, Authorization: `Bearer ${readerLogin.accessToken}` };
  assert.equal((await response('/purchase-quotations', 'POST', quotePayload, restrictedHeaders)).status, 403);
  assert.equal((await response(`/purchase-orders/from-quotation/${quoteA.id}`, 'POST', orderPayload, restrictedHeaders)).status, 403);
  assert.equal((await response(`/purchase-orders/${order.id}`, 'PATCH', { expenses: [] }, restrictedHeaders)).status, 403);
  assert.equal((await response(`/purchase-orders/${order.id}`, 'PATCH', { expenses: [{ expenseTypeId: expenseType.id, amount: 1 }] }, restrictedHeaders)).status, 403);
  assert.equal((await response(`/purchase-orders/${order.id}/approve`, 'POST', {}, restrictedHeaders)).status, 403);
  assert.equal((await response(`/purchase-orders/${order.id}/receive`, 'POST', { items: [{ orderDetailId: order.details[0].id, quantity: 1 }] }, restrictedHeaders)).status, 403);
  assert.equal((await response(`/purchase-order-expenses/documents/${document.id}`, 'DELETE', undefined, restrictedHeaders)).status, 403);
  ok('RBAC: crear/editar ordenes no permite modificar gastos, aprobar, recibir ni eliminar documentos sin permiso');
  await api(`/purchase-orders/${order.id}`, "PATCH", { expenses: [] }, 409);
  const file = await response(`/purchase-order-expenses/documents/${document.id}/content`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.equal((await response(`/purchase-order-expenses/documents/${document.id}/content`, "GET", undefined, {})).status, 401);
  assert([403, 404].includes((await response(`/purchase-order-expenses/documents/${document.id}/content`, "GET", undefined, foreignHeaders)).status));
  assert.equal((await fetch(base.replace(/\/api\/?$/, "") + document.filePath)).status, 404);
  await api(`/purchase-order-expenses/documents/${document.id}`, "DELETE");
  ok("Adjuntos conservados al editar, descarga autenticada y sin acceso desde otra empresa o URL pública");
  const fake = new FormData();
  fake.append("file", new Blob(["not a PDF"], { type: "application/pdf" }), "fake.pdf");
  assert.equal((await fetch(`${base}/purchase-order-expenses/${order.expenses[0].id}/documents`, { method: "POST", headers: { Authorization: headers.Authorization, "X-Company-Id": String(companyId) }, body: fake })).status, 400);
  ok("Archivo con contenido falso rechazado");

  for (const action of ["submit", "approve", "send"]) await api(`/purchase-orders/${order.id}/${action}`, "POST", {});
  const received = await api(`/purchase-orders/${order.id}/receive`, "POST", { items: [{ orderDetailId: order.details[0].id, locationId: location.id, quantity: 0.25 }] });
  assert.equal(received.status, "partially_received");
  const receiptId = received.purchases[0].id;
  const receiptPayload = { items: [{ orderDetailId: order.details[0].id, locationId: location.id, quantity: 1 }] };
  const parallelReceipts = await Promise.all([response(`/purchase-orders/${order.id}/receive`, "POST", receiptPayload), response(`/purchase-orders/${order.id}/receive`, "POST", receiptPayload)]);
  assert.deepEqual(parallelReceipts.map((result) => result.status).sort(), [201, 409]);
  const stock = await db.inventoryStock.findUnique({ where: { productId_locationId: { productId: products[0].id, locationId: location.id } } });
  assert.equal(Number(stock?.quantity), 1.25, "Cada recepcion debe ingresar existencias una sola vez");
  const receipts = await db.purchase.findMany({ where: { purchaseOrderId: order.id } });
  assert.equal(sum(receipts, "subtotal"), Math.round((Number(order.subtotal) + Number(order.discount)) * 100) / 100);
  assert.equal(sum(receipts, "discount"), Number(order.discount));
  assert.equal(sum(receipts, "tax"), Number(order.tax));
  const receiptSnapshot = await api(`/purchases/${receiptId}`);
  assert.equal(Number(receiptSnapshot.items[0].quantityOrdered), 1.25);
  assert.equal(Number(receiptSnapshot.items[0].receivedBefore), 0);
  assert.equal(receiptSnapshot.items[0].unit.type, 'purchase');
  assert.equal(Number(receiptSnapshot.items[0].unitPrice), Number(order.details[0].unitPrice));
  assert.equal(sum(receiptSnapshot.items, 'taxAmount'), Number(receiptSnapshot.tax));
  assert.equal(sum(receiptSnapshot.items, 'discount'), Number(receiptSnapshot.discount));
  assert.equal(sum(receiptSnapshot.items, 'total'), Number(receiptSnapshot.total));
  ok("Recepcion fraccionada y concurrente con entradas de inventario, descuento e impuestos exactos");

  const purchase = (await api("/retaceos/purchases")).find((item: any) => item.id === receiptId);
  const retaceoPayload = { purchaseId: receiptId, totalFreight: 0.02, totalExpenses: 0.01, totalDai: 0.03, importVat: 11, importInvoiceDate: today, importPolicyDate: today, details: purchase.items.map((item: any) => ({ purchaseItemId: item.id, costFob: Number(item.lineTotal) })) };
  const parallelRetaceos = await Promise.all([response("/retaceos", "POST", retaceoPayload), response("/retaceos", "POST", retaceoPayload)]);
  assert.deepEqual(parallelRetaceos.map((result) => result.status).sort(), [201, 409]);
  let retaceo = (await (parallelRetaceos.find((result) => result.status === 201)!).json()).data;
  assert.equal(Number(retaceo.totalCost), Math.round((Number(retaceo.totalFob) + 0.06) * 100) / 100);
  await api(`/retaceos/${retaceo.id}`, "PATCH", { details: null }, 400);
  await api(`/retaceos/${retaceo.id}/calculate`, "POST", {});
  retaceo = await api(`/retaceos/${retaceo.id}`, "PATCH", { totalFreight: 0.04, importInvoiceDate: null, importPolicyDate: null });
  assert.equal(retaceo.status, "draft");
  assert.equal(retaceo.importInvoiceDate, null);
  assert.equal(retaceo.importPolicyDate, null);
  assert.equal(sum(retaceo.details, "freightAmount"), 0);
  await api(`/retaceos/${retaceo.id}/verify`, "POST", {}, 409);
  await api(`/retaceos/${retaceo.id}/cancel`, "POST", {}, 400);
  await api(`/retaceos/${retaceo.id}/cancel`, "POST", { reason: "Corrección de datos" });
  retaceo = await api("/retaceos", "POST", retaceoPayload);
  const calculated = await api(`/retaceos/${retaceo.id}/calculate`, "POST", {});
  assert.equal(Number(calculated.totalCost), Math.round((Number(calculated.totalFob) + 0.06) * 100) / 100);
  assert.equal(Number(calculated.importVat), 11);
  await api(`/retaceos/${retaceo.id}/verify`, "POST", {});
  const closeResults = await Promise.all([response(`/retaceos/${retaceo.id}/close`, "POST", {}), response(`/retaceos/${retaceo.id}/close`, "POST", {})]);
  assert.deepEqual(closeResults.map((result) => result.status).sort(), [201, 409]);
  await api(`/retaceos/${retaceo.id}`, "PATCH", { totalFreight: 3 }, 409);
  await api(`/retaceos/${retaceo.id}/cancel`, "POST", { reason: "QA" }, 409);
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: products[0].id } })).unitCost), 1, "Retaceo conserva costo real sin valorar inventario");
  ok("Retaceo concurrente, corrección, fechas eliminables, cancelación, recreación y cierre único con IVA excluido");

  const ersRequest = await api("/purchase-requests", "POST", {
    ...requestPayload, justification: "Caso ERS v0.9 PR-00042 (secuencia real)",
    details: products.map((product) => ({ productId: product.id, unitId: product.purchaseUnitId, quantity: 1 })),
  });
  for (const action of ["submit", "approve"]) await api(`/purchase-requests/${ersRequest.id}/${action}`, "POST", {});
  const ersQuotePayload = {
    ...quotePayload, requestIds: [ersRequest.id],
    details: ersRequest.details.map((line: any, index: number) => ({
      productId: line.productId, unitId: line.unitId, quantity: 1, availableQuantity: 1,
      unitPrice: index === 0 ? 50000 : 5780, taxRate: 0,
      sources: [{ requestDetailId: line.id, quantity: 1 }],
    })),
    expenses: [{ expenseTypeId: expenseType.id, amount: 0, description: "Gasto cero permitido" }],
  };
  const ersQuote = await api("/purchase-quotations", "POST", ersQuotePayload);
  const alternative = await api("/purchase-quotations", "POST", {
    ...ersQuotePayload, supplierId: otherSupplier.id, details: ersQuotePayload.details.map((line: any, index: number) => ({ ...line, unitPrice: index === 0 ? 51000 : 5900 })),
  });
  const comparison = await api(`/purchase-requests/${ersRequest.id}/quotation-comparison`);
  assert.equal(comparison.quotations.length, 2);
  const comparisonOptions = await api("/purchase-requests/comparison-options");
  assert(comparisonOptions.some((item: { id: number }) => item.id === ersRequest.id));
  const foreignOptions = await response("/purchase-requests/comparison-options", "GET", undefined, foreignHeaders);
  assert.equal(foreignOptions.status, 403);
  assert.equal((await api(`/purchase-quotations/${alternative.id}`)).status, "draft", "No seleccionar automaticamente la oferta");
  for (const action of ["receive", "select"]) await api(`/purchase-quotations/${ersQuote.id}/${action}`, "POST", {});
  const ersOrder = await api(`/purchase-orders/from-quotation/${ersQuote.id}`, "POST", orderPayload);
  await api(`/purchase-orders/${ersOrder.id}`, "PATCH", { expenses: [
    { expenseTypeId: expenseType.id, amount: 5125, description: "Flete" },
    { expenseTypeId: expenseType.id, amount: 1500, description: "Gastos" },
    { expenseTypeId: expenseType.id, amount: 8927, description: "DAI" },
  ] });
  for (const action of ["submit", "approve"]) await api(`/purchase-orders/${ersOrder.id}/${action}`, "POST", {});
  await db.supplier.update({ where: { id: supplier.id }, data: { isActive: false } });
  const ersReceiptPayload = { items: ersOrder.details.map((line: any) => ({ orderDetailId: line.id, locationId: location.id, quantity: 1 })) };
  await api(`/purchase-orders/${ersOrder.id}/receive`, "POST", ersReceiptPayload, 400);
  await db.supplier.update({ where: { id: supplier.id }, data: { isActive: true } });
  const ersReceived = await api(`/purchase-orders/${ersOrder.id}/receive`, "POST", ersReceiptPayload);
  const ersPurchase = (await api("/retaceos/purchases")).find((item: any) => item.id === ersReceived.purchases[0].id);
  await api(`/purchases/${ersPurchase.id}`, "PATCH", { supplierInvoiceNumber: "QA-ERS-00042", notes: "Recepcion verificada contra ERS" });
  const page = await api("/purchases?page=1&limit=1&search=QA-ERS-00042");
  assert.equal(page.meta.total, 1);
  assert.equal(page.items[0].id, ersPurchase.id);
  assert.equal((await response(`/purchases/${ersPurchase.id}`, "GET", undefined, foreignHeaders)).status, 403);
  await api(`/purchases/${ersPurchase.id}/verify`, "POST", {});
  await api(`/purchases/${ersPurchase.id}`, "PATCH", { notes: "No permitido" }, 409);
  const ersRetaceo = await api("/retaceos", "POST", {
    purchaseId: ersPurchase.id, totalFreight: 5125, totalExpenses: 1500, totalDai: 8927, importVat: 9273.16,
    details: ersPurchase.items.map((item: any) => ({ purchaseItemId: item.id, costFob: Number(item.lineTotal) })),
  });
  const ersCalculated = await api(`/retaceos/${ersRetaceo.id}/calculate`, "POST", {});
  assert.equal(Number(ersCalculated.totalFob), 55780);
  assert.equal(Number(ersCalculated.totalCost), 71332);
  assert.deepEqual(ersCalculated.details.map((line: any) => Number(line.totalCost)), [63940.48, 7391.52]);
  assert.equal(sum(ersCalculated.details, "freightAmount"), 5125);
  assert.equal(sum(ersCalculated.details, "expenseAmount"), 1500);
  assert.equal(sum(ersCalculated.details, "daiAmount"), 8927);
  for (const action of ["verify", "close"]) await api(`/retaceos/${ersRetaceo.id}/${action}`, "POST", {});
  const traced = await api(`/retaceos/${ersRetaceo.id}`);
  assert.equal(traced.purchase.purchaseOrder.quotation.requestLinks[0].request.id, ersRequest.id);
  assert.equal(traced.purchase.purchaseOrder.id, ersOrder.id);
  const costLedger = await api(`/inventory/movements?productId=${products[0].id}&limit=100`);
  const valued = costLedger.items.find((item: any) => item.purchaseItem?.purchase.id === ersPurchase.id && item.type === 'RECEIPT');
  assert.equal(Number(valued.costReference.valuationUnitCost), 63940.48);
  assert.equal(valued.costReference.source, 'retaceo');
  assert.equal(valued.costReference.retaceo.id, ersRetaceo.id);
  assert.equal(Number(valued.purchaseItem.quantity), 1);
  assert.equal(valued.purchaseItem.unit.id, products[0].purchaseUnitId);
  assert.equal(costLedger.items.filter((item: any) => item.purchaseItem?.purchase.id === ersPurchase.id).length, 1);
  assert.equal(Number(traced.details[0].freightRate), Number(traced.details[1].freightRate));
  assert.equal(Number(traced.details[0].freightRate), Number((5125 / 55780 * 100).toFixed(4)));
  ok('Inventario consulta el costo real del retaceo cerrado, unidad y compra; no duplica existencias');
  assert(await db.log.count({ where: { controller: "purchases", recordId: ersPurchase.id, action: "CREATE", userId: { not: null } } }));
  assert.equal(Number((await db.inventoryStock.findUniqueOrThrow({ where: { productId_locationId: { productId: products[0].id, locationId: location.id } } })).quantity), 2.25);
  assert.equal((await response("/customers")).status, 404);
  ok("ERS v0.9: 63940.48 + 7391.52 = 71332.00, IVA excluido, trazabilidad y extension autorizada de inventario");
  await api(`/purchases/${ersPurchase.id}/close`, "POST", {});
  assert(!(await api("/retaceos/purchases")).some((item: { id: number }) => item.id === ersPurchase.id));
  await api(`/purchases/${ersPurchase.id}/cancel`, "POST", { reason: "No permitido" }, 409);
  const reversible = receipts.find((receipt) => receipt.id !== receiptId)!;
  const adjustment = { productId: products[0].id, locationId: location.id, quantity: -2, reason: 'Salida QA por consumo', requestId: randomUUID() };
  const duplicates = await Promise.all([response('/inventory/adjustments', 'POST', adjustment), response('/inventory/adjustments', 'POST', adjustment)]);
  assert.deepEqual(duplicates.map(result => result.status), [201, 201]);
  assert.equal((await duplicates[0].json()).data.id, (await duplicates[1].json()).data.id);
  await api('/inventory/adjustments', 'POST', { ...adjustment, quantity: 3 }, 409);
  await api(`/purchases/${reversible.id}/cancel`, 'POST', { reason: 'Saldo insuficiente' }, 409);
  assert.notEqual((await api(`/purchases/${reversible.id}`)).status, 'CANCELLED');
  assert.equal(Number((await api(`/purchase-orders/${order.id}`)).details[0].receivedQuantity), 1.25);
  await api('/inventory/adjustments', 'POST', { ...adjustment, quantity: -1, requestId: randomUUID() }, 409);
  await api('/inventory/adjustments', 'POST', { ...adjustment, quantity: 0, requestId: randomUUID() }, 400);
  await api('/inventory/adjustments', 'POST', { ...adjustment, quantity: 0.001, requestId: randomUUID() }, 400);
  await api('/inventory/adjustments', 'POST', { ...adjustment, quantity: 2, requestId: randomUUID() });
  const pagedStock = await api(`/inventory/stocks?limit=1&productId=${products[0].id}`);
  assert.equal(pagedStock.total, 1);
  assert.equal(Number(pagedStock.items[0].quantity), 2.25);
  const foreignStock = await response(`/inventory/stocks?productId=${products[0].id}`, 'GET', undefined, foreignHeaders);
  assert.equal(foreignStock.status, 403);
  const wrongLocation = await db.location.findFirstOrThrow({ where: { warehouse: { branch: { companyId: foreignCompany.id } } } });
  await api('/inventory/adjustments', 'POST', { ...adjustment, locationId: wrongLocation.id, quantity: 1, requestId: randomUUID() }, 400);
  assert.equal((await response('/inventory/stocks', 'GET', undefined, {})).status, 401);
  await api(`/purchases/${reversible.id}/cancel`, "POST", {}, 400);
  await api(`/purchases/${reversible.id}/cancel`, "POST", { reason: "Reversion QA controlada" });
  const restored = await api(`/purchase-orders/${order.id}`);
  assert.equal(restored.status, "partially_received");
  assert.equal(Number(restored.details[0].receivedQuantity), 0.25);
  await api(`/purchases/${reversible.id}/cancel`, "POST", { reason: "No duplicar reversion" }, 409);
  assert.equal(Number((await api(`/purchase-orders/${order.id}`)).details[0].receivedQuantity), 0.25);
  const ledger = await api(`/inventory/movements?productId=${products[0].id}&limit=100`);
  const finalStock = (await api(`/inventory/stocks?productId=${products[0].id}`)).items[0];
  assert.equal(sum(ledger.items, 'quantity'), Number(finalStock.quantity));
  assert.equal(Number(ledger.items[0].balance), Number(finalStock.quantity));
  assert.equal(ledger.items.filter((item: any) => item.type === 'REVERSAL').length, 1);
  assert(ledger.items.every((item: any) => item.user?.username));
  ok('Inventario: ajustes idempotentes, saldo no negativo, aislamiento, kardex conciliado y cancelacion atomica');
  ok("Recepciones: paginacion, aislamiento, correccion documental, verificacion, cierre y cancelacion con restitucion unica del pendiente");

  const splitRequest = await api('/purchase-requests', 'POST', { ...requestPayload, details: [{ productId: products[0].id, unitId: products[0].purchaseUnitId, quantity: 10 }] });
  for (const action of ['submit', 'approve']) await api(`/purchase-requests/${splitRequest.id}/${action}`, 'POST', {});
  const splitOrders = [];
  for (const [provider, quantity] of [[supplier, 6], [otherSupplier, 4]] as const) {
    const quote = await api('/purchase-quotations', 'POST', { ...quotePayload, supplierId: provider.id, requestIds: [splitRequest.id], expenses: [], details: [{ ...quotePayload.details[0], quantity: 10, availableQuantity: quantity, sources: [{ requestDetailId: splitRequest.details[0].id, quantity: 10 }] }] });
    for (const action of ['receive', 'select']) await api(`/purchase-quotations/${quote.id}/${action}`, 'POST', {});
    const splitOrder = await api(`/purchase-orders/from-quotation/${quote.id}`, 'POST', orderPayload);
    assert.equal(splitOrder.supplierId, provider.id);
    assert.equal(splitOrder.quotationId, quote.id);
    assert.equal(Number(splitOrder.details[0].quantity), quantity);
    splitOrders.push(splitOrder.id);
  }
  assert.equal(new Set(splitOrders).size, 2);
  assert.equal((await api(`/purchase-requests/${splitRequest.id}`)).status, 'completed');
  ok('Dos proveedores para una solicitud producen dos ordenes independientes con su cotizacion origen');
}

async function cleanup() {
  if (!fixtureBranchId) return;
  // Every deletion is scoped to this run's branch or explicitly captured fixture IDs.
  const orderWhere = { companyId, branchId: fixtureBranchId };
  const quotationWhere = { companyId, supplierId: { in: fixtureSuppliers } };
  const stockWhere = { productId: { in: fixtureProducts } };
  const docs = await db.purchaseOrderExpenseDocument.findMany({ where: { expense: { order: orderWhere } } });
  for (const doc of docs) await unlink(join(process.cwd(), "uploads", "purchase-expenses", basename(doc.filePath))).catch(() => undefined);
  const models = [
    ["inventory", await db.inventoryMovement.findMany({ where: { stock: stockWhere }, select: { id: true } })],
    ["expense_types", [{ id: fixtureExpenseTypeId }]],
    ["purchases", await db.purchase.findMany({ where: orderWhere, select: { id: true } })],
    ["purchase_requests", await db.purchaseRequest.findMany({ where: orderWhere, select: { id: true } })],
    ["purchase_quotations", await db.purchaseQuotation.findMany({ where: quotationWhere, select: { id: true } })],
    ["purchase_orders", await db.purchaseOrder.findMany({ where: orderWhere, select: { id: true } })],
    ["retaceos", await db.retaceo.findMany({ where: { purchase: orderWhere }, select: { id: true } })],
    ["purchase_order_expense_documents", docs],
  ] as const;
  await db.$transaction(async (tx) => {
    for (const [controller, records] of models) await tx.log.deleteMany({ where: { controller, recordId: { in: records.map(record => record.id) } } });
    await tx.inventoryMovement.deleteMany({ where: { stock: stockWhere } });
    await tx.retaceo.deleteMany({ where: { purchase: orderWhere } });
    await tx.purchase.deleteMany({ where: orderWhere });
    await tx.purchaseOrder.deleteMany({ where: orderWhere });
    await tx.purchaseQuotation.deleteMany({ where: quotationWhere });
    await tx.purchaseRequest.deleteMany({ where: orderWhere });
    await tx.inventoryStock.deleteMany({ where: stockWhere });
    await tx.product.deleteMany({ where: { id: { in: fixtureProducts } } });
    await tx.supplier.deleteMany({ where: { id: { in: fixtureSuppliers } } });
    await tx.expenseType.deleteMany({ where: { id: fixtureExpenseTypeId } });
    await tx.location.deleteMany({ where: { warehouse: { branchId: fixtureBranchId } } });
    await tx.warehouse.deleteMany({ where: { branchId: fixtureBranchId } });
    await tx.branch.delete({ where: { id: fixtureBranchId } });
    if (readerId) {
      await tx.log.deleteMany({ where: { userId: readerId } });
      await tx.refreshToken.deleteMany({ where: { userId: readerId } });
      await tx.user.delete({ where: { id: readerId } });
    }
    if (roleId) await tx.role.delete({ where: { id: roleId } });
    if (employeeId) await tx.employee.delete({ where: { id: employeeId } });
  }, { timeout: 20000 });
  console.log("OK Solo fixtures de esta ejecucion eliminados; datos de Atlas conservados");
}

main().then(() => console.log(`PASS ${checks} grupos de regresión`)).catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await cleanup(); } catch (error) { console.error("No se pudo limpiar la empresa de pruebas", companyId, error); process.exitCode = 1; }
  await db.$disconnect();
});
