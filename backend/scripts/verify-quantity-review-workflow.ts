import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Product, Supplier } from '@prisma/client';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/application/services/audit.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { PurchasesService } from '../src/modules/purchases/application/services/purchases.service';
import { SupplyWorkflowService } from '../src/modules/purchases/application/services/supply-workflow.service';
import { PurchaseReceiptsService } from '../src/modules/purchases/application/services/purchase-receipts.service';
import { RetaceosService } from '../src/modules/purchases/application/services/retaceos.service';

const db = new PrismaService(), key = 'QA-QUANTITY-' + randomUUID(), rollback = new Error('QA_ROLLBACK');
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
const future = new Date(Date.now() + 7 * 86400000).toISOString();
const conflict = (error: any) => error.getStatus() === 409;
async function main() {
  let passed = false;
  try {
    await db.$transaction(async tx => {
      const scoped = new Proxy(tx, { get(t, p) { if (p === '$transaction') return (work: any) => typeof work === 'function' ? work(tx) : Promise.all(work); const v = Reflect.get(t,p); return typeof v === 'function' ? v.bind(t) : v; } }) as unknown as PrismaService;
      const audit = new AuditService(scoped), inventory = new InventoryService(scoped,audit), purchases = new PurchasesService(scoped,audit,inventory);
      const supply = new SupplyWorkflowService(scoped,audit,inventory,purchases), receipts = new PurchaseReceiptsService(scoped,audit,inventory), retaceos = new RetaceosService(scoped,audit);
      const config = await tx.erpConfiguration.findFirstOrThrow({ where: { generalWarehouseId: { not: null } }, include: { generalWarehouse: true } });
      const companyId=config.companyId,general=config.generalWarehouse!;
      const branches=await tx.branch.findMany({where:{companyId,isActive:true,deletedAt:null,id:{not:general.branchId}},include:{warehouses:{where:{isActive:true,deletedAt:null}}},take:2});
      assert.equal(branches.length,2);assert(branches.every(b=>b.warehouses.length));
      const actor=await tx.user.findFirstOrThrow({where:{isActive:true,deletedAt:null,userRoles:{some:{role:{name:'superadmin'}}}}});
      const admin:any={sub:actor.id,roles:['superadmin'],permissions:[]};
      const buyer:any={sub:actor.id,roles:['buyer'],permissions:['purchase_quotations.update','purchase_orders.update','purchase_expenses.create','purchase_expenses.update']};
      const manager:any={sub:actor.id,roles:['manager'],permissions:['purchase_orders.approve']};
      const category=await tx.productCategory.create({data:{name:key}}),subcategory=await tx.productSubcategory.create({data:{name:key,categoryId:category.id}});
      const buy=await tx.productUnit.create({data:{name:key,type:'purchase'}}),sale=await tx.productUnit.create({data:{name:key+' sale',type:'sale'}});
      const products:Product[]=[];for(let n=0;n<3;n++)products.push(await tx.product.create({data:{companyId,name:key+n,sku:key+n,internalCode:key+n,categoryId:category.id,subcategoryId:subcategory.id,purchaseUnitId:buy.id,saleUnitId:sale.id}}));
      const suppliers:Supplier[]=[];for(let n=0;n<2;n++)suppliers.push(await tx.supplier.create({data:{companyId,name:key+n,code:key+n,countryId:1}}));
      const expense=await tx.expenseType.create({data:{companyId,name:key}});
      const slot=await tx.location.create({data:{warehouseId:general.id,code:key,aisle:key,rack:'1',level:'1',position:'1',capacity:1000}});
      const destination=await tx.location.create({data:{warehouseId:branches[0].warehouses[0].id,code:key,aisle:key,rack:'1',level:'1',position:'1',capacity:1000}});
      const requests=[];
      for(let n=0;n<2;n++){
        let request=await purchases.createRequest({branchId:branches[n].id,warehouseId:general.id,purpose:'resale',requiredDate:future,justification:key,details:products.slice(0,2).map(p=>({productId:p.id,unitId:buy.id,quantity:n?6:4}))},actor.id,companyId);
        await assert.rejects(supply.create({dateFrom:day,dateTo:day,requestIds:[request.id]},companyId,actor.id));
        request=await purchases.submitRequest(request.id,actor.id,companyId);requests.push(request);
      }
      let process=await supply.create({dateFrom:day,dateTo:day,requestIds:requests.map(r=>r.id)},companyId,actor.id);
      assert(process.lines.every(l=>Number(l.requestedQuantity)===10&&l.sources.length===2));
      await assert.rejects(supply.rfq(process.id,{supplierId:suppliers[0].id,lineIds:process.lines.map(l=>l.id)},companyId,actor.id),conflict);
      process=await supply.reviewQuantities(process.id,'submit',{expectedRevision:process.quantityRevision},companyId,actor.id);
      await assert.rejects(supply.editLine(process.id,{productId:products[0].id,purchaseQuantity:15,reason:'Reserva'},companyId,actor.id,buyer),(e:any)=>e.getStatus()===403);
      const oldRevision=process.quantityRevision;
      for(const [index,quantity] of [[0,15],[1,8],[2,2]])process=await supply.editLine(process.id,{productId:products[index].id,purchaseQuantity:quantity,reason:'Gerencia ajusta necesidad y reserva',expectedRevision:process.quantityRevision},companyId,actor.id,manager);
      await assert.rejects(supply.reviewQuantities(process.id,'approve',{expectedRevision:oldRevision},companyId,actor.id),conflict);
      process=await supply.reviewQuantities(process.id,'approve',{expectedRevision:process.quantityRevision},companyId,actor.id);
      assert.equal(process.quantityApprovedBy,actor.id);assert.equal(Number(process.lines[0].requestedQuantity),10);assert.equal(Number(process.lines[2].requestedQuantity),0);
      const original=await purchases.request(requests[0].id,companyId);assert.equal(Number(original.details[0].quantity),4);
      console.log('PASS solicitudes de sucursales: borrador/enviado, agrupación 4+6, autorización previa, más/menos/adicionales sin sobrescribir originales, revisión obsoleta bloqueada');
      const quotes=[];
      for(let n=0;n<2;n++){
        process=await supply.rfq(process.id,{supplierId:suppliers[n].id,lineIds:process.lines.map(l=>l.id)},companyId,actor.id);
        const rfq=process.rfqs.find(r=>r.supplierId===suppliers[n].id)!;
        const document=await supply.rfqDocument(rfq.id,companyId);assert.deepEqual(document.lines.map(l=>Number(l.quantity)),[15,8,2]);
        const payload:any={rfqId:rfq.id,supplierId:rfq.supplierId,requestIds:[],quotationDate:day,validUntil:future,currency:'USD',costsConfirmed:true,conditionsConfirmed:true,expenses:[{expenseTypeId:expense.id,amount:50,chargeMode:'fixed'}],details:rfq.lines.map((l,index)=>({productId:l.line.productId,unitId:buy.id,quantity:Number(l.quantity),availableQuantity:Number(l.quantity),unitPrice:n===0?(index===0?1:index===1?4:3):(index===0?3:index===1?1:3),taxRate:0,sources:[]}))};
        if(n===0){await assert.rejects(purchases.createQuotation({...payload,details:payload.details.map((l:any)=>({...l,availableQuantity:0}))},actor.id,companyId,admin));const incomplete=await purchases.createQuotation({...payload,details:payload.details.map((l:any,index:number)=>({...l,availabilityStatus:index?'unavailable':'available',availableQuantity:index?0:l.quantity}))},actor.id,companyId,admin);await purchases.updateQuotation(incomplete.id,payload,actor.id,companyId,admin);quotes.push(await purchases.receiveQuotation(incomplete.id,actor.id,companyId));}
        else{const quote=await purchases.createQuotation(payload,actor.id,companyId,admin);quotes.push(await purchases.receiveQuotation(quote.id,actor.id,companyId));}
      }
      await assert.rejects(supply.editLine(process.id,{productId:products[0].id,purchaseQuantity:20,reason:'Tarde'},companyId,actor.id,manager),conflict);
      await assert.rejects(supply.reviewQuantities(process.id,'return',{expectedRevision:process.quantityRevision,notes:'Tarde'},companyId,actor.id),conflict);
      quotes[1]=await purchases.updateQuotation(quotes[1].id,{costsConfirmed:false},actor.id,companyId,admin);
      const incompleteAward:any={requestId:randomUUID(),submitForApproval:true,branchId:general.branchId,warehouseId:general.id,details:quotes[1].details.map(d=>({quotationDetailId:d.id,quantity:Number(d.quantity)}))};
      await assert.rejects(supply.award(process.id,incompleteAward,companyId,admin),(e:any)=>e.getStatus()===400&&/comparación/.test(e.message));
      quotes[1]=await purchases.updateQuotation(quotes[1].id,{costsConfirmed:true},actor.id,companyId,admin);
      const comparison=await supply.comparison(process.id,companyId);assert.equal(comparison.recommendation?.totalUsd,103);
      const full:any={requestId:randomUUID(),submitForApproval:true,branchId:general.branchId,warehouseId:general.id,details:quotes[0].details.map(d=>({quotationDetailId:d.id,quantity:Number(d.quantity)}))};
      await assert.rejects(supply.award(process.id,{...full,expectedComparisonHash:'0'.repeat(64)},companyId,admin),conflict);
      full.expectedComparisonHash=(await supply.comparison(process.id,companyId,full.details)).comparisonHash;
      process=await supply.award(process.id,full,companyId,admin);let order=await purchases.order(process.orders[0].id,companyId);assert.equal(order.status,'pending_approval');assert.equal(Number(order.total),103);
      await assert.rejects(purchases.updateQuotation(quotes[0].id,{notes:'No se debe modificar una oferta con orden activa'},actor.id,companyId,admin),conflict);
      assert.equal((await supply.award(process.id,{...full,requestId:full.requestId.toUpperCase()},companyId,admin)).orders[0].id,order.id);
      for(const editor of [buyer,manager,admin])await assert.rejects(purchases.updateOrder(order.id,{notes:'Editar pendiente'},actor.id,companyId,editor),conflict);
      await assert.rejects(purchases.updateOrder(order.id,{managementReview:true},actor.id,companyId,admin),conflict);
      await assert.rejects(purchases.sendOrder(order.id,actor.id,companyId),conflict);
      await assert.rejects(purchases.returnOrder(order.id,'',actor.id,companyId));await purchases.returnOrder(order.id,'Corregir presupuesto de transporte',actor.id,companyId);
      order=await purchases.updateOrder(order.id,{expenses:order.expenses.map(e=>({id:e.id,expenseTypeId:e.expenseTypeId,amount:40}))},actor.id,companyId,buyer);assert.equal(Number(order.total),93);
      await purchases.submitOrder(order.id,actor.id,companyId);await purchases.approveOrder(order.id,actor.id,companyId);
      await assert.rejects(purchases.updateOrder(order.id,{notes:'Editar aprobado'},actor.id,companyId,admin),conflict);
      await assert.rejects(purchases.receiveOrder(order.id,{requestId:randomUUID(),items:[{orderDetailId:order.details[0].id,quantity:1}]},actor.id,companyId),conflict);
      await purchases.cancelOrder(order.id,'Comparar selección combinada en QA',actor.id,companyId);
      const originalDetailIds=quotes[0].details.map(line=>line.id);
      quotes[0]=await purchases.updateQuotation(quotes[0].id,{notes:'Oferta revisada después de cancelar la orden'},actor.id,companyId,admin);
      assert.equal(quotes[0].status,'received');assert.deepEqual(quotes[0].details.map(line=>line.id),originalDetailIds);
      assert.deepEqual((await purchases.order(order.id,companyId)).details.map(line=>line.quotationDetailId),originalDetailIds,'La orden cancelada conserva sus vínculos y sus importes históricos');
      assert.equal(Number((await purchases.order(order.id,companyId)).total),93);
      await assert.rejects(purchases.updateQuotation(quotes[0].id,{details:[]},actor.id,companyId,admin),conflict);
      const rejectedProcess=await supply.award(process.id,{...full,requestId:randomUUID(),expectedComparisonHash:undefined},companyId,admin);
      const rejectedOrder=rejectedProcess.orders.find(record=>record.status==='pending_approval')!;
      await purchases.rejectOrder(rejectedOrder.id,'Solicitar una oferta actualizada',actor.id,companyId);
      quotes[0]=await purchases.updateQuotation(quotes[0].id,{notes:'Oferta revisada después de rechazar la orden'},actor.id,companyId,admin);
      assert.equal(quotes[0].status,'received');assert.deepEqual(quotes[0].details.map(line=>line.id),originalDetailIds);
      assert.deepEqual((await purchases.order(rejectedOrder.id,companyId)).details.map(line=>line.quotationDetailId),originalDetailIds);
      console.log('PASS ofertas revisables tras cancelar/rechazar órdenes, órdenes activas protegidas y vínculos históricos preservados');
      console.log('PASS oferta completa: costos completos, cotizaciones incompletas explícitas, PDF autorizado, final solo aprobar/devolver, revisión de gastos, UUID sin duplicados ni existencias');
      const mixed:any={requestId:randomUUID(),submitForApproval:true,branchId:general.branchId,warehouseId:general.id,details:[{quotationDetailId:quotes[0].details[0].id,quantity:15},{quotationDetailId:quotes[1].details[1].id,quantity:8},{quotationDetailId:quotes[0].details[2].id,quantity:2}]};
      process=await supply.award(process.id,mixed,companyId,admin);const orders=process.orders.filter(o=>!['cancelled','rejected'].includes(o.status));assert.equal(orders.length,2);
      assert.equal((await Promise.all(orders.map(o=>purchases.order(o.id,companyId)))).reduce((n,o)=>n+Number(o.total),0),129);
      assert.equal(await tx.inventoryStock.count({where:{productId:{in:products.map(p=>p.id)}}}),0);
      for(const record of orders){
        await purchases.approveOrder(record.id,actor.id,companyId);let approved=await purchases.sendOrder(record.id,actor.id,companyId);
        const receive:any={requestId:randomUUID(),items:approved.details.map(d=>({orderDetailId:d.id,quantity:Number(d.quantity),locationId:slot.id}))};
        const received=await purchases.receiveOrder(record.id,receive,actor.id,companyId);assert.equal((await purchases.receiveOrder(record.id,receive,actor.id,companyId)).purchases[0].id,received.purchases[0].id);
        const receipt=await receipts.findOne(received.purchases[0].id,companyId);assert(receipt.items.every(i=>i.locationId===null));
        assert.equal(new Set(receipt.purchaseOrder!.consolidation!.lines.flatMap(l=>l.sources.map(s=>s.requestDetail.request.id))).size,2,'La recepción conserva las solicitudes de ambas sucursales');
        await assert.rejects(receipts.transition(receipt.id,'verify',undefined,actor.id,companyId),conflict);
        await assert.rejects(retaceos.create({purchaseId:receipt.id,details:receipt.items.map(i=>({purchaseItemId:i.id,costFob:Number(i.lineTotal)}))},actor.id,companyId),conflict);
        for(const item of receipt.items){await supply.place(item.id,{locationId:slot.id,barcode:products.find(p=>p.id===item.productId)!.internalCode,confirmed:true},companyId,actor.id);await supply.place(item.id,{locationId:slot.id,barcode:products.find(p=>p.id===item.productId)!.internalCode,confirmed:true},companyId,actor.id);}
        await receipts.transition(receipt.id,'verify',undefined,actor.id,companyId);
        const actual:any={plannedExpenseId:approved.expenses[0].id,expenseTypeId:expense.id,reference:key+'-'+record.id,amount:30,category:'freight',capitalizable:true};
        const cost=await supply.expense(receipt.id,actual,companyId,actor.id);assert.equal((await supply.expense(receipt.id,actual,companyId,actor.id)).id,cost.id);
        await supply.expense(receipt.id,{expenseTypeId:expense.id,reference:key+'-noncap-'+record.id,amount:7,category:'expense',capitalizable:false},companyId,actor.id);
        let retaceo=await retaceos.create({purchaseId:receipt.id,totalFreight:999,details:receipt.items.map(i=>({purchaseItemId:i.id,costFob:Number(i.lineTotal)}))},actor.id,companyId);
        retaceo=await retaceos.calculate(retaceo.id,actor.id,companyId);assert.equal(Number(retaceo.totalFreight),30);assert.equal(Number(retaceo.totalExpenses),0);assert.equal(Number(retaceo.totalCost),Number(retaceo.totalFob)+30);
        await retaceos.calculate(retaceo.id,actor.id,companyId);assert.equal(await tx.purchaseExpenseAllocation.count({where:{retaceoId:retaceo.id}}),1);
        await assert.rejects(receipts.transition(receipt.id,'close',undefined,actor.id,companyId),conflict);
        await retaceos.verify(retaceo.id,actor.id,companyId);const movements=await tx.inventoryMovement.count();await retaceos.close(retaceo.id,actor.id,companyId);assert.equal(await tx.inventoryMovement.count(),movements);
        await receipts.transition(receipt.id,'close',undefined,actor.id,companyId);
      }
      console.log('PASS dos proveedores: órdenes separadas, gastos fijos una vez por proveedor, recepción sin ocupación sugerida, código confirmado, gastos reales sustituyen previstos, retaceo sin doble contabilización');
      const source=requests[0].details.find(d=>d.productId===products[0].id)!;
      const transfer:any={requestId:randomUUID(),items:[{requestDetailId:source.id,fromLocationId:slot.id,toLocationId:destination.id,quantity:3}]};
      const dispatched=await supply.dispatch(transfer,companyId,actor.id);assert.equal((await supply.dispatch(transfer,companyId,actor.id)).id,dispatched.id);
      const delivery:any={requestId:randomUUID(),items:[{itemId:dispatched.items[0].id,quantity:2,locationId:destination.id}]};
      await supply.receiveTransfer(dispatched.id,delivery,companyId,actor.id);await supply.receiveTransfer(dispatched.id,delivery,companyId,actor.id);
      const final=await supply.one(process.id,companyId),line=final.lines.find(l=>l.productId===products[0].id)!,allocation=line.sources.find(s=>s.requestDetailId===source.id)!;
      assert.equal(Number(line.requestedQuantity),10);assert.equal(Number(line.purchaseQuantity),15);assert.equal(Number(line.purchasedQuantity),15);assert.equal(Number(line.receivedQuantity),15);assert.equal(Number(line.distributedQuantity),2);
      assert.equal(Number(allocation.pendingQuantity),2);assert.equal(Number(allocation.dispatchedQuantity),3);
      assert.equal(await tx.log.count({where:{controller:'purchase_consolidations',recordId:process.id,action:'QUANTITIES_APPROVE'}}),1);
      console.log('PASS distribución parcial vinculada a sucursal: solicitado/propuesto/comprado/recibido/distribuido separados, saldos y auditoría, despachos y recepciones idempotentes');
      passed=true;throw rollback;
    },{timeout:120000});
  } catch(error) { if(error!==rollback)throw error; }
  assert(passed);assert.equal(await db.product.count({where:{sku:{startsWith:key}}}),0);assert.equal(await db.location.count({where:{code:key}}),0);
  console.log('PASS rollback: ningún dato de QA permanece en la base de datos');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
