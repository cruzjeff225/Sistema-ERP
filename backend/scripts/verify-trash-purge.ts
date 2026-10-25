import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service';
import {AuditService} from '../src/modules/audit/application/services/audit.service';
import {TrashService} from '../src/modules/trash/trash.service';

const db=new PrismaService(),rollback=new Error('PURGE_QA_ROLLBACK'),key='QA-PURGE-'+randomUUID();
async function main(){let passed=false;try{await db.$transaction(async tx=>{
 const scoped=new Proxy(tx,{get(target,property){if(property==='$transaction')return(work:any)=>work(tx);const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}}) as unknown as PrismaService;
 const service=new TrashService(scoped,new AuditService(scoped));
 const config=await tx.erpConfiguration.findFirstOrThrow();const actor=await tx.user.findFirstOrThrow({where:{isActive:true,deletedAt:null,userRoles:{some:{role:{name:'superadmin'}}}}});
 const free=await tx.productCategory.create({data:{name:key+' free'}}),linked=await tx.productCategory.create({data:{name:key+' linked'}});
 await tx.productSubcategory.create({data:{name:key,categoryId:linked.id}});
 const a=await service.trash('categories',free.id,actor.id,config.companyId),b=await service.trash('categories',linked.id,actor.id,config.companyId);
 await assert.rejects(service.purge([a.id],config.companyId+99999,actor.id,true),(error:any)=>error.getStatus()===404);
 assert.equal((await tx.trashEntry.findUniqueOrThrow({where:{id:a.id}})).purgedAt,null);
 const result=await service.purge([a.id,b.id],config.companyId,actor.id,true);assert.deepEqual(result,{processed:2,removed:1,retained:1});
 assert.equal(await tx.productCategory.findUnique({where:{id:free.id}}),null);assert((await tx.productCategory.findUniqueOrThrow({where:{id:linked.id}})).deletedAt);
 assert.equal(await tx.productSubcategory.count({where:{categoryId:linked.id}}),1);
 for(const id of [a.id,b.id])await assert.rejects(service.restore(id,config.companyId,actor.id),(error:any)=>error.getStatus()===409);
 assert.deepEqual(await service.purge([a.id,b.id],config.companyId,actor.id,true),{processed:0,removed:0,retained:0});
 assert.equal(await tx.log.count({where:{controller:'categories',action:'PURGE',recordId:{in:[free.id,linked.id]}}}),2);
 const restored=await tx.productCategory.create({data:{name:key+' restored'}});const c=await service.trash('categories',restored.id,actor.id,config.companyId);await service.restore(c.id,config.companyId,actor.id);
 await assert.rejects(service.purge([c.id],config.companyId,actor.id,true),(error:any)=>error.getStatus()===409);assert.equal((await tx.productCategory.findUniqueOrThrow({where:{id:restored.id}})).deletedAt,null);
 passed=true;throw rollback;
 },{timeout:60000});}catch(error){if(error!==rollback)throw error;}assert(passed);assert.equal(await db.productCategory.count({where:{name:{startsWith:key}}}),0);console.log('PASS eliminación física sin referencias; historial conservado; recuperación bloqueada; aislamiento por empresa; reintentos sin duplicación; registros restaurados protegidos; auditoría; QA revertido');}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
