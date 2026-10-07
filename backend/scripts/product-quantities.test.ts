import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {plainToInstance} from 'class-transformer';
import {validateSync} from 'class-validator';
import {PurchaseRequestLineDto, QuotationSourceDto, PurchaseQuotationLineDto, PurchaseOrderSelectionDto, OrderLineChangeDto, ReceivePurchaseOrderLineDto, PurchaseExpenseDto} from '../src/modules/purchases/application/dto/purchase-process.dto';
import {ConsolidationLineDto, AwardLineDto, TransferLineDto, TransferReceiptLineDto, ActualExpenseDto} from '../src/modules/purchases/application/dto/supply-workflow.dto';
import {InventoryAdjustmentDto} from '../src/modules/inventory/inventory.dto';
import {InventoryService} from '../src/modules/inventory/inventory.service';

const base={productId:1,unitId:1,requestDetailId:1,quotationDetailId:1,orderDetailId:1,fromLocationId:1,toLocationId:2,locationId:1,itemId:1,quantity:2,availableQuantity:2,minimumQuantity:0,unitsPerPack:12,unitPrice:12.25,discount:0.25,taxRate:13.5,sources:[],purchaseQuantity:2,reason:'Reposición de existencias',requestId:randomUUID()};
const errors=(ctor:any,values:any)=>validateSync(plainToInstance(ctor,{...base,...values}));

test('all operational product quantities reject fractions without rounding and accept whole units',()=>{
 const fields:[any,string][]=[[PurchaseRequestLineDto,'quantity'],[QuotationSourceDto,'quantity'],[PurchaseQuotationLineDto,'quantity'],[PurchaseQuotationLineDto,'availableQuantity'],[PurchaseQuotationLineDto,'minimumQuantity'],[PurchaseQuotationLineDto,'unitsPerPack'],[PurchaseOrderSelectionDto,'quantity'],[OrderLineChangeDto,'quantity'],[ReceivePurchaseOrderLineDto,'quantity'],[ConsolidationLineDto,'purchaseQuantity'],[AwardLineDto,'quantity'],[TransferLineDto,'quantity'],[TransferReceiptLineDto,'quantity'],[InventoryAdjustmentDto,'quantity']];
 for(const [ctor,field] of fields){assert(errors(ctor,{[field]:1.2}).some(e=>e.property===field&&e.constraints?.isInt),`${ctor.name}.${field} must reject a fraction`);assert(!errors(ctor,{[field]:2}).some(e=>e.property===field),`${ctor.name}.${field} must accept 2`);}
 assert(errors(PurchaseRequestLineDto,{quantity:'1.2'}).some(e=>e.property==='quantity'));
 assert(!errors(InventoryAdjustmentDto,{quantity:-2}).some(e=>e.property==='quantity'));
 assert(errors(InventoryAdjustmentDto,{quantity:0}).some(e=>e.property==='quantity'));
 assert(!errors(PurchaseQuotationLineDto,{availableQuantity:0,minimumQuantity:0}).some(e=>['availableQuantity','minimumQuantity'].includes(e.property)));
 assert(!errors(ConsolidationLineDto,{purchaseQuantity:0}).some(e=>e.property==='purchaseQuantity'));
});

test('money, taxes and presentation prices retain their decimal precision',()=>{
 assert.equal(errors(PurchaseQuotationLineDto,{presentationPrice:12.3456}).length,0);
 assert.equal(errors(PurchaseExpenseDto,{expenseTypeId:1,amount:12.25}).length,0);
 assert.equal(errors(ActualExpenseDto,{expenseTypeId:1,reference:'Factura 104',amount:12.25,category:'freight',capitalizable:true}).length,0);
});

test('inventory refuses a fractional new movement before querying or writing the database',async()=>{
 const service=new InventoryService({} as any,{} as any);
 await assert.rejects(service.post({} as any,3,1,{productId:1,locationId:1,quantity:1.2,key:randomUUID(),type:'ADJUSTMENT',reason:'Ajuste físico'}),(error:any)=>error.getStatus()===400&&/entero/.test(error.message));
});
