import 'dotenv/config';
import assert from 'node:assert/strict';

const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
let token = '';
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(payload)}`);
  return payload.data;
}
async function ensure(path: string, predicate: (row: any) => boolean, body: object) {
  const rows = await api(path);
  const current = (Array.isArray(rows) ? rows : rows.items).find(predicate);
  if (current) { assert(current.isActive !== false, 'Registro DEMO desactivado: no se reactivara automaticamente'); return current; }
  return api(path.split('?')[0], 'POST', body);
}
async function main() {
  const email = process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password = process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  assert(email && password, 'Configure las credenciales del administrador');
  const login = await api('/auth/login', 'POST', { email, password }); token = login.accessToken;
  const companies = await api('/companies');
  assert.equal(companies.length, 1);
  const company = companies[0];
  assert.equal(company.commercialName.toLowerCase(), 'atlas roofing');
  const geo = { departmentId: company.departmentId, municipalityId: company.municipalityId, districtId: company.districtId };
  const branch = await ensure('/branches', r => r.name === 'Centro de distribucion Atlas - DEMO', { companyId: company.id, name: 'Centro de distribucion Atlas - DEMO', address: 'Ubicacion ficticia para capacitacion, no corresponde a una sucursal real', ...geo });
  const category = await ensure('/warehouse-categories', r => r.name === 'Materiales para techos - DEMO', { name: 'Materiales para techos - DEMO', description: 'Catalogo de capacitacion' });
  const warehouse = await ensure('/warehouses', r => r.branchId === branch.id && r.name === 'Bodega de cubiertas - DEMO', { branchId: branch.id, categoryId: category.id, name: 'Bodega de cubiertas - DEMO', description: 'Bodega ficticia para practicar compras e inventario' });
  const locations: { id: number }[] = [];
  for (const [index, code] of ['DEMO-METAL-01', 'DEMO-ACCES-01'].entries()) locations.push(await ensure(`/locations?warehouseId=${warehouse.id}`, r => r.code === code, { warehouseId: warehouse.id, code, aisle: index ? 'B' : 'A', rack: '1', level: '1', position: '1', capacity: 500, notes: 'DEMO - Ubicacion de capacitacion' }));
  const countries = await api('/catalogs/countries');
  const sv = countries.find((r: any) => r.isoCode === 'SV');
  const foreign = countries.find((r: any) => r.isoCode === 'GT');
  assert(sv && foreign, 'Se requieren los paises SV y GT');
  const suppliers = [];
  for (const [index, row] of [{ code: 'DEMO-ATLAS-SV', name: 'Suministros de Cubiertas SV - DEMO', countryId: sv.id, ...geo }, { code: 'DEMO-ATLAS-GT', name: 'Cubiertas Regionales GT - DEMO', countryId: foreign.id }].entries()) {
    const supplier = await ensure('/suppliers', r => r.code === row.code, { ...row, address: 'Proveedor ficticio para capacitacion; no representa una entidad real', email: `compras${index + 1}@example.invalid` });
    suppliers.push(supplier);
    for (const role of ['Compras', 'Repartidor']) await ensure(`/supplier-contacts?supplierId=${supplier.id}`, r => r.fullName === `Contacto ${role} - DEMO`, { supplierId: supplier.id, fullName: `Contacto ${role} - DEMO`, role, isPrimary: role === 'Compras', email: `${role.toLowerCase()}${index}@example.invalid`, notes: 'Contacto ficticio, sin telefono real' });
  }
  const productCategory = await ensure('/product-categories', r => r.name === 'Sistemas de techado - DEMO', { name: 'Sistemas de techado - DEMO', description: 'Materiales ficticios de capacitacion para Atlas Roofing' });
  const sub = await ensure('/product-subcategories', r => r.categoryId === productCategory.id && r.name === 'Cubiertas y accesorios - DEMO', { categoryId: productCategory.id, name: 'Cubiertas y accesorios - DEMO' });
  const purchaseUnits: Record<string, number> = {}, saleUnits: Record<string, number> = {};
  for (const name of ['Pieza', 'Caja de 100', 'Cartucho']) {
    purchaseUnits[name] = (await ensure('/product-units', r => r.name === name && r.type === 'purchase', { name, type: 'purchase' })).id;
    saleUnits[name] = (await ensure('/product-units', r => r.name === name && r.type === 'sale', { name, type: 'sale' })).id;
  }
  const samples = [
    { sku: 'DEMO-AT-LAM-01', name: 'Lamina galvanizada ondulada 3 m - DEMO', unit: 'Pieza', cost: 22, price: 29, quantity: 40, location: 0, presentation: 'Pieza de 3 m; especificacion ilustrativa' },
    { sku: 'DEMO-AT-TOR-01', name: 'Tornillo autoperforante con arandela - DEMO', unit: 'Caja de 100', cost: 8, price: 12, quantity: 30, location: 1, presentation: 'Caja de 100 tornillos; se controla por caja' },
    { sku: 'DEMO-AT-SEL-01', name: 'Sellador de poliuretano 300 ml - DEMO', unit: 'Cartucho', cost: 4.5, price: 7, quantity: 18, location: 1, presentation: 'Cartucho de 300 ml' },
    { sku: 'DEMO-AT-CAN-01', name: 'Canaleta galvanizada 3 m - DEMO', unit: 'Pieza', cost: 15, price: 21, quantity: 12, location: 0, presentation: 'Tramo de 3 m' },
    { sku: 'DEMO-AT-CUM-01', name: 'Cumbrera galvanizada 2 m - DEMO', unit: 'Pieza', cost: 12, price: 17, quantity: 20, location: 0, presentation: 'Pieza de 2 m' },
  ];
  const products: { id: number; purchaseUnitId: number; internalCode: string }[] = [];
  for (const [index, sample] of samples.entries()) {
    const product = await ensure('/products', r => r.sku === sample.sku, { categoryId: productCategory.id, subcategoryId: sub.id, sku: sample.sku, name: sample.name, purchaseUnitId: purchaseUnits[sample.unit], saleUnitId: saleUnits[sample.unit], unitCost: sample.cost, salePrice: sample.price, presentation: sample.presentation, description: 'DEMO - Producto y precios simulados para explicar el ERP. No son cotizaciones comerciales reales.' });
    products.push(product);
    for (const [supplierIndex, supplier] of suppliers.entries()) await ensure(`/product-suppliers?productId=${product.id}`, r => r.supplierId === supplier.id, { productId: product.id, supplierId: supplier.id, supplierCode: `${supplierIndex ? 'GT' : 'SV'}-${sample.sku}`, isPreferred: supplierIndex === 0 });
    await api('/inventory/adjustments', 'POST', { productId: product.id, locationId: locations[sample.location].id, quantity: sample.quantity, reason: `DEMO - Saldo inicial de capacitacion ${sample.sku}`, requestId: `a71a5000-0000-4000-8000-00000000000${index + 1}` });
  }
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const selected = [products[0], products[4]];
  let request = await ensure('/purchase-requests', r => r.justification === 'DEMO-ATLAS: Reposicion de laminas y cumbreras para instalacion de techo', { branchId: branch.id, warehouseId: warehouse.id, requiredDate: future, purpose: "operations", justification: 'DEMO-ATLAS: Reposicion de laminas y cumbreras para instalacion de techo', details: selected.map((p, i) => ({ productId: p.id, unitId: p.purchaseUnitId, quantity: i ? 10 : 20 })) });
  if (request.status === 'draft') request = await api(`/purchase-requests/${request.id}/submit`, 'POST', {});
  if (request.status === 'submitted') request = await api(`/purchase-requests/${request.id}/approve`, 'POST', {});
  const quotes: { id: number; code: string; status: string; total: string }[] = [];
  for (const [index, supplier] of suppliers.entries()) {
    const quote = await ensure('/purchase-quotations', r => r.notes === `DEMO-ATLAS-OFERTA-${index + 1}`, { supplierId: supplier.id, requestIds: [request.id], quotationDate: today, validUntil: future, currency: 'USD', paymentTerms: 'Condicion simulada: pago a 15 dias', deliveryDays: index ? 7 : 3, notes: `DEMO-ATLAS-OFERTA-${index + 1}`, details: request.details.map((line: any) => ({ productId: line.productId, unitId: line.unitId, quantity: Number(line.quantity), availableQuantity: Number(line.quantity), unitPrice: line.productId === products[0].id ? (index ? 22 : 25) : (index ? 12 : 14), taxRate: 0, sources: [{ requestDetailId: line.id, quantity: Number(line.quantity) }] })) });
    quotes.push(quote.status === 'draft' ? await api(`/purchase-quotations/${quote.id}/receive`, 'POST', {}) : quote);
  }
  if (['received', 'under_review'].includes(quotes[1].status)) quotes[1] = await api(`/purchase-quotations/${quotes[1].id}/select`, 'POST', {});
  const orders = await api('/purchase-orders');
  let order = orders.find((r: any) => r.quotationId === quotes[1].id) ?? await api(`/purchase-orders/from-quotation/${quotes[1].id}`, 'POST', { branchId: branch.id, warehouseId: warehouse.id, expectedDate: future, notes: 'DEMO - Compra importada ficticia, no enviada a un proveedor real' });
  if (order.status === 'draft') order = await api(`/purchase-orders/${order.id}/submit`, 'POST', {});
  if (order.status === 'pending_approval') order = await api(`/purchase-orders/${order.id}/approve`, 'POST', {});
  let receipt = order.purchases.find((r: any) => r.supplierInvoiceNumber === 'DEMO-IMPORT-ATLAS-01');
  if (!receipt) {
    order = await api(`/purchase-orders/${order.id}/receive`, 'POST', { supplierInvoiceNumber: 'DEMO-IMPORT-ATLAS-01', supplierInvoiceDate: today, notes: 'DEMO - Recepcion de la mitad de la orden; sin operacion comercial real', items: order.details.map((line: any) => ({ orderDetailId: line.id, locationId: locations[0].id, quantity: Number(line.quantity) / 2 })) });
    receipt = order.purchases.find((r: any) => r.supplierInvoiceNumber === 'DEMO-IMPORT-ATLAS-01');
  }
  receipt = await api(`/purchases/${receipt.id}`);
  let retaceo = (await api(`/retaceos?purchaseId=${receipt.id}`))[0];
  if (!retaceo) retaceo = await api('/retaceos', 'POST', { purchaseId: receipt.id, originCountry: foreign.name, importInvoiceNumber: 'DEMO-IMPORT-ATLAS-01', importInvoiceDate: today, totalFreight: 30, totalExpenses: 8, totalDai: 12, importVat: 42.9, details: receipt.items.map((item: any) => ({ purchaseItemId: item.id, costFob: Number(item.lineTotal) })) });
  if (retaceo.status === 'draft') retaceo = await api(`/retaceos/${retaceo.id}/calculate`, 'POST', {});
  let pending = await ensure('/purchase-requests', r => r.justification === 'DEMO-ATLAS: Solicitud pendiente para practicar aprobacion', { branchId: branch.id, warehouseId: warehouse.id, requiredDate: future, purpose: "operations", justification: 'DEMO-ATLAS: Solicitud pendiente para practicar aprobacion', details: [{ productId: products[1].id, unitId: products[1].purchaseUnitId, quantity: 5 }, { productId: products[2].id, unitId: products[2].purchaseUnitId, quantity: 6 }] });
  if (pending.status === 'draft') pending = await api(`/purchase-requests/${pending.id}/submit`, 'POST', {});
  const stock = await api(`/inventory/stocks?warehouseId=${warehouse.id}`);
  console.log(JSON.stringify({ company: company.commercialName, branch: branch.name, warehouse: warehouse.name, products: stock.items.map((s: any) => ({ sku: s.product.sku, code: products.find(p => p.id === s.product.id)?.internalCode, quantity: s.quantity, unit: s.product.purchaseUnit.name, location: s.location.code })), request: { id: request.id, code: request.code }, pending: { id: pending.id, code: pending.code, status: pending.status }, quotations: quotes.map(q => ({ id: q.id, code: q.code, total: q.total })), order: { id: order.id, code: order.code, status: order.status }, receipt: { id: receipt.id, code: receipt.documentNumber }, retaceo: { id: retaceo.id, code: retaceo.code, total: retaceo.totalCost, status: retaceo.status } }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
