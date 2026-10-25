import { projectOrderExpenses } from './order-expense-projection';
import { createHash } from 'node:crypto';
export function purchaseComparisonHash(process:any,selected:{quotationDetailId:number;quantity:number}[]){return createHash('sha256').update(JSON.stringify({id:process.id,updatedAt:process.updatedAt,lines:process.lines.map((l:any)=>({id:l.id,quantity:l.purchaseQuantity,purchased:l.purchasedQuantity})),quotes:process.rfqs.map((r:any)=>({id:r.quotation?.id,updatedAt:r.quotation?.updatedAt,status:r.quotation?.status,orders:r.quotation?.orders?.map((o:any)=>({id:o.id,revision:o.revision,status:o.status,total:o.total}))})),selected:[...selected].sort((a,b)=>a.quotationDetailId-b.quotationDetailId)})).digest('hex');}
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const active = (order: any) => !['cancelled','rejected'].includes(order.status);
export function estimatePurchaseSelection(quote: any, picks: {quotationDetailId:number;quantity:number}[]) {
  const consumed = (quote.orders ?? []).filter(active).flatMap((o:any)=>o.details ?? []);
  let gross=0,discount=0,subtotal=0,tax=0;
  for (const pick of picks) {
    const line=quote.details.find((d:any)=>d.id===pick.quotationDetailId);if(!line)continue;
    const before=consumed.filter((d:any)=>d.quotationDetailId===line.id);
    const sum=(key:string)=>before.reduce((n:number,d:any)=>n+Number(d[key]??0),0);
    const totalQty=sum('quantity')+pick.quantity;
    const g=roundMoney(Math.max(0,roundMoney(totalQty*Number(line.unitPrice))-sum('subtotal')-sum('discount')));
    const d=roundMoney(Math.min(g,Math.max(0,roundMoney(Number(line.discount)*totalQty/Number(line.quantity))-sum('discount'))));
    const net=roundMoney(g-d);const t=roundMoney(Math.max(0,roundMoney((sum('subtotal')+net)*Number(line.taxRate)/100)-sum('taxAmount')));
    gross+=g;discount+=d;subtotal+=net;tax+=t;
  }
  const previousGross=consumed.reduce((n:number,d:any)=>n+Number(d.subtotal)+Number(d.discount),0);
  const prior=(quote.orders ?? []).find((o:any)=>o.status==='draft'&&!o.deletedAt);
  const projected=projectOrderExpenses(quote.expenses ?? [],prior?.expenses ?? [],previousGross,gross,Math.max(Number(quote.subtotal),0.01));
  const original=(quote.expenses??[]).map((e:any)=>({ ...e,amount:roundMoney(Number(e.amount)*(e.chargeMode==='fixed'?(previousGross>0?1:0):Math.min(1,previousGross/Math.max(Number(quote.subtotal),0.01))))})).filter((e:any)=>e.amount>0);
  const current=prior?.expenses??original;
  const expenses=roundMoney(projected.expenses.reduce((n,e)=>n+Number(e.amount),0)-current.reduce((n:number,e:any)=>n+Number(e.amount),0));
  return {gross:roundMoney(gross),discount:roundMoney(discount),subtotal:roundMoney(subtotal),tax:roundMoney(tax),expenses,expensesAutomatic:projected.automatic,total:roundMoney(subtotal+tax+expenses)};
}
export function comparePurchase(process: any, selected: {quotationDetailId:number;quantity:number}[], today: string) {
  const groups=(picks:typeof selected)=>{
    const map=new Map<number,any>();
    for(const pick of picks){const rfq=process.rfqs.find((r:any)=>r.quotation?.details.some((d:any)=>d.id===pick.quotationDetailId));if(!rfq?.quotation)continue;
      const quote=rfq.quotation,group=map.get(quote.id)??{supplierId:rfq.supplierId,supplier:rfq.supplier.name,quotationId:quote.id,currency:quote.currency,quote,picks:[]};group.picks.push(pick);map.set(quote.id,group);}
    return [...map.values()].map(g=>{const rate=g.currency==='USD'?1:g.quote.exchangeRateToUsd&&g.quote.exchangeRateDate&&String(g.quote.exchangeRateDate instanceof Date?g.quote.exchangeRateDate.toISOString():g.quote.exchangeRateDate).slice(0,10)<=today?Number(g.quote.exchangeRateToUsd):null;
      const estimate=estimatePurchaseSelection(g.quote,g.picks);return{supplierId:g.supplierId,supplier:g.supplier,quotationId:g.quotationId,currency:g.currency,picks:g.picks,...estimate,totalUsd:rate?roundMoney(estimate.total*rate):null,partial:!g.quote.costsConfirmed||!g.quote.conditionsConfirmed,reasons:[...(!g.quote.costsConfirmed?['Cargos adicionales de la oferta pendientes de revisar']:[]),...(!g.quote.conditionsConfirmed?['Condiciones de la oferta pendientes de revisar']:[]),...(rate?[]:['Tipo de cambio sin confirmar'])]};});
  };
  const rows=process.lines.map((line:any)=>{
    const pending=roundMoney(Math.max(0,Number(line.purchaseQuantity)-Number(line.purchasedQuantity)));
    const picked=selected.find(p=>process.rfqs.some((r:any)=>r.quotation?.details.some((d:any)=>d.id===p.quotationDetailId&&d.consolidationLineId===line.id)));
    const wanted=picked?.quantity??pending;
    const cells=process.rfqs.map((rfq:any)=>{
      const q=rfq.quotation,d=q?.details.find((d:any)=>d.consolidationLineId===line.id);
      if(!d||d.availabilityStatus==='not_quoted')return{supplierId:rfq.supplierId,quotationId:q?.id??null,state:'not_quoted',label:'No cotizado',eligible:false};
      const consumed=(q.orders??[]).filter(active).flatMap((o:any)=>o.details??[]).filter((i:any)=>i.quotationDetailId===d.id).reduce((n:number,i:any)=>n+Number(i.quantity),0);
      const max=roundMoney(Math.max(0,Math.min(Number(d.availableQuantity)-consumed,Number(d.quantity)-consumed,pending)));
      let reason='';
      if(d.availabilityStatus==='unconfirmed')reason='Disponibilidad por confirmar';
      else if(d.availabilityStatus==='unavailable'||Number(d.availableQuantity)<=0)reason='No tiene este producto';
      else if(d.unitId!==line.unitId)reason='Unidad no equivalente';
      else if(!(Number(d.unitPrice)>0))reason='Precio pendiente de confirmar';
      else if(!['received','under_review','selected'].includes(q.status)||q.deletedAt)reason='Oferta pendiente o descartada';
      else if(q.validUntil.toISOString().slice(0,10)<today)reason='Oferta vencida';
      else if(rfq.supplier.isActive===false||rfq.supplier.deletedAt)reason='Proveedor inactivo';
      else if([...process.orders,...(q.orders??[])].some((o:any)=>(o.supplierId??rfq.supplierId)===rfq.supplierId&&active(o)&&(o.status!=='draft'||(o.quotationId??q.id)!==q.id||o.deletedAt)))reason='Proveedor con orden creada';
      else if(!pending||max<=0)reason='Cantidad ya ordenada';
      else if(Math.min(wanted,max)+consumed<Number(d.minimumQuantity))reason='No cumple la cantidad mínima';
      const quantity=Math.min(wanted,max),estimate=estimatePurchaseSelection(q,[{quotationDetailId:d.id,quantity}]);
      const rate=q.currency==='USD'?1:q.exchangeRateToUsd&&q.exchangeRateDate&&q.exchangeRateDate.toISOString().slice(0,10)<=today?Number(q.exchangeRateToUsd):null;
      return{supplierId:rfq.supplierId,quotationId:q.id,detailId:d.id,state:d.availabilityStatus,label:reason,eligible:!reason,quotedQuantity:Number(d.quantity),availableQuantity:roundMoney(Math.max(0,Number(d.availableQuantity)-consumed)),orderedQuantity:consumed,minimumRemainingQuantity:Math.max(0,Number(d.minimumQuantity)-consumed),maxQuantity:max,quantity,unitId:d.unitId,unitPrice:Number(d.unitPrice),unitPriceUsd:rate?Number(d.unitPrice)*rate:null,discount:Number(d.discount),taxRate:Number(d.taxRate),deliveryDays:d.deliveryDays??q.deliveryDays,presentation:d.presentation,unitsPerPack:Number(d.unitsPerPack),presentationPrice:d.presentationPrice==null?null:Number(d.presentationPrice),minimumQuantity:Number(d.minimumQuantity),currency:q.currency,total:estimate.total,totalUsd:rate?roundMoney(estimate.total*rate):null,subtotal:estimate.subtotal,complete:quantity>=wanted,partial:!q.costsConfirmed||!q.conditionsConfirmed};
    });
    const valid=cells.filter((c:any)=>c.eligible&&c.unitPriceUsd!=null).sort((a:any,b:any)=>a.unitPriceUsd-b.unitPriceUsd);
    return {lineId:line.id,product:line.product,unit:line.unit,requestedQuantity:Number(line.requestedQuantity),purchaseQuantity:Number(line.purchaseQuantity),purchasedQuantity:Number(line.purchasedQuantity),pendingQuantity:pending,wanted,cells,lowestUnitPriceDetailId:valid[0]?.detailId??null};
  });
  const candidates=rows.filter((r:any)=>r.pendingQuantity>0).map((r:any)=>{
    const available=r.cells.filter((c:any)=>c.eligible),full=available.filter((c:any)=>c.complete);
    const options=full.length?full:available;
    const qty=options.length?Math.min(r.wanted,...options.map((c:any)=>c.quantity)):0;
    return{row:r,options:options.filter((c:any)=>qty>=c.minimumRemainingQuantity),qty};
  });
  let visited=0,truncated=false,best:{picks:typeof selected;groups:any[];total:number}|null=null;
  const missing=candidates.some((x:any)=>!x.options.length);
  const usable=candidates.filter((x:any)=>x.options.length);
  const comparable=usable.length>0&&usable.every((x:any)=>x.options.every((c:any)=>c.totalUsd!=null));
  if(comparable&&candidates.length){
    const search=(index:number,picks:typeof selected)=>{
      if(++visited>100000){truncated=true;return;}
      if(index===usable.length){const g=groups(picks);const total=roundMoney(g.reduce((n,g)=>n+(g.totalUsd??0),0));if(!best||total<best.total)best={picks:[...picks],groups:g,total};return;}
      for(const c of usable[index].options){search(index+1,[...picks,{quotationDetailId:c.detailId,quantity:usable[index].qty}]);if(truncated)return;}
    };search(0,[]);
  }
  const recommended=best as {picks:typeof selected;groups:any[];total:number}|null;
  const recommendation=recommended?{details:recommended.picks,groups:recommended.groups,totalUsd:recommended.total,optimal:!truncated,partial:missing||truncated||recommended.groups.some(g=>g.partial)||candidates.some((x:any)=>x.qty<x.row.wanted),reason:truncated?'Mejor combinación evaluada; la búsqueda de alternativas fue limitada.':'Menor costo total para las cantidades comparables, incluyendo descuentos, impuestos y gastos por proveedor.',missingProducts:rows.filter((r:any)=>r.pendingQuantity>0&&!r.cells.some((c:any)=>c.eligible)).map((r:any)=>r.lineId)}:null;
  const supplierTotals=process.rfqs.map((r:any)=>{const details=rows.flatMap((row:any)=>{const cell=row.cells.find((c:any)=>c.supplierId===r.supplierId&&c.eligible);return cell?[{quotationDetailId:cell.detailId,quantity:cell.quantity}]:[];});return{supplierId:r.supplierId,supplier:r.supplier.name,complete:details.length>0&&rows.filter((row:any)=>row.pendingQuantity>0).every((row:any)=>row.cells.some((c:any)=>c.supplierId===r.supplierId&&c.eligible&&c.complete)),details,group:groups(details)[0]??null};});
  const selection=groups(selected);
  return {rows,suppliers:process.rfqs.map((r:any)=>({id:r.supplierId,name:r.supplier.name,quotationId:r.quotation?.id??null})),supplierTotals,selection,recommendation,comparisonPartial:!recommendation||recommendation.partial,reason:recommendation?.reason??'Faltan ofertas completas o tipos de cambio válidos para recomendar una combinación. Revise los productos y costos pendientes.'};
}
