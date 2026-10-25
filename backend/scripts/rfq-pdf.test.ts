import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupplyWorkflowController } from '../src/modules/purchases/presentation/supply-workflow.controller';
import { rfqPdf, type RfqPdfDocument } from '../src/modules/purchases/application/services/rfq-pdf';

async function extract(bytes:Buffer){
  // Keep native ESM for PDF.js even when the backend compiles to CommonJS.
  const pdfjs=await (new Function('return import("pdfjs-dist/legacy/build/pdf.mjs")'))();
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:false});const pdf=await task.promise;
  const pages=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();pages.push({text:content.items.map((item:any)=>item.str??'').join(' '),items:content.items,width:page.view[2],height:page.view[3]});}
  await task.destroy();return pages;
}

test('RFQ PDF uses Salvadoran issue date, corporate logo, accents and only the supplier products', async () => {
  const document = {code:'SC-QA',createdAt:new Date('2026-10-05T01:00:00Z'),supplier:{name:'Proveedor Pacífico'},consolidation:{code:'CON-QA',company:{commercialName:'Apex Roofing'}},lines:[{quantity:600,line:{product:{name:'Teja asfáltica',sku:'QA-TEJA'},unit:{name:'Unidad'}}}]};
  let bytes: Buffer | undefined;const headers:Record<string,string>={};
  const controller=new SupplyWorkflowController({rfqDocument:async(id:number,companyId:number)=>{assert.equal(id,43);assert.equal(companyId,3);return document;}} as any,{resolve:async()=>3} as any);
  await controller.pdf(43,{sub:1} as any,{setHeader:(k:string,v:string)=>{headers[k]=v;},send:(value:Buffer)=>{bytes=value;}} as any,'3');
  assert(bytes);assert(bytes.subarray(0,8).toString().startsWith('%PDF-'));const pages=await extract(bytes);assert.equal(pages.length,1);
  assert.match(pages[0].text,/Fecha: 2026-10-04/);assert(!pages[0].text.includes('2026-10-05'));assert.match(pages[0].text,/Pacífico/);assert.match(pages[0].text,/Teja asfáltica/);assert.match(pages[0].text,/QA-TEJA/);assert.match(pages[0].text,/600/);assert(!pages[0].text.includes('QA-LAMINA'));assert.match(pages[0].text,/Página 1 de 1/);
  assert(bytes.includes(Buffer.from('/Subtype /Image')));assert.equal(headers['Content-Type'],'application/pdf');assert.equal(headers['Cache-Control'],'private, no-store');
});

test('RFQ multipage table keeps every code and quantity, repeats headers and has no empty/footer-only pages',async()=>{
 const input:RfqPdfDocument={reference:'SC-LARGO',issuedOn:'2026-10-06',company:{name:'Apex Roofing'},supplier:{name:'Proveedor de láminas y tejas'},lines:Array.from({length:45},(_,n)=>({name:'Lámina galvanizada con recubrimiento anticorrosivo y acabado gris para cubierta '+(n+1),sku:'TECHO-'+String(n+1).padStart(3,'0')+'-CÓDIGO-PRESENTACIÓN',quantity:n===44?'9999999999.99':'1250.50',unit:'Paquete de 21 piezas'}))};
 const pages=await extract(await rfqPdf(input));assert(pages.length>1&&pages.length<10);
 for(const [n,page] of pages.entries()){
  assert.match(page.text,/Producto \/ código/);assert(page.text.includes(`Página ${n+1} de ${pages.length}`));assert.match(page.text,/TECHO-\d{3}-CÓDIGO-PRESENTACIÓN/);
  for(const item of page.items){if(!item.str)continue;const x=item.transform[4],y=item.transform[5];assert(x>=43&&x+item.width<=page.width-42+0.5,'Text must stay within printable horizontal margins');assert(y>=35&&y<=page.height-30,'Text must stay inside its page');}
 }
 const all=pages.map(page=>page.text).join(' ');for(let n=1;n<=45;n++)assert(all.includes('TECHO-'+String(n).padStart(3,'0')+'-CÓDIGO-PRESENTACIÓN'));assert.match(all,/9,999,999,999\.99/);assert.match(all,/Información que debe incluir su oferta/);
});

test('empty or non-positive RFQ quantities cannot produce a supplier document',async()=>{
 const input:RfqPdfDocument={reference:'SC-INVALIDA',issuedOn:'2026-10-06',company:{name:'Apex Roofing'},supplier:{name:'Proveedor'},lines:[]};await assert.rejects(rfqPdf(input));
 for(const quantity of ['0','-1','NaN'])await assert.rejects(rfqPdf({...input,lines:[{name:'Teja',sku:'TEJA',quantity,unit:'Pieza'}]}));
});
