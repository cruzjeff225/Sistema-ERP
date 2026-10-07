import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service';

// Explicit database maintenance requested by the user. Keep every catalog and organizational setting.
const db=new PrismaService();
const operations=['inventoryMovement','inventoryStock','transferItem','transfer','purchaseExpenseAllocation','retaceoDetail','retaceo','purchaseActualExpense','purchaseItem','purchase','purchaseOrderExpenseDocument','purchaseOrderExpense','purchaseOrderDetail','purchaseOrder','purchaseQuotationRequestDetail','purchaseQuotationRequest','purchaseQuotationExpense','purchaseQuotationDetail','purchaseQuotation','purchaseRfqLine','purchaseRfq','purchaseConsolidationSource','purchaseConsolidationLine','purchaseConsolidation','purchaseRequestDetail','purchaseRequest'] as const;
const catalogs=['product','productImage','productSupplier','productCategory','productSubcategory','productUnit','supplier','supplierContact','expenseType','company','branch','warehouse','warehouseCategory','location','erpConfiguration','customer','sale','saleItem','quotation','quotationItem','user','userRole','userCompany','role','rolePermission','permission','module'] as const;
const entities=['purchase_expense_documents','purchase_expenses','retaceos','purchases','purchase_orders','purchase_quotations','rfqs','purchase_processes','purchase_requests','transfers'];
const controllers=['purchase_requests','purchase_quotations','purchase_orders','purchase_consolidations','purchase_rfqs','purchases','retaceos','inventory','transfers','purchase_expenses','purchase_expense_documents','purchase_order_expense_documents'];
const sequences=['purchase_request_code_seq','purchase_quotation_code_seq','purchase_order_code_seq','purchase_receipt_code_seq','retaceo_code_seq'];
const hash=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
async function snapshot(client:any,names:readonly string[]){const data:Record<string,any[]>={};for(const name of names)data[name]=await client[name].findMany({orderBy:{id:'asc'}});return data;}
async function main(){
 const url=new URL(process.env.DATABASE_URL!);const database=decodeURIComponent(url.pathname.slice(1));
 const before=await snapshot(db,operations);const counts=Object.fromEntries(operations.map(name=>[name,before[name].length]));
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'inspect',database,counts,keepCatalogs:true}));
 if(!process.argv.includes('--apply'))return;
 assert(process.argv.includes('--database='+database),'Explicit database name must match');assert(process.argv.includes('--keep-catalogs'),'Catalog preservation must be explicit');
 const directory=resolve('tmp/purchase-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-reset');mkdirSync(directory,{recursive:true});
 const backup=resolve(directory,'database-before.dump');
 const pgEnv={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:database,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};
 const dump=spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',['--format=custom','--no-owner','--no-acl','--file',backup],{env:pgEnv,windowsHide:true,encoding:'utf8',timeout:120000});
 assert.equal(dump.status,0,'Database backup failed');assert(statSync(backup).size>0,'Empty database backup');
 const dumpHash=createHash('sha256').update(readFileSync(backup)).digest('hex');
 const toc=spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',['--list',backup],{windowsHide:true,encoding:'utf8',timeout:20000});assert.equal(toc.status,0,'Backup archive cannot be read');writeFileSync(resolve(directory,'backup-index.txt'),toc.stdout);
 const result=await db.$transaction(async tx=>{
  const companies=await tx.company.findMany({select:{id:true},orderBy:{id:'asc'}});for(const company of companies)await tx.$queryRaw`SELECT pg_advisory_xact_lock(68431, ${company.id}::integer)::text`;
  const kept=await snapshot(tx,catalogs), removed=await snapshot(tx,operations);
  const trash=await tx.trashEntry.findMany({where:{entity:{in:entities}},orderBy:{id:'asc'}});
  const logs=await tx.log.findMany({where:{controller:{in:controllers}},orderBy:{id:'asc'}});
  const savedLogHash=hash(await tx.log.findMany({where:{controller:{notIn:controllers}},orderBy:{id:'asc'}}));
  const savedTrashHash=hash(await tx.trashEntry.findMany({where:{entity:{notIn:entities}},orderBy:{id:'asc'}}));
  writeFileSync(resolve(directory,'operations-before.json'),JSON.stringify({createdAt:new Date().toISOString(),database,operations:removed,trash,logs,backupHash:dumpHash,catalogHash:hash(kept)},null,2));
  const deleted:Record<string,number>={};deleted.trash=(await tx.trashEntry.deleteMany({where:{entity:{in:entities}}})).count;deleted.logs=(await tx.log.deleteMany({where:{controller:{in:controllers}}})).count;
  // Child records are deleted first. No CASCADE/TRUNCATE can remove unrelated catalogs.
  for(const name of operations)deleted[name]=(await (tx as any)[name].deleteMany()).count;
  const after=await snapshot(tx,operations);for(const name of operations)assert.equal(after[name].length,0,name+' must be empty');
  assert.equal(hash(await snapshot(tx,catalogs)),hash(kept),'A preserved catalog changed');
  assert.equal(hash(await tx.log.findMany({where:{controller:{notIn:controllers}},orderBy:{id:'asc'}})),savedLogHash,'Unrelated audit data changed');
  assert.equal(hash(await tx.trashEntry.findMany({where:{entity:{notIn:entities}},orderBy:{id:'asc'}})),savedTrashHash,'Unrelated trash changed');
  // Restart document codes transactionally; internal identifiers remain monotonic.
  for(const sequence of sequences)await tx.$executeRawUnsafe('ALTER SEQUENCE "'+sequence+'" RESTART WITH 1');
  const actor=await tx.user.findFirstOrThrow({where:{isActive:true,deletedAt:null,userRoles:{some:{role:{name:'superadmin',isActive:true,deletedAt:null}}}}});
  await tx.log.create({data:{controller:'database_maintenance',action:'RESET_PURCHASE_INVENTORY',recordId:0,userId:actor.id,originalData:{counts:Object.fromEntries(operations.map(name=>[name,removed[name].length]))},modifiedData:{backup,backupHash:dumpHash,preservedCatalogHash:hash(kept),scope:'all purchase and inventory operations; catalogs retained'}}});
  return {status:'PASS',database,deleted,remaining:Object.fromEntries(operations.map(name=>[name,after[name].length])),catalogs:Object.fromEntries(catalogs.map(name=>[name,kept[name].length])),catalogHash:hash(kept),backup,backupHash:dumpHash,documentCodesRestarted:true};
 },{timeout:120000,maxWait:20000});
 writeFileSync(resolve(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1}).finally(()=>db.$disconnect());
