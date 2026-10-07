import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service';
const db=new PrismaService(),companyId=3;
const directory=resolve('tmp/base-data',new Date().toISOString().replace(/[:.]/g,'-'));
async function main(){
 const before={suppliers:await db.supplier.findMany({where:{companyId},include:{contacts:true}}),expenses:await db.expenseType.findMany({where:{companyId}}),products:await db.product.findMany({where:{companyId},include:{suppliers:true}}),branches:await db.branch.findMany({where:{companyId},include:{warehouses:{include:{locations:true}}}}),categories:await db.productCategory.findMany({include:{subcategories:true}}),units:await db.productUnit.findMany(),warehouseCategories:await db.warehouseCategory.findMany()};
 const operations=['purchaseRequest','purchaseConsolidation','purchaseRfq','purchaseQuotation','purchaseOrder','purchase','retaceo','transfer','inventoryStock','inventoryMovement'] as const;
 const operationBefore:Record<string,any[]>={};for(const model of operations)operationBefore[model]=await (db as any)[model].findMany({orderBy:{id:'asc'}});
 const operationCountsBefore=Object.fromEntries(operations.map(model=>[model,operationBefore[model].length]));
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'inspect',companyId,products:before.products.filter(p=>!p.deletedAt&&p.isActive).length,oldSuppliers:before.suppliers.filter(s=>!s.deletedAt&&/demo/i.test(s.name)).length,operations:operationCountsBefore}));return;}
 mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'before.json'),JSON.stringify({...before,operations:operationBefore},null,2));
 const base=process.env.ERP_TEST_API_URL??'http://localhost:3000/api';
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ERP_TEST_EMAIL??process.env.SEED_ADMIN_EMAIL,password:process.env.ERP_TEST_PASSWORD??process.env.SEED_ADMIN_PASSWORD})});assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Company-Id':String(companyId)};
 async function api(path:string,method='GET',payload?:unknown){const response=await fetch(base+path,{method,headers,...(payload?{body:JSON.stringify(payload)}:{})});assert.equal(response.status,method==='POST'?201:200,await response.clone().text());return(await response.json()).data;}
 const definitions=[
  {id:102,code:'PROV-001',name:'Materiales para Cubiertas del Pacífico',countryId:1,departmentId:2,municipalityId:2,districtId:2,address:'San Miguel, San Miguel Centro, El Salvador',email:'cotizaciones@cubiertas-pacifico.example.com',website:'https://cubiertas-pacifico.example.com',prefix:'MCP'},
  {id:103,code:'PROV-002',name:'Distribuidora de Techos del Norte',countryId:1,departmentId:46,municipalityId:47,districtId:260,address:'San Francisco Gotera, Morazán Sur, El Salvador',email:'cotizaciones@techos-norte.example.com',website:'https://techos-norte.example.com',prefix:'DTN'},
  {id:106,code:'PROV-003',name:'Impermeabilizantes de Oriente',countryId:1,departmentId:2,municipalityId:2,districtId:2,address:'San Miguel, San Miguel Centro, El Salvador',email:'cotizaciones@impermeabilizantes-oriente.example.com',website:'https://impermeabilizantes-oriente.example.com',prefix:'IOR'},
  {id:107,code:'PROV-004',name:'Perfiles y Láminas La Unión',countryId:1,departmentId:3,municipalityId:3,districtId:146,address:'Santa Rosa de Lima, La Unión Norte, El Salvador',email:'cotizaciones@laminas-launion.example.com',website:'https://laminas-launion.example.com',prefix:'PLU'},
 ];
 const suppliers=[];
 for(const d of definitions){const {id,prefix,...data}=d;const current=await db.supplier.findUniqueOrThrow({where:{id}});assert.equal(current.companyId,companyId);assert(!current.deletedAt&&current.isActive);suppliers.push(await api('/suppliers/'+id,'PATCH',data));
  const contact=await db.supplierContact.findFirst({where:{supplierId:id,isActive:true,deletedAt:null,isPrimary:true}});
  if(!contact)await api('/supplier-contacts','POST',{supplierId:id,fullName:'Departamento comercial',role:'General',isPrimary:true,email:data.email,notes:'Cotizaciones, disponibilidad y condiciones de entrega. Datos iniciales de referencia.'});
 }
 const products=await db.product.findMany({where:{companyId,isActive:true,deletedAt:null},orderBy:{id:'asc'}});assert.equal(products.length,5);
 for(const product of products){const supplierIds=[102,103,...(product.sku.includes('-MEM-')||product.sku.includes('-SEL-')?[106]:product.sku.includes('-LAM-')||product.sku.includes('-CUM-')?[107]:[])];
  for(const supplierId of supplierIds){if(await db.productSupplier.count({where:{productId:product.id,supplierId,deletedAt:null}}))continue;const preferred=product.sku.includes('-MEM-')||product.sku.includes('-SEL-')?106:product.sku.includes('-LAM-')||product.sku.includes('-CUM-')?107:102;
   const supplier=definitions.find(s=>s.id===supplierId)!;await api('/product-suppliers','POST',{productId:product.id,supplierId,supplierCode:supplier.prefix+'-'+product.originalCode,isPreferred:supplierId===preferred});
  }
 }
 const expenseDefinitions=[
  ['Flete y transporte','Traslado de mercadería desde el proveedor hasta el almacén receptor.'],
  ['Seguro de carga','Cobertura de la mercadería durante su transporte.'],
  ['Descarga y manipulación','Servicios de descarga y manejo de mercadería recibida.'],
  ['Almacenaje temporal','Servicio de almacenamiento temporal asociado a la recepción.'],
  ['Gestión aduanal','Servicios de tramitación aduanal de una compra importada.'],
  ['DAI de importación','Registro separado del derecho arancelario de importación.'],
  ['Inspección de mercadería','Servicio de revisión de la mercadería adquirida.'],
 ];
 for(const [name,description] of expenseDefinitions)if(!await db.expenseType.count({where:{companyId,name,isActive:true,deletedAt:null}}))await api('/expense-types','POST',{name,description});
 for(const expense of before.expenses.filter(e=>!e.deletedAt&&/demo/i.test(e.name)))await api('/trash/expense_types/'+expense.id,'DELETE');
 // Retire unused legacy catalogs rather than relabeling existing historical product references.
 for(const category of before.categories.filter(c=>!c.deletedAt&&/demo/i.test(c.name))){assert.equal(await db.product.count({where:{categoryId:category.id,isActive:true,deletedAt:null}}),0);for(const sub of category.subcategories.filter(s=>!s.deletedAt))await api('/trash/subcategories/'+sub.id,'DELETE');await api('/trash/categories/'+category.id,'DELETE');}
 for(const unit of before.units.filter(u=>!u.deletedAt&&/demo/i.test(u.name))){assert.equal(await db.product.count({where:{isActive:true,deletedAt:null,OR:[{purchaseUnitId:unit.id},{saleUnitId:unit.id}]}}),0);await api('/trash/units/'+unit.id,'DELETE');}
 await api('/warehouse-categories/75','PATCH',{name:'Materiales para techos',description:'Almacenaje de cubiertas, accesorios y materiales para sistemas de techado.'});
 for(const category of before.warehouseCategories.filter(c=>!c.deletedAt&&/demo/i.test(c.name)&&c.id!==75)){assert.equal(await db.warehouse.count({where:{categoryId:category.id,isActive:true,deletedAt:null,branch:{isActive:true,deletedAt:null}}}),0);await api('/trash/warehouse_categories/'+category.id,'DELETE');}
 await api('/locations/130','PATCH',{code:'GEN-01-01-01-01',aisle:'1',rack:'1',level:'1',position:'1',notes:'Zona de recepción y almacenamiento de cubiertas. Capacidad nominal: 10,000 unidades de una misma unidad de compra.'});
 await api('/locations/99','PATCH',{code:'GEN-02-01-01-01',aisle:'2',rack:'1',level:'1',position:'1',notes:'Zona de almacenamiento de accesorios y materiales para techado. Capacidad nominal: 10,000 unidades de una misma unidad de compra.'});
 await api('/branches/16','PATCH',{address:'San Miguel, San Miguel Centro, El Salvador'});
 await api('/warehouses/82','PATCH',{description:'Fabricación de ventilaciones y almacenaje de materiales para techos.'});
 const catalog=await api('/purchase-catalogs'),productCatalog=await api('/products/catalogs'),inventory=await api('/inventory/catalogs');
 assert.equal(catalog.products.length,5);assert.equal(catalog.suppliers.length,4);assert.equal(catalog.expenseTypes.length,7);assert.equal(catalog.generalWarehouse.id,39);
 for(const data of [catalog,productCatalog,inventory])assert(!/demo/i.test(JSON.stringify(data)),'Active operational catalog should not contain legacy labels');
 const operationCountsAfter:Record<string,number>={};for(const model of operations){const rows=await (db as any)[model].findMany({orderBy:{id:'asc'}});operationCountsAfter[model]=rows.length;for(const previous of operationBefore[model]){const current=rows.find((row:any)=>row.id===previous.id);assert(current,model+' existing record must remain');assert.equal(JSON.stringify(current),JSON.stringify(previous),model+' existing record changed');}}
 const links=await db.productSupplier.findMany({where:{product:{companyId,isActive:true,deletedAt:null},isActive:true,deletedAt:null}});assert.equal(links.length,14);
 for(const p of products){assert(links.filter(l=>l.productId===p.id).length>=2);assert.equal(links.filter(l=>l.productId===p.id&&l.isPreferred).length,1);}
 assert.equal(await db.location.count({where:{warehouseId:{in:[81,82]},capacity:1000,isActive:true,deletedAt:null}}),4);
 const result={status:'PASS',companyId,products:5,suppliers:suppliers.map(s=>({id:s.id,code:s.code,name:s.name})),supplierProductLinks:links.length,expenseTypes:7,generalWarehouseId:39,generalSpaces:['GEN-01-01-01-01','GEN-02-01-01-01'],branchSpaces:4,stock:operationCountsAfter.inventoryStock,operationsBefore:operationCountsBefore,operationsAfter:operationCountsAfter,procurementOperationsCreated:0,legacyCatalogsRetired:true,referenceContacts:'Reserved example.com addresses; no supplier identity or contact was externally verified',backup:directory};writeFileSync(resolve(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1}).finally(()=>db.$disconnect());
