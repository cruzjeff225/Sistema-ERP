import PDFDocument from 'pdfkit';
import { join } from 'node:path';

export type RfqPdfDocument = {
  reference: string;
  issuedOn: string;
  company: { name: string; email?: string | null; phone?: string | null };
  supplier: { name: string; address?: string | null; email?: string | null; phone?: string | null };
  lines: { name: string; sku: string; quantity: string; unit: string }[];
};

const assets = join(__dirname, '../../../../assets/pdf');
const colors = { ink: '#102030', muted: '#657080', red: '#D1242A', line: '#E1E5EA', paper: '#F5F6F8' };
const clean = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Render only the selected supplier's RFQ. This document does not contain costs or other suppliers. */
export async function rfqPdf(input: RfqPdfDocument): Promise<Buffer> {
  if (!input.lines.length) throw new Error('La solicitud de cotización debe contener productos');
  const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true, pdfVersion: '1.7',
    info: { Title: `Solicitud de cotización ${input.reference}`, Author: input.company.name, Subject: `Solicitud de precios a ${input.supplier.name}`, Creator: 'ERP - Compras' } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve,reject) => { doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject); });
  void result.catch(()=>undefined);
  try {
    doc.registerFont('Regular',join(assets,'LiberationSans-Regular.ttf'));
    doc.registerFont('Bold',join(assets,'LiberationSans-Bold.ttf'));
    const width=doc.page.width-88,left=44,right=left+width,bottom=doc.page.height-88;
    const text=(value:string,x:number,y:number,w:number,size=10,bold=false,color=colors.ink,align:'left'|'right'='left') => {
      doc.font(bold?'Bold':'Regular').fontSize(size).fillColor(color).text(clean(value),x,y,{width:w,lineGap:3,align});
    };
    const height=(value:string,w:number,size=10,bold=false) => doc.font(bold?'Bold':'Regular').fontSize(size).heightOfString(clean(value),{width:w,lineGap:3});
    const rule=(y:number) => doc.strokeColor(colors.line).lineWidth(0.6).moveTo(left,y).lineTo(right,y).stroke();
    const companyContacts=[input.company.email,input.company.phone].filter(Boolean).join(' | ');
    let y=44;
    function header(continued=false) {
      if(!continued){
        if (/apex\s*roofing/i.test(input.company.name)) {
          // Clip the whitespace of the supplied logo while retaining its original artwork and colors.
          doc.save().rect(left,44,158,107).clip().image(join(assets,'apex-roofing.jpg'),26,0,{width:190}).restore();
        } else { let size=22;while(size>10&&height(input.company.name,190,size,true)>90)size--;text(input.company.name,left,52,190,size,true); }
        text('DEPARTAMENTO DE COMPRAS',left,155,208,8,true,colors.muted);
        if(companyContacts)text(companyContacts,left,171,208,8,false,colors.muted);
        text('SOLICITUD DE COTIZACIÓN',250,51,right-250,18,true);
        doc.fillColor(colors.red).roundedRect(250,98,right-250,27,6).fill();
        text(input.reference,261,105,right-273,11,true,'#FFFFFF');
        text(`Fecha: ${input.issuedOn}`,250,140,right-250,10,false,colors.muted);
        rule(199);y=218;
        const contactLines=[input.supplier.email,input.supplier.phone,input.supplier.address].filter((value):value is string=>Boolean(value));
        const cardWidth=width-32;
        const cardHeight=44+height(input.supplier.name,cardWidth,14,true)+contactLines.reduce((n,line)=>n+height(line,cardWidth,9)+4,0);
        doc.fillColor(colors.paper).roundedRect(left,y,width,cardHeight,10).fill();
        text('PARA',left+16,y+14,cardWidth,8,true,colors.muted);
        let cursor=y+31;
        text(input.supplier.name,left+16,cursor,cardWidth,14,true);cursor+=height(input.supplier.name,cardWidth,14,true)+7;
        for(const line of contactLines){text(line,left+16,cursor,cardWidth,9,false,colors.muted);cursor+=height(line,cardWidth,9)+4;}
        y+=cardHeight+27;
      } else {
        text(input.company.name,left,44,width-175,14,true);
        text(input.reference,right-164,48,164,10,true,colors.red,'right');
        text(`Proveedor: ${input.supplier.name}`,left,73,width,10,false,colors.muted);
        y=73+height(`Proveedor: ${input.supplier.name}`,width,10)+18;rule(y);y+=21;
      }
    }
    function tableHeader() {
      text('Productos a cotizar',left,y,width-100,12,true);
      text(`${input.lines.length} productos`,right-100,y+2,100,9,false,colors.muted,'right');y+=26;
      doc.fillColor(colors.paper).rect(left,y,width,34).fill();
      text('#',left+10,y+11,18,9,true,colors.muted);
      text('Producto / código',left+34,y+11,260,9,true,colors.muted);
      text('Cantidad',left+299,y+11,91,9,true,colors.muted,'right');
      text('Unidad de compra',left+406,y+11,width-416,9,true,colors.muted);y+=34;
    }
    const quantityFormat=new Intl.NumberFormat('es-SV',{maximumFractionDigits:2});
    const terms=[
      'Precio unitario, presentación y moneda de la oferta.',
      'Descuentos, impuestos y gastos de transporte u otros cargos.',
      'Cantidad disponible, compra mínima y plazo de entrega.',
      'Condiciones de pago y vigencia de los precios.',
    ];
    const termsHeight=38+terms.reduce((n,line)=>n+height(line,width-18,9)+5,0);
    header();tableHeader();
    const rowHeightOf=(line:RfqPdfDocument['lines'][number])=>Math.max(43,17+height(line.name,251,10,true)+height(line.sku,251,8)+5,height(line.unit,width-424,9)+24);
    input.lines.forEach((line,index)=>{
      const number=Number(line.quantity);
      if(!Number.isFinite(number)||number<=0||number>9999999999.99)throw new Error('Cantidad a cotizar no válida');
      const rowHeight=rowHeightOf(line);
      if(rowHeight>bottom-220)throw new Error('La descripción del producto supera el espacio de una página');
      const reserve=index===input.lines.length-1?termsHeight+27:index===input.lines.length-2?termsHeight+27+rowHeightOf(input.lines[index+1]):0;
      if(y+rowHeight+reserve>bottom){doc.addPage();header(true);tableHeader();}
      text(String(index+1),left+10,y+13,18,9,false,colors.muted);
      text(line.name,left+34,y+12,251,10,true);
      text(line.sku,left+34,y+16+height(line.name,251,10,true),251,8,false,colors.muted);
      text(quantityFormat.format(number),left+294,y+13,96,10,true,colors.ink,'right');
      text(line.unit,left+406,y+13,width-424,9,false,colors.muted);
      y+=rowHeight;rule(y);
    });
    y+=25;
    text('Información que debe incluir su oferta',left,y,width,10,true);y+=23;
    for(const line of terms){doc.fillColor(colors.red).circle(left+3,y+5,1.5).fill();text(line,left+14,y,width-18,9,false,colors.muted);y+=height(line,width-18,9)+5;}
    const range=doc.bufferedPageRange();
    for(let page=0;page<range.count;page++){
      doc.switchToPage(page);const footerY=doc.page.height-52;rule(footerY-12);
      const savedBottomMargin=doc.page.margins.bottom;
      doc.page.margins.bottom=0;
      doc.font('Regular').fontSize(8).fillColor(colors.muted)
        .text('Solicitud de precios. La compra se formaliza con una orden aprobada.',left,footerY,{width:width-100,lineBreak:false});
      doc.text(`Página ${page+1} de ${range.count}`,right-90,footerY,{width:90,align:'right',lineBreak:false});
      doc.page.margins.bottom=savedBottomMargin;
    }
    doc.end();return await result;
  } catch(error) { doc.destroy();throw error; }
}
