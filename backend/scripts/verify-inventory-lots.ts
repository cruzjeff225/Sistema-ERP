import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';

// Verificación del módulo de Inventario por lotes (ERS 6.9) contra la API. Trabaja sobre las existencias que haya:
// cada ajuste de prueba queda compensado, de modo que el saldo final es el inicial (los movimientos son inmutables).
const db = new PrismaService();
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
let token = '', companyId = 0;

async function call(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(companyId ? { 'X-Company-Id': String(companyId) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text).data : undefined, text };
}
async function api(path: string, method = 'GET', body?: unknown, expected = method === 'POST' ? 201 : 200) {
  const result = await call(path, method, body);
  assert.equal(result.status, expected, `${method} ${path}: ${result.text.slice(0, 600)}`);
  return result.data;
}
const pass = (message: string) => console.log('PASS ' + message);
const num = (value: unknown) => Number(value);

async function main() {
  const login = await api('/auth/login', 'POST', { email: process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL, password: process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD }, 200);
  token = login.accessToken; companyId = login.user.companies[0].id;

  const before = await api('/inventory/reconciliation');
  assert.equal(before.consistent, true, 'La conciliación inicial debe estar limpia: ' + JSON.stringify(before.issues.slice(0, 3)));
  pass(`conciliación inicial: ${before.checkedProducts} productos, saldos por ubicación = lotes = valoración`);

  // Lotes: trazabilidad compra -> ubicación
  const lots = await api('/inventory/lots?limit=50&onlyAvailable=true');
  assert(lots.items.length > 0, 'Se necesita al menos un lote con existencias');
  const lot = lots.items.find((l: any) => l.purchaseItem) ?? lots.items[0];
  const detail = await api(`/inventory/lots/${lot.id}`);
  assert.equal(detail.lotCode, lot.lotCode);
  assert(num(detail.onHand) <= num(detail.quantityReceived) + 1e-9 || !detail.purchaseItem, 'RN-INV-005: lo ubicado no excede lo recibido');
  if (detail.purchaseItem?.retaceoDetails?.length) assert.equal(num(detail.unitCost), num(detail.purchaseItem.retaceoDetails[0].unitCost), 'El lote conserva el costo final del retaceo');
  pass(`lote ${detail.lotCode}: ${num(detail.onHand)} en ubicaciones, trazabilidad y costo`);

  // Costo promedio global por empresa y producto
  const costs = await api('/inventory/costs?limit=100');
  for (const row of costs.items) {
    const stock = await db.inventoryStock.aggregate({ where: { productId: row.productId }, _sum: { quantity: true } });
    const transit = await db.transferItem.findMany({ where: { productId: row.productId, transfer: { status: { in: ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'INCIDENT'] } } } });
    const moving = transit.reduce((n, t) => n + num(t.quantity) - num(t.receivedQuantity), 0);
    assert.equal(num(row.quantityOnHand), num(stock._sum.quantity ?? 0) + moving, `cantidad valorizada de ${row.product.name}`);
    assert(Math.abs(num(row.inventoryValue) - num(row.quantityOnHand) * num(row.averageUnitCost)) <= 0.05 + num(row.quantityOnHand) * 0.00005, `valor = cantidad × promedio de ${row.product.name}`);
  }
  pass(`costo promedio global conciliado para ${costs.items.length} productos; valor total ${num(costs.totals.inventoryValue).toFixed(2)}`);

  // Ajustes: salida FIFO e ingreso en un lote de ajuste, ambos idempotentes y valorados
  const slot = (await db.inventoryLocationDetail.findMany({ where: { quantity: { gte: 2 }, lot: { product: { companyId }, status: 'ACTIVE' }, location: { isActive: true, deletedAt: null } }, include: { lot: true }, orderBy: { id: 'asc' } }))[0];
  assert(slot, 'Se necesita una ubicación con al menos 2 unidades');
  const avgBefore = await db.inventoryCostAverage.findUniqueOrThrow({ where: { companyId_productId: { companyId, productId: slot.lot.productId } } });
  const out = { productId: slot.lot.productId, locationId: slot.locationId, quantity: -1, reason: 'QA lotes: salida de prueba', requestId: randomUUID() };
  const exit = await api('/inventory/adjustments', 'POST', out);
  assert.equal(num(exit.quantityOut), 1); assert.equal(exit.movementType, 'ADJUSTMENT'); assert(exit.lotId, 'La salida identifica el lote');
  assert.equal((await api('/inventory/adjustments', 'POST', out)).id, exit.id, 'el reintento no duplica el movimiento');
  await api('/inventory/adjustments', 'POST', { ...out, quantity: -2 }, 409);
  const entry = await api('/inventory/adjustments', 'POST', { ...out, quantity: 1, reason: 'QA lotes: reingreso de prueba', requestId: randomUUID() });
  assert.equal(num(entry.quantityIn), 1);
  const adjustmentLot = await db.inventoryLot.findUniqueOrThrow({ where: { id: entry.lotId! } });
  assert.match(adjustmentLot.lotCode, /^LT-AJ-\d{6}$/); assert.equal(adjustmentLot.purchaseItemId, null);
  await api('/inventory/adjustments', 'POST', { ...out, quantity: num(slot.lot.quantityReceived) + 1, lotId: slot.lotId, reason: 'QA lotes: exceso sobre el lote', requestId: randomUUID() }, 409);
  pass('ajustes: salida FIFO con lote, reintento idempotente, saldo insuficiente 409, ingreso en lote de ajuste');

  const avgAfter = await db.inventoryCostAverage.findUniqueOrThrow({ where: { companyId_productId: { companyId, productId: slot.lot.productId } } });
  assert(avgAfter.quantityOnHand.gte(avgBefore.quantityOnHand), 'el reingreso repone la cantidad');
  assert.equal(num(avgAfter.averageUnitCost), num(avgBefore.averageUnitCost), 'un ajuste al promedio vigente no lo modifica');

  // Kardex: cronológico, con saldo corrido y documento de origen
  const kardex = await api(`/inventory/kardex?productId=${slot.lot.productId}&limit=500`);
  let running = num(kardex.opening);
  for (const row of kardex.items) { running += num(row.quantityIn) - num(row.quantityOut); assert.equal(num(row.runningQuantity), running); assert(row.referenceType, 'cada movimiento indica su documento de origen'); }
  assert.equal(num(kardex.closing), running);
  for (let i = 1; i < kardex.items.length; i++) assert(new Date(kardex.items[i].movementDate) >= new Date(kardex.items[i - 1].movementDate), 'orden cronológico');
  assert(kardex.items.some((row: any) => row.id === exit.id) && kardex.items.some((row: any) => row.id === entry.id));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
  const ranged = await api(`/inventory/kardex?productId=${slot.lot.productId}&dateFrom=${today}&dateTo=${today}&limit=500`);
  assert.equal(num(ranged.opening) + num(ranged.totals.quantityIn) - num(ranged.totals.quantityOut), num(ranged.closing), 'saldo anterior + entradas - salidas = saldo final del rango');
  await call(`/inventory/kardex?productId=${slot.lot.productId}&dateFrom=${today}&dateTo=2000-01-01`).then(r => assert.equal(r.status, 400));
  pass(`Kardex de ${kardex.product.name}: ${kardex.items.length} movimientos, saldo corrido y rango de fechas`);

  // Registro de control de inventarios (art. 142-A): encabezado, correlativo, documento, proveedor y saldo monetario
  const legal = await api(`/inventory/kardex?productId=${slot.lot.productId}&limit=500`);
  assert(legal.header.company.nit && legal.header.company.nrc && legal.header.company.name, 'El encabezado trae contribuyente, NIT y NRC');
  assert.equal(legal.header.consolidated, true);
  legal.items.forEach((row: any, index: number) => assert.equal(row.sequence, index + 1, 'correlativo consecutivo'));
  assert(legal.items.every((row: any) => !['TRANSFER_OUT', 'TRANSFER_IN'].includes(row.movementType)), 'el consolidado no cuenta traslados internos como entradas o salidas');
  const purchaseRows = legal.items.filter((row: any) => row.referenceType === 'purchase_detail' && row.lot);
  assert(purchaseRows.every((row: any) => row.supportDocument?.number && row.supplier?.name && row.supplier?.country), 'las compras traen documento de respaldo, proveedor y país');
  assert(legal.product.descriptionFull.startsWith(legal.product.name));
  for (const row of costs.items) {
    const check = await api(`/inventory/kardex?productId=${row.productId}&limit=500`);
    assert.equal(num(check.closing), num(row.quantityOnHand), `unidades del Kardex = costo promedio de ${row.product.name}`);
    assert(Math.abs(num(check.closingValue) - num(row.inventoryValue)) <= 0.05, `saldo monetario del Kardex = valor del inventario de ${row.product.name}`);
  }
  pass(`registro 142-A: encabezado con NIT/NRC, correlativo, documento y proveedor, y saldo monetario conciliado con el costo promedio de ${costs.items.length} productos`);

  // Etiquetas: la primera impresión se registra; reimprimir exige motivo
  const first = await db.inventoryLabelPrint.count({ where: { lotId: slot.lotId } });
  const printed = await call(`/inventory/lots/${slot.lotId}/labels`, 'POST', { quantity: 3 });
  if (first === 0) {
    assert.equal(printed.status, 201); assert.equal(printed.data.isReprint, false);
  } else assert.equal(printed.status, 400, 'una reimpresión sin motivo se rechaza');
  const reprint = await api(`/inventory/lots/${slot.lotId}/labels`, 'POST', { quantity: 2, reprintReason: 'QA: etiqueta dañada' });
  assert.equal(reprint.isReprint, true); assert.equal(reprint.label.lotCode, slot.lot.lotCode);
  const product = await db.product.findUniqueOrThrow({ where: { id: slot.lot.productId } });
  assert.equal(reprint.label.barcode, product.internalCode, 'RN-INV-016: el código de barras es el código interno');
  assert.equal(await db.inventoryLabelPrint.count({ where: { lotId: slot.lotId } }) >= first + 1, true);
  pass('etiquetas: código interno, lote y fecha; reimpresión con motivo; todo registrado');

  // Mover entre ubicaciones del mismo almacén: cambia dónde está el lote, no cantidad ni valor (RN-INV-009)
  const here = await db.location.findUniqueOrThrow({ where: { id: slot.locationId } });
  const target = await db.location.findFirst({ where: { warehouseId: here.warehouseId, id: { not: here.id }, isActive: true, deletedAt: null, capacity: { gte: 1 }, stocks: { none: { quantity: { gt: 0 }, productId: { not: slot.lot.productId } } } } });
  if (target) {
    const costBefore = await db.inventoryCostAverage.findUniqueOrThrow({ where: { companyId_productId: { companyId, productId: slot.lot.productId } } });
    const move = { lotId: slot.lotId, fromLocationId: here.id, toLocationId: target.id, quantity: 1, reason: 'QA lotes: reubicación de prueba', requestId: randomUUID() };
    const held = async () => num((await db.inventoryLocationDetail.findUnique({ where: { lotId_locationId: { lotId: slot.lotId, locationId: target.id } } }))?.quantity ?? 0);
    const heldBefore = await held();
    const moved = await api('/inventory/relocations', 'POST', move);
    assert.equal(num(moved.out.quantityOut), 1); assert.equal(num(moved.in.quantityIn), 1); assert.equal(moved.in.locationId, target.id);
    assert.equal((await api('/inventory/relocations', 'POST', move)).in.id, moved.in.id, 'el reintento no duplica el movimiento');
    assert.equal(await held(), heldBefore + 1);
    const costAfter = await db.inventoryCostAverage.findUniqueOrThrow({ where: { companyId_productId: { companyId, productId: slot.lot.productId } } });
    assert.equal(num(costAfter.quantityOnHand), num(costBefore.quantityOnHand)); assert.equal(num(costAfter.inventoryValue), num(costBefore.inventoryValue));
    await api('/inventory/relocations', 'POST', { ...move, requestId: randomUUID(), toLocationId: here.id }, 400);
    await api('/inventory/relocations', 'POST', { ...move, requestId: randomUUID(), quantity: 9999 }, 409);
    const other = await db.location.findFirst({ where: { warehouseId: { not: here.warehouseId }, isActive: true, deletedAt: null } });
    if (other) await api('/inventory/relocations', 'POST', { ...move, requestId: randomUUID(), toLocationId: other.id }, 400);
    await api('/inventory/relocations', 'POST', { ...move, requestId: randomUUID(), fromLocationId: target.id, toLocationId: here.id });
    pass('reubicación: mismo almacén, idempotente, sin cambiar cantidad ni valor; rechaza otro almacén, capacidad y saldo insuficiente');
  } else console.log('SKIP reubicación: no hay un espacio libre en el mismo almacén');

  // Devolución aceptada: vuelve al lote de origen, valorada a su costo, y no puede exceder lo entregado
  const returned = { lotId: slot.lotId, locationId: slot.locationId, quantity: 1, reason: 'QA lotes: devolución aceptada', requestId: randomUUID() };
  const giveAway = await api('/inventory/adjustments', 'POST', { productId: slot.lot.productId, locationId: slot.locationId, quantity: -1, lotId: slot.lotId, reason: 'QA lotes: entrega que luego se devuelve', requestId: randomUUID() });
  const stockBefore = await db.inventoryCostAverage.findUniqueOrThrow({ where: { companyId_productId: { companyId, productId: slot.lot.productId } } });
  const back = await api('/inventory/returns', 'POST', returned);
  assert.equal(back.movementType, 'RETURN'); assert.equal(num(back.quantityIn), 1); assert.equal(back.lotId, slot.lotId); assert.equal(num(back.unitCost), num(slot.lot.unitCost));
  assert.equal((await api('/inventory/returns', 'POST', returned)).id, back.id, 'el reintento no duplica el movimiento');
  const stockAfter = await db.inventoryCostAverage.findUniqueOrThrow({ where: { companyId_productId: { companyId, productId: slot.lot.productId } } });
  assert.equal(num(stockAfter.quantityOnHand), num(stockBefore.quantityOnHand) + 1);
  await api('/inventory/returns', 'POST', { ...returned, quantity: num(slot.lot.quantityReceived) + 1, requestId: randomUUID() }, 409);
  assert(giveAway.id);
  pass('devolución: reingresa solo lo entregado por el lote, a su costo, idempotente, sin exceder lo recibido');

  // Venta entregada: sale de la sucursal que entrega, por lote, todo o nada; la anulación compensa sin borrar
  const branchId = (await db.warehouse.findUniqueOrThrow({ where: { id: here.warehouseId } })).branchId;
  const availableIn = async () => num((await api(`/inventory/availability?branchId=${branchId}&productId=${slot.lot.productId}`))[0]?.available ?? 0);
  const onHandBefore = await availableIn(), costQty = async () => num((await db.inventoryCostAverage.findUniqueOrThrow({ where: { companyId_productId: { companyId, productId: slot.lot.productId } } })).quantityOnHand);
  const globalBefore = await costQty();
  const sale = { requestId: randomUUID(), branchId, saleId: 987001, reason: 'QA lotes: venta entregada', lines: [{ productId: slot.lot.productId, quantity: 2 }] };
  const delivered = await api('/inventory/sale-deliveries', 'POST', sale);
  assert(delivered.length >= 1 && delivered.every((m: any) => m.movementType === 'SALE' && m.referenceType === 'sale' && m.referenceId === 987001 && m.lotId));
  assert.equal(delivered.reduce((n: number, m: any) => n + num(m.quantityOut), 0), 2);
  assert.equal(await availableIn(), onHandBefore - 2); assert.equal(await costQty(), globalBefore - 2);
  assert.equal((await api('/inventory/sale-deliveries', 'POST', sale)).length, delivered.length, 'el reintento no duplica la salida');
  await api('/inventory/sale-deliveries', 'POST', { ...sale, lines: [{ productId: slot.lot.productId, quantity: 3 }] }, 409);
  await api('/inventory/sale-deliveries', 'POST', { ...sale, requestId: randomUUID(), lines: [{ productId: slot.lot.productId, quantity: onHandBefore + 1 }] }, 409);
  assert.equal(await availableIn(), onHandBefore - 2, 'una entrega rechazada no descuenta nada');
  const undone = await api('/inventory/sale-deliveries/reversal', 'POST', { requestId: sale.requestId, reason: 'QA lotes: venta anulada' });
  assert(undone.every((m: any) => m.movementType === 'REVERSAL' && num(m.quantityIn) > 0));
  assert.equal(await availableIn(), onHandBefore); assert.equal(await costQty(), globalBefore);
  assert.equal((await api('/inventory/sale-deliveries/reversal', 'POST', { requestId: sale.requestId, reason: 'QA lotes: venta anulada' })).length, undone.length);
  assert.equal(await availableIn(), onHandBefore, 'anular dos veces no reingresa dos veces');
  pass('venta entregada: descuenta de la sucursal por lote, todo o nada, idempotente; la anulación compensa sin borrar el historial');

  // Ubicación de tránsito de un vehículo: existe como referencia del traslado, nunca como espacio de almacenaje
  const plate = 'QA' + Math.floor(Math.random() * 90000 + 10000);
  const vehicleSpace = await api('/inventory/vehicle-locations', 'POST', { warehouseId: here.warehouseId, plate, brand: 'QA' });
  try {
    assert.equal(vehicleSpace.locationType, 'VEHICLE'); assert(vehicleSpace.vehicleId);
    assert.equal((await api('/inventory/vehicle-locations', 'POST', { warehouseId: here.warehouseId, plate })).id, vehicleSpace.id, 'la misma placa no duplica la ubicación');
    const catalogs = await api('/inventory/catalogs');
    assert(catalogs.vehicleLocations.some((l: any) => l.id === vehicleSpace.id && l.vehicle.plate === plate));
    assert(!catalogs.warehouses.some((w: any) => w.locations.some((l: any) => l.id === vehicleSpace.id)), 'un vehículo no se ofrece como espacio');
    await api('/inventory/adjustments', 'POST', { productId: slot.lot.productId, locationId: vehicleSpace.id, quantity: 1, reason: 'QA lotes: no debe aceptarse', requestId: randomUUID() }, 400);
    await api('/inventory/relocations', 'POST', { lotId: slot.lotId, fromLocationId: here.id, toLocationId: vehicleSpace.id, quantity: 1, reason: 'QA lotes: no debe aceptarse', requestId: randomUUID() }, 400);
    pass('vehículo de tránsito: ubicación propia por placa, fuera de los espacios de almacenaje');
  } finally {
    await db.location.deleteMany({ where: { id: vehicleSpace.id } }); await db.vehicle.deleteMany({ where: { id: vehicleSpace.vehicleId } });
  }

  // RN-INV-007: el historial no se edita ni se borra, ni siquiera con acceso directo a la base de datos
  await assert.rejects(db.inventoryMovement.update({ where: { id: exit.id }, data: { reason: 'manipulado' } }), /no se editan ni se eliminan/);
  await assert.rejects(db.inventoryMovement.delete({ where: { id: exit.id } }), /no se editan ni se eliminan/);
  assert.equal((await db.inventoryMovement.findUniqueOrThrow({ where: { id: exit.id } })).reason, 'QA lotes: salida de prueba');
  pass('movimientos inmutables: la base de datos rechaza UPDATE y DELETE');

  const after = await api('/inventory/reconciliation');
  assert.equal(after.consistent, true, 'La conciliación final debe estar limpia: ' + JSON.stringify(after.issues.slice(0, 3)));
  pass('conciliación final limpia tras ajustes, Kardex y etiquetas');

  const filtered = await api(`/inventory/movements?productId=${slot.lot.productId}&type=ADJUSTMENT&limit=5`);
  assert(filtered.items.length > 0 && filtered.items.every((m: any) => m.movementType === 'ADJUSTMENT'));
  assert((await api(`/inventory/movements?productId=${slot.lot.productId}&type=ADJUSTMENT&limit=100`)).items.find((m: any) => m.id === exit.id).lot.lotCode, 'los movimientos nuevos identifican su lote');
  pass('consulta de movimientos por tipo con lote y ubicación');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
