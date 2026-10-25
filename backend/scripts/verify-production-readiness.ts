import 'dotenv/config';
import 'reflect-metadata';
import {existsSync,readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service';
import {validate} from '../src/config/env.validation';

const db=new PrismaService();
const reserved=/(?:@|\.)(?:example\.com|example\.org|example\.net|erp\.local|localhost|invalid|test)$/i;
async function main(){
 const issues:string[]=[],warnings:string[]=[];
 try{validate(process.env);}catch(error){issues.push(error instanceof Error?error.message:'Configuración inválida');}
 if(process.env.NODE_ENV!=='production')warnings.push('El entorno local permanece en desarrollo; el despliegue debe usar configuración de producción.');
 if(process.argv.includes('--require-production')&&process.env.NODE_ENV!=='production')issues.push('NODE_ENV debe ser production');
 const build={backend:existsSync(resolve('dist/src/main.js')),fonts:existsSync(resolve('dist/src/assets/pdf/LiberationSans-Regular.ttf'))&&existsSync(resolve('dist/src/assets/pdf/LiberationSans-Bold.ttf')),logo:existsSync(resolve('dist/src/assets/pdf/apex-roofing.jpg')),frontend:existsSync(resolve('../frontend/dist/index.html'))};
 if(Object.values(build).some(ready=>!ready))issues.push('Compile backend y frontend, incluidos los recursos del PDF.');
 const assetDirectory=resolve('../frontend/dist/assets');
 if(existsSync(assetDirectory)&&readdirSync(assetDirectory).filter(file=>file.endsWith('.js')).some(file=>readFileSync(resolve(assetDirectory,file),'utf8').includes('http://localhost:3000/api')))issues.push('El frontend compilado todavía apunta al servidor de desarrollo.');
 const expected=readdirSync(resolve('prisma/migrations'),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name);
 const applied=await db.$queryRaw<Array<{migration_name:string}>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
 const pending=expected.filter(name=>!applied.some(m=>m.migration_name===name));if(pending.length)issues.push('Existen migraciones pendientes.');
 const centers=await db.erpConfiguration.findMany({include:{company:true,generalWarehouse:{include:{branch:true}}}});
 if(!centers.length||centers.some(c=>!c.generalWarehouse||!c.generalWarehouse.isActive||c.generalWarehouse.deletedAt||!c.generalWarehouse.branch.isActive||c.generalWarehouse.branch.deletedAt))issues.push('El centro general debe estar configurado y activo.');
 const companyIds=centers.map(c=>c.companyId);
 const suppliers=await db.supplier.findMany({where:{companyId:{in:companyIds},isActive:true,deletedAt:null},select:{id:true,email:true,website:true}});
 const referenceSuppliers=suppliers.filter(s=>reserved.test(s.email??'')||/\.example\.(com|org|net)(?:\/|$)/i.test(s.website??''));
 if(referenceSuppliers.length)issues.push(`Sustituya los datos de referencia de ${referenceSuppliers.length} proveedores por sus datos comerciales reales.`);
 const referenceCompanies=centers.filter(c=>reserved.test(c.company.email??''));if(referenceCompanies.length)issues.push('Registre el correo comercial real de la empresa para los documentos a proveedores.');
 const result={status:issues.length?'PENDING':'READY',environment:process.env.NODE_ENV,build,migrations:{expected:expected.length,pending},generalCenters:centers.map(c=>({companyId:c.companyId,warehouseId:c.generalWarehouseId})),referenceSupplierIds:referenceSuppliers.map(s=>s.id),issues,warnings,databaseWrites:0};
 const directory=resolve('tmp/production-qa');mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'readiness.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(issues.length)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Verificación fallida');process.exitCode=1;}).finally(()=>db.$disconnect());
