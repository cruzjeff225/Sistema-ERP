import "dotenv/config";
import { randomUUID } from "crypto";

const baseUrl = process.env.ERP_TEST_API_URL ?? "http://localhost:3000/api";
const email = process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
const password = process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;

if (!email || !password) throw new Error("Configure ERP_TEST_EMAIL/ERP_TEST_PASSWORD o las credenciales SEED_ADMIN del entorno.");

type ApiEnvelope<T> = { success: boolean; data: T };
type HeadersMap = Record<string, string>;

async function call<T>(name: string, path: string, headers: HeadersMap, init: RequestInit = {}, expected = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (response.status !== expected) throw new Error(`${name}: HTTP ${response.status}, esperado ${expected}. ${await response.text()}`);
  console.log(`OK ${name}`);
  return ((await response.json()) as ApiEnvelope<T>).data;
}

async function main() {
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`Inicio de sesión: HTTP ${login.status}. ${await login.text()}`);
  const token = ((await login.json()) as ApiEnvelope<{ accessToken: string }>).data.accessToken;
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const companies = await call<Array<{ id: number; isActive: boolean }>>("Consultar empresas", "/companies", authHeaders);
  let company: { id: number; isActive: boolean } | undefined;
  let catalogs: any;
  for (const candidate of companies) {
    const response = await fetch(`${baseUrl}/purchase-catalogs`, { headers: { ...authHeaders, "X-Company-Id": String(candidate.id) } });
    if (response.status !== 200) continue;
    const candidateCatalogs = ((await response.json()) as ApiEnvelope<any>).data;
    if (candidateCatalogs.branches.length && candidateCatalogs.products.length && candidateCatalogs.suppliers.length && candidateCatalogs.expenseTypes.length) {
      company = candidate;
      catalogs = candidateCatalogs;
      break;
    }
  }
  if (!company || !catalogs) throw new Error("No existe una empresa con catálogos completos para ejecutar la prueba.");
  const headers = { ...authHeaders, "X-Company-Id": String(company.id) };
  console.log(`OK Consultar catálogos de compras de empresa ${company.id}`);
  const suffix = randomUUID().slice(0, 8);
  let branch = catalogs.branches.find((item: any) => item.warehouses.length) ?? catalogs.branches[0];
  let warehouse = branch?.warehouses[0];
  if (branch && !warehouse) {
    const categories = await call<Array<{ id: number }>>("Consultar categorías de almacén", "/warehouse-categories", headers);
    if (!categories[0]) throw new Error("No existe una categoría de almacén activa.");
    warehouse = await call<any>("Crear almacén para prueba integrada", "/warehouses", headers, {
      method: "POST", body: JSON.stringify({ branchId: branch.id, categoryId: categories[0].id, name: `QA Compras ${suffix}`, description: "Almacén de verificación funcional" }),
    }, 201);
    await call("Crear ubicación para recepción", "/locations", headers, {
      method: "POST", body: JSON.stringify({ warehouseId: warehouse.id, code: `QA-${suffix}`, aisle: "QA", rack: "1", level: "1", position: "1", capacity: 100 }),
    }, 201);
    catalogs = await call<any>("Recargar catálogos de compras", "/purchase-catalogs", headers);
    branch = catalogs.branches.find((item: any) => item.id === branch.id);
    warehouse = branch.warehouses.find((item: any) => item.id === warehouse.id);
  }
  const product = catalogs.products[0];
  const supplierA = catalogs.suppliers[0];
  const supplierB = catalogs.suppliers[1] ?? catalogs.suppliers[0];
  const expenseType = catalogs.expenseTypes[0];
  if (!branch || !warehouse || !product || !supplierA || !expenseType) throw new Error("Faltan sucursal, almacén, producto, proveedor o tipo de gasto activos.");

  const requiredDate = new Date(Date.now() + 7 * 86400000).toISOString();
  const quotationDate = new Date().toISOString();
  const validUntil = new Date(Date.now() + 15 * 86400000).toISOString();

  const invalidRequest = await fetch(`${baseUrl}/purchase-requests`, {
    method: "POST", headers, body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, requiredDate, purpose: "operations", justification: "Cantidad inválida", details: [{ productId: product.id, quantity: 0, unitId: product.purchaseUnit.id }] }),
  });
  if (invalidRequest.status !== 400) throw new Error(`Validar cantidad mayor que cero: HTTP ${invalidRequest.status}`);
  console.log("OK Validar cantidad mayor que cero");

  const request = await call<any>("Crear solicitud con detalle", "/purchase-requests", headers, {
    method: "POST",
    body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, requiredDate, purpose: "operations", justification: `Verificación funcional ${suffix}`, notes: "Solicitud temporal de QA", details: [{ productId: product.id, quantity: 2, unitId: product.purchaseUnit.id, description: product.name }] }),
  }, 201);
  await call("Enviar solicitud", `/purchase-requests/${request.id}/submit`, headers, { method: "POST", body: "{}" }, 201);
  await call("Aprobar solicitud", `/purchase-requests/${request.id}/approve`, headers, { method: "POST", body: "{}" }, 201);

  const quotePayload = (supplierId: number, unitPrice: number, deliveryDays: number) => ({
    supplierId,
    requestIds: [request.id],
    quotationDate,
    validUntil,
    currency: "USD",
    paymentTerms: "Crédito 30 días",
    deliveryDays,
    notes: `Cotización temporal ${suffix}`,
    details: [{ productId: product.id, quantity: 2, unitId: product.purchaseUnit.id, unitPrice, discount: 1, taxRate: 13, deliveryDays, availableQuantity: 2, sources: [{ requestDetailId: request.details[0].id, quantity: 2 }] }],
    expenses: [{ expenseTypeId: expenseType.id, description: "Gasto de prueba", amount: 5 }],
  });
  const quoteA = await call<any>("Registrar primera cotización", "/purchase-quotations", headers, { method: "POST", body: JSON.stringify(quotePayload(supplierA.id, 20, 5)) }, 201);
  const quoteB = await call<any>("Registrar cotización competidora", "/purchase-quotations", headers, { method: "POST", body: JSON.stringify(quotePayload(supplierB.id, 18, 9)) }, 201);
  await call("Recibir primera cotización", `/purchase-quotations/${quoteA.id}/receive`, headers, { method: "POST", body: "{}" }, 201);
  await call("Evaluar primera cotización", `/purchase-quotations/${quoteA.id}/review`, headers, { method: "POST", body: "{}" }, 201);
  await call("Seleccionar primera cotización", `/purchase-quotations/${quoteA.id}/select`, headers, { method: "POST", body: "{}" }, 201);
  await call("Recibir cotización competidora", `/purchase-quotations/${quoteB.id}/receive`, headers, { method: "POST", body: "{}" }, 201);
  await call("Evaluar cotización competidora", `/purchase-quotations/${quoteB.id}/review`, headers, { method: "POST", body: "{}" }, 201);

  const comparison = await call<any>("Comparar proveedores", `/purchase-requests/${request.id}/quotation-comparison`, headers);
  if (comparison.quotations.length < 2 || comparison.quotations.some((item: any) => typeof item.availabilityPercent !== "number")) throw new Error("La comparación no devolvió las alternativas y criterios esperados.");
  console.log("OK Comparación conserva alternativas sin selección automática");

  const invalidOrder = await fetch(`${baseUrl}/purchase-orders/from-quotation/${quoteB.id}`, {
    method: "POST", headers, body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, expectedDate: requiredDate }),
  });
  if (invalidOrder.status !== 409) throw new Error(`Impedir orden desde cotización no seleccionada: HTTP ${invalidOrder.status}`);
  console.log("OK Impedir orden desde cotización no seleccionada");

  const order = await call<any>("Generar orden desde cotización seleccionada", `/purchase-orders/from-quotation/${quoteA.id}`, headers, {
    method: "POST", body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, expectedDate: requiredDate, notes: "Orden temporal de QA" }),
  }, 201);
  if (order.supplierId !== quoteA.supplierId || order.quotationId !== quoteA.id) throw new Error("La orden perdió la referencia del proveedor o la cotización.");
  console.log("OK Orden conserva proveedor único y cotización de origen");

  if (order.expenses[0]) {
    const evidence = new FormData();
    evidence.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLXDwAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "evidencia-gasto.png");
    const upload = await fetch(`${baseUrl}/purchase-order-expenses/${order.expenses[0].id}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "X-Company-Id": String(company.id) },
      body: evidence,
    });
    if (upload.status !== 201) throw new Error(`Adjuntar evidencia de gasto: HTTP ${upload.status}. ${await upload.text()}`);
    const document = ((await upload.json()) as ApiEnvelope<{ id: number; filePath: string }>).data;
    console.log("OK Adjuntar evidencia de gasto");
    const fileResponse = await fetch(`${baseUrl}/purchase-order-expenses/documents/${document.id}/content`, { headers });
    if (fileResponse.status !== 200) throw new Error(`Consultar evidencia adjunta: HTTP ${fileResponse.status}`);
    console.log("OK Consultar evidencia adjunta");
    await call("Eliminar evidencia de gasto", `/purchase-order-expenses/documents/${document.id}`, headers, { method: "DELETE" });
  }
  await call("Enviar orden a aprobación", `/purchase-orders/${order.id}/submit`, headers, { method: "POST", body: "{}" }, 201);
  await call("Aprobar orden", `/purchase-orders/${order.id}/approve`, headers, { method: "POST", body: "{}" }, 201);
  await call("Enviar orden al proveedor", `/purchase-orders/${order.id}/send`, headers, { method: "POST", body: "{}" }, 201);

  const location = warehouse.locations[0];
  let purchaseId: number | null = null;
  if (location) {
    const received = await call<any>("Registrar recepción parcial e inventario", `/purchase-orders/${order.id}/receive`, headers, {
      method: "POST", body: JSON.stringify({ supplierInvoiceNumber: `QA-${suffix}`, supplierInvoiceDate: new Date().toISOString(), items: [{ orderDetailId: order.details[0].id, locationId: location.id, quantity: 1 }] }),
    }, 201);
    if (received.status !== "partially_received" || Number(received.details[0].receivedQuantity) !== 1) throw new Error("La recepción parcial no actualizó el seguimiento de la orden.");
    purchaseId = received.purchases[0]?.id ?? null;
    console.log("OK Seguimiento de recepción parcial");
  } else {
    console.log("SKIP Recepción: el almacén no posee ubicaciones activas");
  }

  const refreshedRequest = await call<any>("Consultar trazabilidad final de solicitud", `/purchase-requests/${request.id}`, headers);
  if (!["completed", "partially_ordered"].includes(refreshedRequest.status)) throw new Error(`Estado de solicitud inesperado: ${refreshedRequest.status}`);

  if (purchaseId) {
    const receiptCatalog = await call<any[]>("Consultar recepciones disponibles para retaceo", "/retaceos/purchases", headers);
    const purchase = receiptCatalog.find((item) => item.id === purchaseId);
    if (!purchase) throw new Error("La recepción no quedó disponible para retaceo.");
    const fob = purchase.items.reduce((sum: number, item: any) => sum + Number(item.lineTotal), 0);
    const retaceo = await call<any>("Crear retaceo desde recepción", "/retaceos", headers, {
      method: "POST",
      body: JSON.stringify({
        purchaseId,
        retaceoDate: new Date().toISOString(),
        originCountry: "El Salvador",
        importInvoiceNumber: `IMP-${suffix}`,
        totalFreight: 7,
        totalExpenses: 5,
        totalDai: 3,
        importVat: 11,
        details: purchase.items.map((item: any) => ({ purchaseItemId: item.id, costFob: Number(item.lineTotal) })),
      }),
    }, 201);
    const calculated = await call<any>("Distribuir retaceo proporcionalmente al FOB", `/retaceos/${retaceo.id}/calculate`, headers, { method: "POST", body: "{}" }, 201);
    const allocatedFreight = calculated.details.reduce((sum: number, item: any) => sum + Number(item.freightAmount), 0);
    const allocatedExpenses = calculated.details.reduce((sum: number, item: any) => sum + Number(item.expenseAmount), 0);
    const allocatedDai = calculated.details.reduce((sum: number, item: any) => sum + Number(item.daiAmount), 0);
    const distribution = calculated.details.reduce((sum: number, item: any) => sum + Number(item.distributionPercent), 0);
    if (Math.abs(Number(calculated.totalCost) - (fob + 15)) > 0.01 || Math.abs(allocatedFreight - 7) > 0.01 || Math.abs(allocatedExpenses - 5) > 0.01 || Math.abs(allocatedDai - 3) > 0.01) {
      throw new Error("El cálculo del retaceo no distribuyó exactamente los costos configurados.");
    }
    if (Math.abs(distribution - 100) > 0.01 || Number(calculated.importVat) !== 11 || !calculated.excludesImportVat) throw new Error("El retaceo incluyó IVA o calculó incorrectamente los porcentajes.");
    console.log("OK IVA de importación excluido y porcentajes dinámicos");
    await call("Verificar retaceo", `/retaceos/${retaceo.id}/verify`, headers, { method: "POST", body: "{}" }, 201);
    const closed = await call<any>("Cerrar retaceo y actualizar costo", `/retaceos/${retaceo.id}/close`, headers, { method: "POST", body: "{}" }, 201);
    if (closed.status !== "closed" || closed.purchase.status !== "COSTED") throw new Error("El cierre no actualizó el retaceo y la compra.");

    const otherCompany = companies.find((candidate) => candidate.id !== company!.id);
    if (otherCompany) {
      const isolation = await fetch(`${baseUrl}/retaceos/${retaceo.id}`, { headers: { ...authHeaders, "X-Company-Id": String(otherCompany.id) } });
      if (![403, 404].includes(isolation.status)) throw new Error(`Aislamiento multiempresa de retaceo: HTTP ${isolation.status}, esperado 403 o 404`);
      console.log("OK Aislamiento multiempresa de retaceo");
    }
    console.log(`OK Trazabilidad completa ${refreshedRequest.code} -> ${quoteA.code} -> ${order.code} -> ${purchase.documentNumber} -> ${closed.code}`);
  } else {
    console.log(`OK Flujo de compras ${refreshedRequest.code} -> ${quoteA.code} -> ${order.code}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
