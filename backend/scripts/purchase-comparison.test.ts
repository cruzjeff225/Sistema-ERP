import assert from 'node:assert/strict';
import {test} from 'node:test';
import {comparePurchase,estimatePurchaseSelection} from '../src/modules/purchases/application/services/purchase-comparison';
function fixture(){
 const q=(id:number,prices:number[],fee:number)=>({id,currency:'USD',status:'received',validUntil:new Date('2030-01-01'),updatedAt:new Date(),costsConfirmed:true,conditionsConfirmed:true,subtotal:prices.reduce((a,p)=>a+p*10,0),expenses:[{expenseTypeId:1,amount:fee,chargeMode:'fixed'}],orders:[],details:prices.map((p,index)=>({id:id*10+index,consolidationLineId:index+1,unitId:1,quantity:10,availableQuantity:10,availabilityStatus:'available',unitPrice:p,discount:0,taxRate:0,minimumQuantity:0,unitsPerPack:1}))});
 return{ id:1,updatedAt:new Date(),orders:[],lines:[1,2].map(id=>({id,unitId:1,product:{name:'Producto '+id},unit:{name:'Unidad'},requestedQuantity:10,purchaseQuantity:10,purchasedQuantity:0})),rfqs:[{supplierId:1,supplier:{name:'A',isActive:true},quotation:q(1,[1,4],50)},{supplierId:2,supplier:{name:'B',isActive:true},quotation:q(2,[3,1],50)}]};
}
test('recomienda costo total: combinación de menores precios cuesta 120, proveedor B completo cuesta 90',()=>{const data=fixture();const r=comparePurchase(data,[],'2026-10-05');assert.equal(r.recommendation?.totalUsd,90);assert.equal(r.recommendation?.groups.length,1);assert.equal(r.recommendation?.groups[0].supplierId,2);assert.equal(r.rows[0].lowestUnitPriceDetailId,10);assert.equal(r.rows[1].lowestUnitPriceDetailId,21);assert.equal(r.supplierTotals[0].group.total,100);});
test('un gasto fijo se cobra una sola vez; gasto proporcional y descuentos/impuestos siguen su base',()=>{const q=fixture().rfqs[0].quotation;assert.equal(estimatePurchaseSelection(q,[{quotationDetailId:10,quantity:5}]).total,55);assert.equal(estimatePurchaseSelection(q,[{quotationDetailId:10,quantity:5},{quotationDetailId:11,quantity:5}]).total,75);q.expenses[0].chargeMode='proportional';assert.equal(estimatePurchaseSelection(q,[{quotationDetailId:10,quantity:5}]).expenses,5);});
test('faltantes se marcan No cotizado; ceros históricos y no disponible no se recomiendan',()=>{const data:any=fixture();data.rfqs[0].quotation.details[0].availabilityStatus='unconfirmed';data.rfqs[0].quotation.details[0].availableQuantity=0;data.rfqs[1].quotation.details.pop();const r=comparePurchase(data,[],'2026-10-05');assert.equal(r.rows[0].cells[0].label,'Disponibilidad por confirmar');assert.equal(r.rows[1].cells[1].label,'No cotizado');assert(!r.rows[1].cells[1].eligible);});
test('unidad incompatible bloquea; monedas requieren un cambio válido y documentado',()=>{const data:any=fixture();data.rfqs[1].quotation.currency='EUR';let r=comparePurchase(data,[],'2026-10-05');assert.equal(r.recommendation,null);data.rfqs[1].quotation.exchangeRateToUsd=0.5;data.rfqs[1].quotation.exchangeRateDate=new Date('2026-10-05');r=comparePurchase(data,[],'2026-10-05');assert.equal(r.recommendation?.totalUsd,45);data.rfqs[0].quotation.details[0].unitId=2;r=comparePurchase(data,[],'2026-10-05');assert.equal(r.rows[0].cells[0].label,'Unidad no equivalente');});
test('costos desconocidos y cantidades mínimas producen comparación parcial explícita',()=>{const data:any=fixture();data.rfqs[1].quotation.costsConfirmed=false;let r=comparePurchase(data,[],'2026-10-05');assert(r.recommendation?.partial);data.rfqs[0].quotation.details[0].minimumQuantity=20;r=comparePurchase(data,[],'2026-10-05');assert.equal(r.rows[0].cells[0].label,'No cumple la cantidad mínima');});

test('al ampliar un borrador, el mínimo ya cubierto no elimina la recomendación', () => {
 const data:any=fixture();data.lines=data.lines.slice(0,1);data.rfqs=data.rfqs.slice(0,1);
 const quote=data.rfqs[0].quotation;quote.details=quote.details.slice(0,1);quote.subtotal=10;quote.details[0].minimumQuantity=6;
 quote.orders=[{id:1,supplierId:1,quotationId:quote.id,status:'draft',details:[{quotationDetailId:10,quantity:6,subtotal:6,discount:0,taxAmount:0}],expenses:[{expenseTypeId:1,amount:50}]}];
 data.orders=quote.orders;data.lines[0].purchasedQuantity=6;
 const result=comparePurchase(data,[],'2026-10-05');
 assert.equal(result.rows[0].cells[0].eligible,true);assert.equal(result.rows[0].cells[0].minimumRemainingQuantity,0);
 assert.deepEqual(result.recommendation?.details,[{quotationDetailId:10,quantity:4}]);
 assert.equal(result.recommendation?.totalUsd,4,'el cargo fijo ya está en la orden');
});

test('una orden en papelera mantiene la reserva y bloquea otra orden del mismo proveedor', () => {
 const data:any=fixture(),quote=data.rfqs[0].quotation;
 quote.orders=[{id:1,supplierId:1,quotationId:quote.id,status:'draft',deletedAt:new Date(),details:[{quotationDetailId:10,quantity:1,subtotal:1,discount:0,taxAmount:0}],expenses:[{expenseTypeId:1,amount:50}]}];
 data.lines[0].purchasedQuantity=1;
 const result=comparePurchase(data,[],'2026-10-05');
 assert.equal(result.rows[0].cells[0].eligible,false);assert.equal(result.rows[0].cells[0].label,'Proveedor con orden creada');
 assert(result.recommendation?.groups.every((group:any)=>group.supplierId!==1));
});

test('sin productos pendientes no se ofrece seleccionar una oferta completa vacía', () => {
 const data=fixture();data.lines.forEach(line=>line.purchasedQuantity=line.purchaseQuantity);
 const result=comparePurchase(data,[],'2026-10-05');
 assert.equal(result.recommendation,null);assert(result.supplierTotals.every((supplier:any)=>!supplier.complete&&!supplier.details.length));
});
