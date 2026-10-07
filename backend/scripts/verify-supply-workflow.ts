import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
const db = new PrismaService();
const base = process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
let token = '', companyId = 0;
const productIds: number[] = [], branchIds: number[] = [], warehouseIds: number[] = [], locationIds: number[] = [], supplierIds: number[] = [], requestIds: number[] = [], quoteIds: number[] = [], orderIds: number[] = [], purchaseIds: number[] = [], retaceoIds: number[] = [], transferIds: number[] = [];
let consolidationId = 0, expenseTypeId = 0, categoryId = 0, subcategoryId = 0;
const extraConsolidationIds: number[] = [];
const unitIds: number[] = [];
const trashIds: number[] = [];
let expenseDocumentId = 0, expenseDocumentPath = "";
async function api(path: string, method = 'GET', body?: unknown, expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(companyId ? { 'X-Company-Id': String(companyId) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); assert.equal(response.status, expected, `${path}: ${text.slice(0, 1200)}`);
  return JSON.parse(text).data;
}
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date()), future = new Date(Date.now()+7*86400000).toISOString();
async function main() {
  const login = await api('/auth/login', 'POST', { email: process.env.ERP_TEST_EMAIL ?? process.env.SEED_ADMIN_EMAIL, password: process.env.ERP_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD }, 200);
  token = login.accessToken; companyId = login.user.companies[0].id;
  const config = await db.erpConfiguration.findUniqueOrThrow({ where: { id: 1 }, include: { company: true, generalWarehouse: true } });
  assert(config.generalWarehouse, 'Configure el centro general');
  const general = config.generalWarehouse;
  const key = randomUUID().slice(0,8);
  const category = await db.productCategory.create({ data: { name: 'QA Supply '+key } }); categoryId=category.id;
  const subcategory = await db.productSubcategory.create({ data: { categoryId, name: 'QA Supply '+key } }); subcategoryId=subcategory.id;
  const purchaseUnit = await db.productUnit.create({ data: { name: 'QA Supply purchase '+key, type: 'purchase' } }); unitIds.push(purchaseUnit.id);
  const saleUnit = await db.productUnit.create({ data: { name: 'QA Supply sale '+key, type: 'sale' } }); unitIds.push(saleUnit.id);
  const template = { categoryId, subcategoryId, purchaseUnitId: purchaseUnit.id, saleUnitId: saleUnit.id };
  for (let n=0;n<2;n++) {
    const b = await db.branch.create({ data: { companyId, name: `QA SUPPLY ${key} ${n}`, address: 'QA', departmentId: config.company.departmentId, municipalityId: config.company.municipalityId, districtId: config.company.districtId } }); branchIds.push(b.id);
    const w = await db.warehouse.create({ data: { branchId: b.id, categoryId: general.categoryId, name: `QA SUPPLY ${key}` } }); warehouseIds.push(w.id);
    const l = await db.location.create({ data: { warehouseId: w.id, code: `QA-${key}`, aisle:'QA',rack:'QA',level:'1',position:'1',capacity:10000 } }); locationIds.push(l.id);
    const p = await db.product.create({ data: { companyId, categoryId: template.categoryId, subcategoryId: template.subcategoryId, purchaseUnitId: template.purchaseUnitId, saleUnitId: template.saleUnitId, sku:`QA-SUPPLY-${key}-${n}`,internalCode:`QA-SUPPLY-${key}-${n}`,name:`QA Supply ${key} ${n}` } }); productIds.push(p.id);
    const s = await db.supplier.create({ data: { companyId, code:`QA-SUPPLY-${key}-${n}`, name:`QA Supply ${key} ${n}`, countryId:1 } }); supplierIds.push(s.id);
  }
  const slot = await db.location.create({ data: { warehouseId: general.id, code:`QA-SUPPLY-${key}`,aisle:'QA',rack:'QA',level:'1',position:'1',capacity:10000 } }); locationIds.push(slot.id);
  const e = await db.expenseType.create({ data: { companyId, name:`QA Supply ${key}` } }); expenseTypeId=e.id;
  for (let n=0;n<2;n++) {
    const payload = { branchId:branchIds[n],warehouseId:general.id,purpose:'resale',requiredDate:future,justification:'QA flujo de abastecimiento',details:[{productId:productIds[0],unitId:template.purchaseUnitId,quantity:n===0?100:400}] };
    await api('/purchase-requests','POST',{...payload,warehouseId:warehouseIds[n]},400);
    const r = await api('/purchase-requests','POST',payload); requestIds.push(r.id); assert.equal(r.status,'draft');
    await api(`/purchase-requests/${r.id}/submit`,'POST');
  }
  const draft = await api('/purchase-requests','POST',{branchId:branchIds[0],warehouseId:general.id,purpose:'operations',requiredDate:future,justification:'QA borrador excluido',details:[{productId:productIds[1],unitId:template.purchaseUnitId,quantity:1}]}); requestIds.push(draft.id);
  await api('/supply/consolidations','POST',{dateFrom:date,dateTo:date,requestIds:[draft.id]},400);
  await api('/supply/consolidations','POST',{dateFrom:'2026-02-30',dateTo:date,requestIds:requestIds.slice(0,2)},400);
  let c = await api('/supply/consolidations','POST',{dateFrom:date,dateTo:date,requestIds:requestIds.slice(0,2)}); consolidationId=c.id;
  assert.equal(Number(c.lines[0].requestedQuantity),500); assert.deepEqual(c.lines[0].sources.map((s:any)=>Number(s.quantity)).sort((a:number,b:number)=>a-b),[100,400]);
  const managedRequests=await api('/supply/requests');
  for(const id of requestIds.slice(0,2)) {const managed=managedRequests.find((request:any)=>request.id===id);assert(managed);assert.equal(managed.details[0].consolidationSources[0].line.consolidationId,c.id);assert.equal(managed.details[0].eligible,false);}
  await api('/supply/consolidations','POST',{dateFrom:date,dateTo:date,requestIds:requestIds.slice(0,2)},409);
  c=await api(`/supply/consolidations/${c.id}/lines`,'PATCH',{productId:productIds[0],purchaseQuantity:300,reason:'QA compra menor a la necesidad original'});
  assert.equal(Number(c.lines[0].requestedQuantity),500);assert.equal(Number(c.lines[0].purchaseQuantity),300);
  assert.deepEqual(c.lines[0].sources.map((s:any)=>Number(s.quantity)).sort((a:number,b:number)=>a-b),[100,400]);
  assert.deepEqual(c.lines[0].sources.map((s:any)=>Number(s.pendingQuantity)).sort((a:number,b:number)=>a-b),[100,400]);
  c=await api(`/supply/consolidations/${c.id}/lines`,'PATCH',{productId:productIds[0],purchaseQuantity:600,reason:'Stock adicional autorizado'});
  c=await api(`/supply/consolidations/${c.id}/lines`,'PATCH',{productId:productIds[1],purchaseQuantity:10,reason:'Producto adicional'});
  assert.equal(Number(c.lines.find((l:any)=>l.productId===productIds[0]).requestedQuantity),500);
  assert.equal(Number(c.lines.find((l:any)=>l.productId===productIds[1]).requestedQuantity),0);
  console.log('PASS centro general fijo, borradores excluidos, consolidado 100+400=500, compra 600 y producto adicional');
  c=await api(`/supply/consolidations/${c.id}/quantities/submit`,'POST',{expectedRevision:c.quantityRevision});
  c=await api(`/supply/consolidations/${c.id}/quantities/approve`,'POST',{expectedRevision:c.quantityRevision});
  const hiddenRequest=await api('/trash/purchase_requests/'+requestIds[0],'DELETE');trashIds.push(hiddenRequest.id);
  await api(`/supply/consolidations/${c.id}/rfqs`,'POST',{supplierId:supplierIds[0],lineIds:c.lines.map((l:any)=>l.id)},409);
  await api('/trash/'+hiddenRequest.id+'/restore','POST',{});
  for (let n=0;n<2;n++) c=await api(`/supply/consolidations/${c.id}/rfqs`,'POST',{supplierId:supplierIds[n],lineIds:c.lines.filter((l:any)=>n===1 || l.productId===productIds[0]).map((l:any)=>l.id)});
  await api(`/supply/consolidations/${c.id}/lines`,'PATCH',{productId:productIds[0],purchaseQuantity:601,reason:'Cambio posterior a cotizar'},409);
  assert.equal(Number(c.rfqs[0].lines[0].quantity),600,'Conserva la cantidad autorizada y enviada al proveedor');
  const pdf=await fetch(`${base}/supply/rfqs/${c.rfqs[0].id}/pdf`,{headers:{Authorization:`Bearer ${token}`,'X-Company-Id':String(companyId)}});
  assert.equal(pdf.status,200); const bytes=Buffer.from(await pdf.arrayBuffer()); assert(bytes.subarray(0,8).toString().startsWith('%PDF-')); assert(!bytes.toString('latin1').includes(`QA-SUPPLY-${key}-1`),'El PDF no debe incluir productos no consultados');
  mkdirSync('tmp/pdfs',{recursive:true}); writeFileSync('tmp/pdfs/qa-supply-rfq.pdf',bytes);
  for (let n=0;n<2;n++) {
    const r=c.rfqs[n]; const q=await api('/purchase-quotations','POST',{rfqId:r.id,supplierId:r.supplierId,requestIds:[],quotationDate:date,validUntil:future,currency:'USD',paymentTerms:'30 dias',deliveryDays:2,
      expenses:n===0?[{expenseTypeId,description:'Flete ofertado',amount:30},{expenseTypeId,description:'Seguro ofertado',amount:10}]:[],
      details:r.lines.map((l:any)=>({productId:l.line.productId,unitId:l.line.unitId,quantity:Number(l.quantity),availableQuantity:Number(l.quantity),unitPrice:n===0?2:3,discount:0,taxRate:13,deliveryDays:n===0?5:2,notes:'Disponible',sources:[]}))}); quoteIds.push(q.id); await api(`/purchase-quotations/${q.id}/receive`,'POST');
  }
  c=await api(`/supply/consolidations/${c.id}`);
  const q1=c.rfqs[0].quotation.details.find((d:any)=>d.productId===productIds[0]); const q2=c.rfqs[1].quotation.details.find((d:any)=>d.productId===productIds[1]);
  await api(`/supply/consolidations/${c.id}/award`,'POST',{branchId:general.branchId,warehouseId:general.id,details:[{quotationDetailId:q1.id,quantity:601}]},400);
  const firstAward={requestId:randomUUID(),branchId:general.branchId,warehouseId:general.id,details:[{quotationDetailId:q1.id,quantity:100}]};
  const archivedOrigin=await api('/trash/purchase_requests/'+requestIds[0],'DELETE');trashIds.push(archivedOrigin.id);
  await api(`/supply/consolidations/${c.id}/award`,'POST',firstAward,409);
  assert.equal((await api('/purchase-quotations/'+quoteIds[0])).status,'received','Una adjudicación rechazada no debe cambiar la oferta');
  await api('/trash/'+archivedOrigin.id+'/restore','POST',{});
  await api(`/supply/consolidations/${c.id}/award`,'POST',{...firstAward,requestId:'referencia-invalida'},400);
  const firstAwards=await Promise.all([api(`/supply/consolidations/${c.id}/award`,'POST',firstAward),api(`/supply/consolidations/${c.id}/award`,'POST',firstAward)]);
  c=firstAwards[0];orderIds.push(...c.orders.map((o:any)=>o.id));assert.equal(firstAwards[1].orders[0].id,c.orders[0].id);
  assert.equal(Number(c.lines.find((l:any)=>l.productId===productIds[0]).purchasedQuantity),100,'Dos reintentos concurrentes solo deben comprar una vez');
  assert.equal(await db.log.count({where:{controller:'purchase_consolidations',recordId:c.id,action:'AWARD',modifiedData:{path:['requestId'],equals:firstAward.requestId}}}),1);
  await api(`/supply/consolidations/${c.id}/award`,'POST',{...firstAward,details:[{quotationDetailId:q1.id,quantity:1}]},409);
  assert.equal(c.status,'partially_ordered');const originalOrderId=c.orders[0].id;
  let partialOrder=await api(`/purchase-orders/${originalOrderId}`);assert.equal(Number(partialOrder.additionalExpenses),6.67);
  assert(new Date(partialOrder.expectedDate).getTime()>Date.now()+4*86400000,'La entrega debe respetar los cinco días ofrecidos');
  c=await api(`/supply/consolidations/${c.id}/award`,'POST',{branchId:general.branchId,warehouseId:general.id,details:[{quotationDetailId:q1.id,quantity:200}]});
  assert.equal(c.orders.length,1);assert.equal(c.orders[0].id,originalOrderId);
  const replayedAward=await api(`/supply/consolidations/${c.id}/award`,'POST',firstAward);assert.equal(Number(replayedAward.lines.find((l:any)=>l.productId===productIds[0]).purchasedQuantity),300,'Reintentar una adjudicación anterior no debe ampliar otra vez');
  partialOrder=await api(`/purchase-orders/${originalOrderId}`);assert.equal(Number(partialOrder.additionalExpenses),20);assert.equal(partialOrder.details.length,1);assert.equal(Number(partialOrder.details[0].quantity),300);
  await api(`/purchase-orders/${originalOrderId}`,'PATCH',{expenses:partialOrder.expenses.map((e:any,index:number)=>({id:e.id,expenseTypeId:e.expenseTypeId,description:e.description,amount:index===0?99:Number(e.amount)}))});
  const finalAward={requestId:randomUUID(),branchId:general.branchId,warehouseId:general.id,details:[{quotationDetailId:q1.id,quantity:300},{quotationDetailId:q2.id,quantity:10}]};
  c=await api(`/supply/consolidations/${c.id}/award`,'POST',finalAward); orderIds.push(...c.orders.filter((o:any)=>!orderIds.includes(o.id)).map((o:any)=>o.id));
  const replayedFinal=await api(`/supply/consolidations/${c.id}/award`,'POST',{...finalAward,details:[...finalAward.details].reverse()});assert.deepEqual(replayedFinal.orders.map((o:any)=>o.id).sort((a:number,b:number)=>a-b),c.orders.map((o:any)=>o.id).sort((a:number,b:number)=>a-b));
  assert.equal(Number((await api(`/purchase-orders/${originalOrderId}`)).additionalExpenses),104,'El presupuesto editado por Compras debe conservarse');
  assert.equal(c.orders.length,2); assert.equal(Number(c.lines.find((l:any)=>l.productId===productIds[0]).purchasedQuantity),600);
  await api(`/supply/consolidations/${c.id}/award`,'POST',{branchId:general.branchId,warehouseId:general.id,details:[{quotationDetailId:q1.id,quantity:1}]},400);
  console.log('PASS PDF por proveedor, ofertas desde consolidado y adjudicacion por producto en dos ordenes');
  const extraRequest=await api('/purchase-requests','POST',{branchId:branchIds[0],warehouseId:general.id,purpose:'operations',requiredDate:future,justification:'QA ampliación por producto',details:productIds.map((productId,index)=>({productId,unitId:template.purchaseUnitId,quantity:index===0?1:5}))});requestIds.push(extraRequest.id);
  await api(`/purchase-requests/${extraRequest.id}/submit`,'POST');
  let extraProcess=await api('/supply/consolidations','POST',{dateFrom:date,dateTo:date,requestIds:[extraRequest.id]});extraConsolidationIds.push(extraProcess.id);
  extraProcess=await api(`/supply/consolidations/${extraProcess.id}/quantities/submit`,'POST',{expectedRevision:extraProcess.quantityRevision});
  extraProcess=await api(`/supply/consolidations/${extraProcess.id}/quantities/approve`,'POST',{expectedRevision:extraProcess.quantityRevision});
  extraProcess=await api(`/supply/consolidations/${extraProcess.id}/rfqs`,'POST',{supplierId:supplierIds[0],lineIds:extraProcess.lines.map((l:any)=>l.id)});
  const extraRfq=extraProcess.rfqs[0];
  const extraQuote=await api('/purchase-quotations','POST',{rfqId:extraRfq.id,supplierId:supplierIds[0],requestIds:[],quotationDate:date,validUntil:future,currency:'USD',expenses:[{expenseTypeId,description:'Flete',amount:.03}],details:extraRfq.lines.map((l:any)=>({productId:l.line.productId,unitId:l.line.unitId,quantity:Number(l.quantity),availableQuantity:Number(l.quantity),unitPrice:1,discount:0,taxRate:0,sources:[]}))});quoteIds.push(extraQuote.id);
  await api(`/purchase-quotations/${extraQuote.id}/receive`,'POST');
  const extraAward=(detailId:number,quantity=1)=>({branchId:general.branchId,warehouseId:general.id,details:[{quotationDetailId:detailId,quantity}]});
  extraProcess=await api(`/supply/consolidations/${extraProcess.id}/award`,'POST',extraAward(extraQuote.details[0].id));const extraOrderId=extraProcess.orders[0].id;orderIds.push(extraOrderId);
  assert.equal(Number((await api(`/purchase-orders/${extraOrderId}`)).additionalExpenses),.01,'El medio centavo se redondea al crear la orden');
  extraProcess=await api(`/supply/consolidations/${extraProcess.id}/award`,'POST',extraAward(extraQuote.details[1].id,3));
  assert.equal(extraProcess.orders.length,1);assert.equal(extraProcess.orders[0].id,extraOrderId);const extraOrder=await api(`/purchase-orders/${extraOrderId}`);assert.equal(extraOrder.details.length,2);assert.equal(Number(extraOrder.total),4.02);assert.equal(extraOrder.expenses.length,1);assert.equal(Number(extraOrder.additionalExpenses),.02,'La ampliación debe recalcular el mismo gasto sin confundirlo con un presupuesto manual');
  await api(`/purchase-orders/${extraOrderId}/submit`,'POST');await api(`/supply/consolidations/${extraProcess.id}/award`,'POST',extraAward(extraQuote.details[1].id),409);
  await api(`/purchase-orders/${extraOrderId}/cancel`,'POST',{reason:'QA finalizada'});
  console.log('PASS ampliación de la misma orden borrador, adjudicación idempotente, nuevo producto, gastos sin duplicar, presupuesto manual y entrega ofrecida');
  for (const id of c.orders.map((o:any)=>o.id)) {
    let o=await api(`/purchase-orders/${id}`);
    if(o.supplierId===supplierIds[0]) o=await api(`/purchase-orders/${id}`,'PATCH',{expenses:[{expenseTypeId,amount:100,description:'Flete previsto'}]});
    await api(`/purchase-orders/${id}/submit`,'POST'); await api(`/purchase-orders/${id}/approve`,'POST');
    const d=o.details[0]; const amount=d.productId===productIds[0]?450:10;
    const payload={requestId:randomUUID(),items:[{orderDetailId:d.id,quantity:amount}]};
    const results=await Promise.all([api(`/purchase-orders/${id}/receive`,'POST',payload),api(`/purchase-orders/${id}/receive`,'POST',payload)]);
    const purchases=await db.purchase.findMany({where:{purchaseOrderId:id},include:{items:true}}); assert.equal(purchases.length,1); purchaseIds.push(purchases[0].id);
    await db.purchase.update({where:{id:purchases[0].id},data:{uuid:payload.requestId.toUpperCase()}});
    await api(`/purchase-orders/${id}/receive`,'POST',{...payload,requestId:payload.requestId.toUpperCase()});
    await api(`/purchase-orders/${id}/receive`,'POST',payload);
    await api(`/purchase-orders/${id}/receive`,'POST',{...payload,items:[{...payload.items[0],quantity:amount-.01}]},409);
    assert.equal(await db.purchase.count({where:{purchaseOrderId:id}}),1,'Los reintentos UUID de recepción no deben crear otra compra');
    assert.equal(purchases[0].items[0].locationId,null); assert.equal(await db.inventoryStock.count({where:{productId:d.productId}}),0);
    await api(`/purchases/${purchases[0].id}/verify`,'POST',undefined,409);
    await api('/retaceos','POST',{purchaseId:purchases[0].id,details:purchases[0].items.map(i=>({purchaseItemId:i.id,costFob:Number(i.lineTotal)}))},409);
    const p=purchases[0].items[0]; const barcode=await db.product.findUniqueOrThrow({where:{id:p.productId}});
    await api(`/supply/placements/${p.id}/confirm`,'POST',{locationId:slot.id,barcode:'incorrecto',confirmed:true},400);
    await api(`/supply/placements/${p.id}/confirm`,'POST',{locationId:slot.id,barcode:barcode.internalCode,confirmed:false},400);
    await api(`/supply/placements/${p.id}/confirm`,'POST',{locationId:locationIds[0],barcode:barcode.internalCode,confirmed:true},400);
    const occupied=Number((await db.inventoryStock.aggregate({where:{locationId:slot.id},_sum:{quantity:true}}))._sum.quantity??0);
    await db.location.update({where:{id:slot.id},data:{capacity:occupied+amount-1}});
    await api(`/supply/placements/${p.id}/confirm`,'POST',{locationId:slot.id,barcode:barcode.internalCode,confirmed:true},409);
    await db.location.update({where:{id:slot.id},data:{capacity:10000}});
    await api(`/supply/placements/${p.id}/confirm`,'POST',{locationId:slot.id,barcode:barcode.internalCode,confirmed:true});
    await api(`/supply/placements/${p.id}/confirm`,'POST',{locationId:slot.id,barcode:barcode.internalCode,confirmed:true});
    assert.equal(await db.inventoryMovement.count({where:{purchaseItemId:p.id}}),1); assert.equal(Number((await db.inventoryStock.findUniqueOrThrow({where:{productId_locationId:{productId:p.productId,locationId:slot.id}}})).quantity),amount);
    await api(`/purchases/${purchases[0].id}/verify`,'POST');
    await api(`/purchases/${purchases[0].id}/close`,'POST',undefined,409);
    const lifecycle=await api(`/purchases/${purchases[0].id}`); assert.equal(lifecycle.hasActiveRetaceo,false);assert.equal(lifecycle.retaceoStatus,null);assert.equal(lifecycle.retaceoArchived,false);
    if(amount===450) assert.equal(results[0].status,'partially_received');
  }
  console.log('PASS recepcion parcial, reintentos concurrentes, sugerencia sin ocupacion, barcode y colocacion idempotente');
  await api('/purchases?dateFrom=2026-02-30','GET',undefined,400);
  await api('/purchases?dateTo=2026-01-14T00%3A00%3A00Z','GET',undefined,400);
  await api('/purchases?dateFrom=2026-01-15&dateTo=2026-01-14','GET',undefined,400);
  await api('/purchases?pendingOnly=invalid','GET',undefined,400);
  const originalDates=await db.purchase.findMany({where:{id:{in:purchaseIds}},select:{id:true,purchaseDate:true}});
  try {
    await db.purchase.update({where:{id:purchaseIds[0]},data:{purchaseDate:new Date('2026-01-14T06:00:00.000Z')}});
    await db.purchase.update({where:{id:purchaseIds[1]},data:{purchaseDate:new Date('2026-01-15T06:00:00.000Z')}});
    const range=`/purchases?search=QA-SUPPLY-${key}&dateFrom=2026-01-14&dateTo=2026-01-14&limit=1`;
    const bounded=await api(range);assert.equal(bounded.meta.total,1);assert.equal(bounded.items[0].id,purchaseIds[0]);
    await db.purchase.update({where:{id:purchaseIds[1]},data:{purchaseDate:new Date('2026-01-15T05:59:59.999Z')}});
    const inclusive=await api(range);assert.equal(inclusive.meta.total,2);assert.equal(inclusive.meta.totalPages,2);assert.equal((await api(range+'&page=2')).items.length,1);
  } finally {
    for(const receipt of originalDates) await db.purchase.update({where:{id:receipt.id},data:{purchaseDate:receipt.purchaseDate}});
  }
  console.log('PASS fases obligatorias, fechas de El Salvador y paginacion con filtros en servidor');
  const po=await db.purchase.findFirstOrThrow({where:{id:{in:purchaseIds},supplierId:supplierIds[0]},include:{items:true,purchaseOrder:{include:{expenses:true}}}});
  const actual={expenseTypeId,plannedExpenseId:po.purchaseOrder.expenses[0].id,reference:`QA-FLETE-${key}`,amount:120,category:'freight',capitalizable:true};
  await api(`/supply/receipts/${po.id}/expenses`,'POST',actual); await api(`/supply/receipts/${po.id}/expenses`,'POST',actual);
  await api(`/supply/receipts/${po.id}/expenses`,'POST',{expenseTypeId,reference:`QA-GASTO-${key}`,amount:30,category:'expense',capitalizable:true});
  await api(`/supply/receipts/${po.id}/expenses`,'POST',{expenseTypeId,reference:`QA-IVA-${key}`,amount:20,category:'expense',capitalizable:false});
  let ret=await api('/retaceos','POST',{purchaseId:po.id,totalFreight:999,totalExpenses:999,details:po.items.map(i=>({purchaseItemId:i.id,costFob:Number(i.lineTotal)}))});retaceoIds.push(ret.id);
  ret=await api(`/retaceos/${ret.id}/calculate`,'POST'); assert.equal(Number(ret.totalFreight),120); assert.equal(Number(ret.totalExpenses),30);assert.equal(ret.expenseAllocations.length,2);assert.equal(Number(ret.totalCost),Number(ret.totalFob)+150);
  await api(`/retaceos/${ret.id}/calculate`,'POST');assert.equal(await db.purchaseExpenseAllocation.count({where:{retaceoId:ret.id}}),2);
  await api(`/retaceos/${ret.id}/verify`,'POST');await api(`/retaceos/${ret.id}/close`,'POST');assert.equal(Number((await db.inventoryStock.findUniqueOrThrow({where:{productId_locationId:{productId:productIds[0],locationId:slot.id}}})).quantity),450);
  const costed=await api(`/purchases/${po.id}`);assert.equal(costed.hasActiveRetaceo,true);assert.equal(costed.retaceoStatus,'closed');assert.equal(costed.retaceoArchived,false);
  const orderLifecycle=await api(`/purchase-orders/${po.purchaseOrderId}`);const linkedReceipt=orderLifecycle.purchases.find((p:any)=>p.id===po.id);assert.equal(linkedReceipt.retaceoStatus,'closed');assert(linkedReceipt.items.every((i:any)=>i.locationId===slot.id));
  console.log('PASS previsto 100 separado de real 120; retaceo real 150, exclusiones, sin doble gasto ni doble inventario');
  const original=await db.purchaseRequestDetail.findFirstOrThrow({where:{requestId:requestIds[0]}});
  const transferPayload={requestId:randomUUID(),items:[{requestDetailId:original.id,fromLocationId:slot.id,toLocationId:locationIds[0],quantity:80}]};
  const warehouseState=(await db.warehouse.findUniqueOrThrow({where:{id:warehouseIds[0]}})).isActive;
  try { await db.warehouse.update({where:{id:warehouseIds[0]},data:{isActive:false}});await api('/supply/transfers','POST',transferPayload,400); }
  finally { await db.warehouse.update({where:{id:warehouseIds[0]},data:{isActive:warehouseState}}); }
  const branchState=(await db.branch.findUniqueOrThrow({where:{id:branchIds[0]}})).isActive;
  try { await db.branch.update({where:{id:branchIds[0]},data:{isActive:false}});await api('/supply/transfers','POST',transferPayload,400); }
  finally { await db.branch.update({where:{id:branchIds[0]},data:{isActive:branchState}}); }
  await api('/supply/transfers','POST',{...transferPayload,items:[{...transferPayload.items[0],toLocationId:locationIds[1]}]},400);
  let tr=await api('/supply/transfers','POST',transferPayload);transferIds.push(tr.id);await api('/supply/transfers','POST',transferPayload);
  await db.transfer.update({where:{id:tr.id},data:{uuid:transferPayload.requestId.toUpperCase()}});
  const repeatedDispatch=await api('/supply/transfers','POST',{...transferPayload,requestId:transferPayload.requestId.toUpperCase()});
  assert.equal(repeatedDispatch.id,tr.id);await api('/supply/transfers','POST',transferPayload);
  await api('/supply/transfers','POST',{...transferPayload,items:[transferPayload.items[0],transferPayload.items[0]]},400);
  assert.equal(tr.status,'IN_TRANSIT'); assert.equal(await db.inventoryStock.count({where:{productId:productIds[0],locationId:locationIds[0]}}),0);
  const receiptPayload={requestId:randomUUID(),items:[{itemId:tr.items[0].id,quantity:30,locationId:locationIds[0]}]};
  await api(`/supply/transfers/${tr.id}/receive`,'POST',{...receiptPayload,items:[{...receiptPayload.items[0],quantity:81}]},400);
  await api(`/supply/transfers/${tr.id}/receive`,'POST',{...receiptPayload,items:[{...receiptPayload.items[0],locationId:slot.id}]},409);
  tr=await api(`/supply/transfers/${tr.id}/receive`,'POST',receiptPayload); assert.equal(tr.status,'PARTIALLY_RECEIVED');await api(`/supply/transfers/${tr.id}/receive`,'POST',receiptPayload);
  await api(`/supply/transfers/${tr.id}/receive`,'POST',{...receiptPayload,requestId:receiptPayload.requestId.toUpperCase()});
  assert.equal(Number((await db.transferItem.findUniqueOrThrow({where:{id:tr.items[0].id}})).receivedQuantity),30,'Una referencia UUID en mayúsculas debe ser el mismo reintento y no duplicar la entrada');
  const southRequest=await db.purchaseRequestDetail.findFirstOrThrow({where:{requestId:requestIds[1]}});
  const transferCount=await db.transfer.count({where:{id:{in:transferIds}}});
  await api('/supply/transfers','POST',{requestId:randomUUID(),items:[{requestDetailId:southRequest.id,fromLocationId:slot.id,toLocationId:locationIds[1],quantity:400}]},409);
  assert.equal(await db.transfer.count({ where: { items: { some: { productId: { in: productIds } } } } }),transferCount,'Un despacho rechazado no debe dejar documentos ni movimientos');
  await api(`/supply/transfers/${tr.id}/receive`,'POST',{...receiptPayload,items:[{...receiptPayload.items[0],quantity:31}]},409);
  let progress=await api(`/supply/consolidations/${c.id}`);let source=progress.lines.find((l:any)=>l.productId===productIds[0]).sources.find((s:any)=>s.requestDetailId===original.id);assert.equal(Number(source.pendingQuantity),70);assert.equal(Number(source.dispatchedQuantity),80);
  await api(`/supply/transfers/${tr.id}/receive`,'POST',{requestId:randomUUID(),items:[{itemId:tr.items[0].id,quantity:50,locationId:locationIds[0]}]});
  progress=await api(`/supply/consolidations/${c.id}`);source=progress.lines.find((l:any)=>l.productId===productIds[0]).sources.find((s:any)=>s.requestDetailId===original.id);assert.equal(Number(source.pendingQuantity),20);assert.equal(Number(source.distributedQuantity),80);
  await api('/supply/transfers','POST',{requestId:randomUUID(),items:[{requestDetailId:original.id,fromLocationId:slot.id,toLocationId:locationIds[0],quantity:21}]},409);
  console.log('PASS traslado vinculado, salida en transito, recepcion parcial 30+50, pendiente original 20 y reintentos sin duplicacion');
  const adjustment={requestId:randomUUID(),productId:productIds[1],locationId:slot.id,quantity:1,reason:'QA reintento de ajuste UUID'};
  const stockBeforeAdjustment=Number((await db.inventoryStock.findUniqueOrThrow({where:{productId_locationId:{productId:productIds[1],locationId:slot.id}}})).quantity);
  const adjustmentResult=await api('/inventory/adjustments','POST',adjustment);
  await db.inventoryMovement.update({where:{id:adjustmentResult.id},data:{key:adjustmentResult.key.toUpperCase()}});
  await api('/inventory/adjustments','POST',{...adjustment,requestId:adjustment.requestId.toUpperCase()});
  assert.equal(Number((await db.inventoryStock.findUniqueOrThrow({where:{productId_locationId:{productId:productIds[1],locationId:slot.id}}})).quantity),stockBeforeAdjustment+1);
  await api('/inventory/adjustments','POST',{...adjustment,requestId:randomUUID(),quantity:-1,reason:'QA compensación del ajuste temporal'});
  console.log('PASS referencias UUID canónicas e históricas, destinos activos, capacidad, pertenencia y rechazo sin efectos parciales');
  const expense = await db.purchaseOrderExpense.findFirstOrThrow({where:{orderId:po.purchaseOrderId}});
  expenseDocumentPath='uploads/purchase-expenses/qa-trash-'+key+'.pdf';mkdirSync('uploads/purchase-expenses',{recursive:true});writeFileSync(expenseDocumentPath,'%PDF-1.4 QA');
  const attached=await db.purchaseOrderExpenseDocument.create({data:{expenseId:expense.id,fileName:'QA '+key+'.pdf',filePath:'/uploads/purchase-expenses/qa-trash-'+key+'.pdf',fileType:'application/pdf'}});expenseDocumentId=attached.id;
  const attachmentTrash=await api('/purchase-order-expenses/documents/'+attached.id,'DELETE');trashIds.push(attachmentTrash.id);
  assert(existsSync(expenseDocumentPath),'El archivo debe mantenerse recuperable');
  assert(!(await api('/purchase-orders/'+expense.orderId)).expenses.some((e:any)=>e.documents.some((d:any)=>d.id===attached.id)));
  await api('/trash/'+attachmentTrash.id+'/restore','POST',{});
  const restoredFile=await fetch(base+'/purchase-order-expenses/documents/'+attached.id+'/content',{headers:{Authorization:'Bearer '+token,'X-Company-Id':String(companyId)}});assert.equal(restoredFile.status,200);assert((await restoredFile.text()).startsWith('%PDF-1.4'));
  const beforeStock = await db.inventoryStock.findMany({ where: { productId: { in: productIds } }, orderBy: { id: 'asc' } });
  const beforeMovements = await db.inventoryMovement.count({ where: { stock: { productId: { in: productIds } } } });
  const movementBefore = await api('/inventory/movements?productId=' + productIds[0] + '&page=1&limit=100');
  const valuedBefore = movementBefore.items.find((i:any)=>i.costReference?.source==='retaceo'); assert(valuedBefore);
  for (const [entity,id,path] of [
   ['purchase_requests',requestIds[0],'/purchase-requests/'],['purchase_quotations',quoteIds[0],'/purchase-quotations/'],
   ['purchase_orders',orderIds[0],'/purchase-orders/'],['purchases',purchaseIds[0],'/purchases/'],['retaceos',retaceoIds[0],'/retaceos/'],
  ] as const) {
   const row = await api(path+id);const entry = await api('/trash/'+entity+'/'+id,'DELETE');trashIds.push(entry.id);
   await api(path+id,'GET',undefined,404);
   if(entity==='purchases') await api(`/supply/placements/${row.items[0].id}/confirm`,'POST',{locationId:slot.id,barcode:(await db.product.findUniqueOrThrow({where:{id:row.items[0].productId}})).internalCode,confirmed:true},404);
   assert.equal(await db.inventoryMovement.count({where:{stock:{productId:{in:productIds}}}}),beforeMovements);
   assert.deepEqual(await db.inventoryStock.findMany({where:{productId:{in:productIds}},orderBy:{id:'asc'}}),beforeStock);
   if(entity==='retaceos') {
    const archivedLifecycle=await api('/purchases/'+row.purchaseId);assert.equal(archivedLifecycle.hasActiveRetaceo,true);assert.equal(archivedLifecycle.retaceoStatus,'closed');assert.equal(archivedLifecycle.retaceoArchived,true);assert(!archivedLifecycle.retaceos.some((r:any)=>r.id===id));
    const archivedOption=(await api('/retaceos/purchases')).find((p:any)=>p.id===row.purchaseId);assert.equal(archivedOption.retaceoArchived,true);assert.equal(archivedOption.hasActiveRetaceo,true);assert.equal(archivedOption.retaceos.length,0);
    await api('/retaceos','POST',{purchaseId:row.purchaseId,details:row.details.map((d:any)=>({purchaseItemId:d.purchaseItemId,costFob:Number(d.costFob)}))},409);
    const valuedAfter=(await api('/inventory/movements?productId='+productIds[0]+'&page=1&limit=100')).items.find((i:any)=>i.id===valuedBefore.id);
    assert.equal(Number(valuedAfter.costReference.valuationUnitCost),Number(valuedBefore.costReference.valuationUnitCost));
   }
   if(entity==='purchase_orders') assert(!(await api('/supply/consolidations/'+c.id)).orders.some((r:any)=>r.id===id));
   if(entity==='purchase_quotations') assert(!(await api('/supply/consolidations/'+c.id)).rfqs.some((r:any)=>r.quotation?.id===id));
   await api('/trash/'+entry.id+'/restore','POST',{});assert.equal((await api(path+id)).status,row.status);
  }
  const transferBefore=await db.transfer.findUniqueOrThrow({where:{id:tr.id}});
  const transferTrash=await api('/trash/transfers/'+tr.id,'DELETE');trashIds.push(transferTrash.id);
  assert(!(await api('/supply/transfers')).some((r:any)=>r.id===tr.id));
  assert.equal((await db.transfer.findUniqueOrThrow({where:{id:tr.id}})).status,transferBefore.status);
  await api('/trash/'+transferTrash.id+'/restore','POST',{});
  await api(`/purchases/${po.id}/close`,'POST');
  const onlyPending=await api(`/purchases?search=QA-SUPPLY-${key}&pendingOnly=true`);assert.equal(onlyPending.meta.total,1);assert(!onlyPending.items.some((p:any)=>p.id===po.id));
  assert.equal((await api(`/purchases?search=QA-SUPPLY-${key}&pendingOnly=false`)).meta.total,2);
  assert.equal((await api(`/purchases?search=QA-SUPPLY-${key}&pendingOnly=true&status=CLOSED`)).meta.total,0);
  const historic=await api('/supply/consolidations/'+c.id);source=historic.lines.find((l:any)=>l.productId===productIds[0]).sources.find((s:any)=>s.requestDetailId===original.id);assert.equal(Number(source.distributedQuantity),80);assert.equal(Number(source.pendingQuantity),20);
  console.log('PASS papelera en solicitudes, ofertas, órdenes, recepciones, retaceos y traslados; costos y movimientos conservados');

}
async function cleanup() {
  await db.$transaction(async tx=>{
    await tx.trashEntry.deleteMany({where:{id:{in:trashIds}}});
    const movementIds=(await tx.inventoryMovement.findMany({where:{stock:{productId:{in:productIds}}},select:{id:true}})).map(m=>m.id);
    const actualExpenseIds=(await tx.purchaseActualExpense.findMany({where:{purchaseId:{in:purchaseIds}},select:{id:true}})).map(e=>e.id);
    await tx.log.deleteMany({where:{OR:[
      {controller:'purchase_requests',recordId:{in:requestIds}},{controller:'purchase_quotations',recordId:{in:quoteIds}},
      {controller:'purchase_orders',recordId:{in:orderIds}},{controller:'purchases',recordId:{in:purchaseIds}},{controller:'retaceos',recordId:{in:retaceoIds}},
      {controller:'inventory',action:{in:['RECEIPT','TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT','REVERSAL']},recordId:{in:movementIds}},
      {controller:'inventory',action:{in:['DISPATCH','RECEIVE_TRANSFER']},recordId:{in:transferIds}},
      {controller:'transfers',recordId:{in:transferIds}},{controller:'purchase_expenses',recordId:{in:actualExpenseIds}},
      {controller:'purchase_consolidations',recordId:{in:[...(consolidationId?[consolidationId]:[]),...extraConsolidationIds]}},
      {controller:'purchase_expense_documents',recordId:{in:expenseDocumentId?[expenseDocumentId]:[]}}
    ]}});
    await tx.inventoryMovement.deleteMany({where:{stock:{productId:{in:productIds}}}});
    await tx.inventoryStock.deleteMany({where:{productId:{in:productIds}}});
    await tx.transferItem.deleteMany({where:{transferId:{in:transferIds}}}); await tx.transfer.deleteMany({where:{id:{in:transferIds}}});
    await tx.purchaseExpenseAllocation.deleteMany({where:{retaceoId:{in:retaceoIds}}});
    await tx.retaceoDetail.deleteMany({where:{retaceoId:{in:retaceoIds}}}); await tx.retaceo.deleteMany({where:{id:{in:retaceoIds}}});
    await tx.purchaseActualExpense.deleteMany({where:{purchaseId:{in:purchaseIds}}});
    await tx.purchaseItem.deleteMany({where:{purchaseId:{in:purchaseIds}}}); await tx.purchase.deleteMany({where:{id:{in:purchaseIds}}});
    if(expenseDocumentId)await tx.purchaseOrderExpenseDocument.deleteMany({where:{id:expenseDocumentId}});
    await tx.purchaseOrderDetail.deleteMany({where:{orderId:{in:orderIds}}}); await tx.purchaseOrderExpense.deleteMany({where:{orderId:{in:orderIds}}}); await tx.purchaseOrder.deleteMany({where:{id:{in:orderIds}}});
    await tx.purchaseQuotation.deleteMany({where:{id:{in:quoteIds}}});
    const allConsolidations=[...(consolidationId?[consolidationId]:[]),...extraConsolidationIds];
    if(allConsolidations.length) { await tx.purchaseRfq.deleteMany({where:{consolidationId:{in:allConsolidations}}});await tx.purchaseConsolidationSource.deleteMany({where:{line:{consolidationId:{in:allConsolidations}}}});await tx.purchaseConsolidationLine.deleteMany({where:{consolidationId:{in:allConsolidations}}});await tx.purchaseConsolidation.deleteMany({where:{id:{in:allConsolidations}}}); }
    await tx.purchaseRequest.deleteMany({where:{id:{in:requestIds}}});
    await tx.location.deleteMany({where:{id:{in:locationIds}}});await tx.warehouse.deleteMany({where:{id:{in:warehouseIds}}});await tx.branch.deleteMany({where:{id:{in:branchIds}}});
    await tx.product.deleteMany({where:{id:{in:productIds}}});await tx.supplier.deleteMany({where:{id:{in:supplierIds}}});if(expenseTypeId)await tx.expenseType.delete({where:{id:expenseTypeId}});
    if(subcategoryId)await tx.productSubcategory.deleteMany({where:{id:subcategoryId}});
    if(categoryId)await tx.productCategory.deleteMany({where:{id:categoryId}});
    await tx.productUnit.deleteMany({where:{id:{in:unitIds}}});
  },{timeout:20000});
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{await cleanup();if(expenseDocumentPath&&existsSync(expenseDocumentPath))unlinkSync(expenseDocumentPath);}finally{await db.$disconnect();}});
