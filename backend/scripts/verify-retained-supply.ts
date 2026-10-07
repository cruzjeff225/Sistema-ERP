/** Independently reconciles an existing demo. Never creates or deletes records. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
import { TRASH_ENTITIES, trashScope, type TrashEntity } from '../src/modules/trash/trash.registry';
const db = new PrismaService();
const run = process.argv.find(a => a.startsWith('--run='))?.slice(6);
assert(run && /^DEMO-\d{8}-[A-F0-9]{8}$/.test(run), 'Provide an existing --run=DEMO-YYYYMMDD-XXXXXXXX');
const directory = resolve('tmp/demos', run);
const report = JSON.parse(readFileSync(resolve(directory, 'resultado.json'), 'utf8'));
const companyId = report.companyId as number;
const withExisting = process.argv.includes('--with-existing');
const ids = (module: string) => report.records.filter((r: any) => r.module === module).map((r: any) => r.id) as number[];
const total = (rows: any[], field: string) => Math.round(rows.reduce((n, r) => n + Number(r[field]), 0) * 100) / 100;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checks: string[] = [];
function pass(message: string) { checks.push(message); console.log('PASS ' + message); }
async function main() {
  assert.equal(report.status, 'passed');
  const expected: Array<[TrashEntity, number, string?]> = [
    ['purchase_requests',2,'request'],['purchase_quotations',2,'quotation'],['purchase_orders',2,'order'],
    ['purchases',3,'receipt'],['retaceos',3,'retaceo'],['purchase_processes',1,'quotation_process'],
    ['rfqs',2],['transfers',2,'transfer'],['suppliers',2,'supplier'],['expense_types',1,'expense_type'],
    ['purchase_expenses',9],['supplier_contacts',0],['purchase_expense_documents',0],
  ];
  const counts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  for (const [entity, count, module] of expected) {
    const model = (db as any)[TRASH_ENTITIES[entity].model];
    const scope = { ...trashScope(entity, companyId), deletedAt: null };
    companyCounts[entity] = await model.count({ where: scope });
    const caseScope = module ? { id: { in: ids(module) } }
      : entity === 'rfqs' ? { consolidationId: report.processId }
      : entity === 'purchase_expenses' ? { purchaseId: { in: ids('receipt') } }
      : entity === 'supplier_contacts' ? { supplierId: { in: ids('supplier') } }
      : entity === 'purchase_expense_documents' ? { expense: { orderId: { in: ids('order') } } } : {};
    const records = await model.findMany({ where: withExisting ? { AND: [scope, caseScope] } : scope, orderBy: { id: 'asc' } });
    assert.equal(records.length,count,entity+' active count'); counts[entity] = records.length;
    if(module) assert.deepEqual(records.map((r: any) => r.id).sort((a: number,b: number)=>a-b),ids(module).sort((a,b)=>a-b),entity+' belongs only to this demo');
  }
  pass(withExisting ? 'Todos los documentos del nuevo escenario están activos; los casos existentes se conservan' : 'Un solo escenario activo; ningún documento de compra anterior permanece en gestión');
  const process = await db.purchaseConsolidation.findUniqueOrThrow({where:{id:report.processId},include:{lines:{include:{sources:{include:{requestDetail:true}}}},rfqs:{include:{lines:true,quotation:{include:{details:true}}}},orders:{include:{details:true,expenses:true}}}});
  assert.equal(process.companyId,companyId); assert.equal(process.status,'ordered');
  assert.equal(process.rfqs.length,2); assert.equal(process.orders.length,2);
  assert.equal(new Set(process.orders.map(o=>o.supplierId)).size,2);
  assert.deepEqual(process.rfqs.map(r=>r.lines.length).sort(),[1,2]);
  const products=ids('product'),teja=products[0]!,lamina=products[1]!;
  const tejaLine=process.lines.find(l=>l.productId===teja)!,laminaLine=process.lines.find(l=>l.productId===lamina)!;
  assert.equal(Number(tejaLine.requestedQuantity),500); assert.equal(Number(tejaLine.purchaseQuantity),600);
  assert.deepEqual(tejaLine.sources.map(s=>Number(s.quantity)).sort((a,b)=>a-b),[100,400]);
  assert.equal(Number(laminaLine.requestedQuantity),0); assert.equal(Number(laminaLine.purchaseQuantity),10); assert.equal(laminaLine.sources.length,0);
  for(const order of process.orders){
    assert.equal(order.status,'received'); assert.equal(order.warehouseId,report.generalWarehouse.id);
    const quote=process.rfqs.find(r=>r.quotation?.id===order.quotationId)?.quotation;
    assert(quote); assert.equal(quote.status,'selected'); assert.equal(quote.supplierId,order.supplierId);
    for(const detail of order.details) assert(quote.details.some(q=>q.id===detail.quotationDetailId&&q.productId===detail.productId));
  }
  const receipts=await db.purchase.findMany({where:{id:{in:ids('receipt')}},include:{items:true,actualExpenses:{include:{allocations:true}}}});
  const costs=await db.retaceo.findMany({where:{id:{in:ids('retaceo')}},include:{details:true,expenseAllocations:true}});
  const requests=await db.purchaseRequest.findMany({where:{id:{in:ids('request')}},include:{details:{include:{transferItems:true}}}});
  const transfers=await db.transfer.findMany({where:{id:{in:ids('transfer')}},include:{items:true}});
  for(const request of requests){assert.equal(request.status,'fulfilled');assert.equal(request.warehouseId,report.generalWarehouse.id);for(const line of request.details)assert.equal(total(line.transferItems,'receivedQuantity'),Number(line.quantity));}
  for(const receipt of receipts){assert.equal(receipt.status,'CLOSED');assert.equal(receipt.warehouseId,report.generalWarehouse.id);for(const line of receipt.items){assert(line.barcodeConfirmed&&line.placedAt&&line.placedBy&&line.locationId);}}
  for(const transfer of transfers){assert.equal(transfer.status,'COMPLETED');assert.equal(transfer.fromWarehouseId,report.generalWarehouse.id);for(const line of transfer.items){assert(line.requestDetailId);assert.equal(Number(line.receivedQuantity),Number(line.quantity));}}
  const orderLines=process.orders.flatMap(o=>o.details),receiptLines=receipts.flatMap(r=>r.items),transferLines=transfers.flatMap(t=>t.items);
  for(const [product,requested,bought,received,distributed] of [[teja,500,600,600,500],[lamina,0,10,10,0]]){
    assert.equal(total(requests.flatMap(r=>r.details).filter(d=>d.productId===product),'quantity'),requested);
    assert.equal(total(orderLines.filter(d=>d.productId===product),'quantity'),bought);
    assert.equal(total(orderLines.filter(d=>d.productId===product),'receivedQuantity'),received);
    assert.equal(total(receiptLines.filter(d=>d.productId===product),'quantity'),received);
    assert.equal(total(transferLines.filter(d=>d.productId===product),'receivedQuantity'),distributed);
  }
  pass('Trazabilidad real: solicitado 500/0, comprado 600/10, recibido 600/10 y distribuido 500/0');
  assert.deepEqual(receipts.filter(r=>r.items[0]?.productId===teja).map(r=>Number(r.items[0]!.quantity)).sort((a,b)=>a-b),[150,450]);
  assert.equal(total(process.orders.flatMap(o=>o.expenses),'amount'),110);
  const expenses=receipts.flatMap(r=>r.actualExpenses),capital=expenses.filter(e=>e.capitalizable),noncapital=expenses.filter(e=>!e.capitalizable);
  assert.equal(total(capital,'amount'),212);assert.equal(total(noncapital,'amount'),60);
  assert.equal(total(costs,'totalFob'),1230);assert.equal(total(costs,'totalFreight'),172);assert.equal(total(costs,'totalExpenses'),30);assert.equal(total(costs,'totalDai'),10);assert.equal(total(costs,'totalCost'),1442);
  for(const cost of costs){assert.equal(cost.status,'closed');assert.equal(total(cost.details,'totalCost'),Number(cost.totalCost));assert.equal(total(cost.expenseAllocations,'amount'),Number(cost.totalFreight)+Number(cost.totalExpenses)+Number(cost.totalDai));}
  for(const expense of capital){assert.equal(expense.allocations.length,1);assert.equal(Number(expense.allocations[0]!.amount),Number(expense.amount));}
  for(const expense of noncapital)assert.equal(expense.allocations.length,0);
  pass('Gastos previstos $110 separados de reales; FOB $1,230 + gastos capitalizables $212 = $1,442; IVA excluido y sin duplicación');
  const stocks=await db.inventoryStock.findMany({where:{productId:{in:products}},include:{location:true,movements:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}});
  assert.equal(stocks.length,4);assert.equal(stocks.reduce((n,s)=>n+s.movements.length,0),8);
  for(const stock of stocks){let balance=0;for(const movement of stock.movements){balance+=Number(movement.quantity);assert.equal(Number(movement.balance),balance);assert(balance>=0);}assert.equal(Number(stock.quantity),balance);}
  assert.equal(total(stocks.filter(s=>s.productId===teja&&s.location.warehouseId===report.generalWarehouse.id),'quantity'),100);
  assert.equal(total(stocks.filter(s=>s.productId===lamina&&s.location.warehouseId===report.generalWarehouse.id),'quantity'),10);
  assert.deepEqual(stocks.filter(s=>s.location.warehouseId!==report.generalWarehouse.id).map(s=>Number(s.quantity)).sort((a,b)=>a-b),[100,400]);
  pass('Cuatro existencias y ocho movimientos conciliados; reserva general 100 tejas + 10 láminas; sucursales 100 y 400');
  const backupArg=processArg('--backup=');
  assert(backupArg || withExisting,'Provide --backup=<archive-directory> to verify retained history');
  if (backupArg) {
  const archive=JSON.parse(readFileSync(resolve(backupArg,'archived.json'),'utf8'));
  const before=JSON.parse(readFileSync(resolve(backupArg,'before.json'),'utf8'));
  assert.equal(before.companyId,companyId);assert.equal(hash(before),archive.snapshotHash);assert.equal(archive.archived.length,66);
  const oldStocks=await db.inventoryStock.findMany({where:{id:{in:before.stocks.map((s:any)=>s.id)}},orderBy:{id:'asc'}});
  const oldMoves=await db.inventoryMovement.findMany({where:{id:{in:before.movements.map((m:any)=>m.id)}},orderBy:{id:'asc'}});
  assert.equal(hash(oldStocks),archive.stockHash);assert.equal(hash(oldMoves),archive.movementHash);
  for(const row of archive.archived){
    const record=await (db as any)[TRASH_ENTITIES[row.entity as TrashEntity].model].findUniqueOrThrow({where:{id:row.recordId}});assert(record.deletedAt);
    const entry=await db.trashEntry.findUniqueOrThrow({where:{id:row.trashId}});assert.equal(entry.companyId,companyId);assert(!entry.restoredAt&&!entry.purgedAt);assert.equal(entry.expiresAt.getTime()-entry.deletedAt.getTime(),30*86400000);
  }
  pass('66 registros anteriores recuperables durante 30 días; 14 existencias y 20 movimientos históricos idénticos al respaldo');
  }
  const base = globalThis.process.env.ERP_TEST_API_URL ?? 'http://localhost:3000/api';
  const login = await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:globalThis.process.env.ERP_TEST_EMAIL??globalThis.process.env.SEED_ADMIN_EMAIL,password:globalThis.process.env.ERP_TEST_PASSWORD??globalThis.process.env.SEED_ADMIN_PASSWORD}),signal:AbortSignal.timeout(20000)});
  assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Company-Id':String(companyId)};
  const response=await fetch(base+'/supply/consolidations/'+report.processId,{headers,signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);
  const live=(await response.json()).data;
  for(const [product,bought,received,distributed] of [[teja,600,600,500],[lamina,10,10,0]]){const line=live.lines.find((l:any)=>l.productId===product);assert.equal(Number(line.purchasedQuantity),bought);assert.equal(Number(line.receivedQuantity),received);assert.equal(Number(line.distributedQuantity),distributed);for(const source of line.sources)assert.equal(Number(source.pendingQuantity),0);}
  const mapResponse=await fetch(base+'/inventory/map?warehouseId='+report.generalWarehouse.id,{headers,signal:AbortSignal.timeout(20000)});assert.equal(mapResponse.status,200);
  const generalLocation=report.records.find((r:any)=>r.module==='location'&&r.code.endsWith('-GENERAL')).id;
  const slot=(await mapResponse.json()).data.locations.find((l:any)=>l.id===generalLocation);assert.equal(Number(slot.usedCapacity),110);
  for(const pdf of report.pdfs){const result=await fetch(base+'/supply/rfqs/'+pdf.rfqId+'/pdf',{headers,signal:AbortSignal.timeout(20000)});assert.equal(result.status,200);writeFileSync(resolve(directory,pdf.file),Buffer.from(await result.arrayBuffer()));}
  pass('API final y mapa coinciden con la BD; PDFs descargados del sistema corregido');
  if(globalThis.process.argv.includes('--replay')){
    const stockScope={product:{companyId}};
    const snapshot=async()=>({stocks:await db.inventoryStock.findMany({where:stockScope,orderBy:{id:'asc'}}),moves:await db.inventoryMovement.findMany({where:{stock:stockScope},orderBy:{id:'asc'}}),receipts:await db.purchase.findMany({where:{companyId},orderBy:{id:'asc'}}),transfers:await db.transfer.findMany({where:{companyId},include:{items:true},orderBy:{id:'asc'}})});
    const beforeRetry=hash(await snapshot());const seen=new Set<string>();let replayed=0;
    for(const operation of report.operations){
      if(operation.method!=='POST'||!/^\/(purchase-orders|supply\/transfers)\/\d+\/receive$/.test(operation.path))continue;
      const original=JSON.parse(operation.signature);if(seen.has(original.body.requestId))continue;seen.add(original.body.requestId);
      // The same logical UUID with a different letter case must also be a retry.
      const result=await fetch(base+operation.path,{method:'POST',headers,body:JSON.stringify({...original.body,requestId:original.body.requestId.toUpperCase()}),signal:AbortSignal.timeout(20000)});
      assert.equal(result.status,operation.status,await result.text());replayed++;
    }
    assert.equal(replayed,6);assert.equal(hash(await snapshot()),beforeRetry);
    pass('Seis reintentos HTTP con UUID en mayúsculas sobre documentos completados: ninguna recepción, entrega ni existencia duplicada');
  }
  writeFileSync(resolve(directory,'verificacion-independiente.json'),JSON.stringify({status:'PASS',verifiedAt:new Date().toISOString(),run,companyId,counts,companyCounts,checks,browser:false,replayed:globalThis.process.argv.includes('--replay'),inventoryChanged:false},null,2));
  console.log(JSON.stringify({status:'PASS',run,counts,checks:checks.length}));
}
function processArg(prefix:string){return globalThis.process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
