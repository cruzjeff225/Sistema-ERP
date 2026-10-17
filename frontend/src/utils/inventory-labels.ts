import JsBarcode from 'jsbarcode';

export type LotLabel = { barcode: string; productName: string; sku: string; lotCode: string; receivedAt: string };

const receivedOn = (date: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeZone: 'America/El_Salvador' }).format(new Date(date));

/** Líneas de texto de la etiqueta (RN-INV-016): el código de barras es el código interno; lote y fecha van como texto. */
export const labelText = (label: LotLabel) => ({ product: label.productName, lot: `Lote ${label.lotCode}`, received: `Recepción ${receivedOn(label.receivedAt)}`, sku: label.sku });

/** CODE128 en un SVG; devuelve null cuando el código interno no se puede representar. */
export function barcodeSvg(code: string): SVGSVGElement | null {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try { JsBarcode(svg, code, { format: 'CODE128', width: 2, height: 54, displayValue: true, fontSize: 14, margin: 6 }); } catch { return null; }
  return svg;
}

/** Abre una ventana con `copies` etiquetas listas para imprimir. Devuelve un mensaje de error o null. */
export function printLotLabels(label: LotLabel, copies: number): string | null {
  const svg = barcodeSvg(label.barcode);
  if (!svg) return 'El código interno no se puede representar en CODE128. Revise el catálogo del producto.';
  const w = window.open('', '_blank', 'width=720,height=560');
  if (!w) return 'Permita la ventana de impresión en el navegador.';
  const text = labelText(label), doc = w.document;
  doc.title = `Etiquetas ${label.lotCode}`;
  const style = doc.createElement('style');
  style.textContent = '@page{margin:8mm}body{margin:0;font-family:system-ui,sans-serif}.label{box-sizing:border-box;width:80mm;border:1px dashed #999;padding:3mm;margin:2mm;display:inline-block;break-inside:avoid;text-align:center}.label h3{margin:0 0 1mm;font-size:11pt}.label p{margin:0;font-size:9pt}.label svg{max-width:100%;height:auto}';
  doc.head.append(style);
  for (let copy = 0; copy < copies; copy++) {
    const card = doc.createElement('div'); card.className = 'label';
    const title = doc.createElement('h3'); title.textContent = text.product;
    const lot = doc.createElement('p'); lot.textContent = `${text.lot} · ${text.received}`;
    const sku = doc.createElement('p'); sku.textContent = text.sku;
    card.append(title, doc.importNode(svg, true), lot, sku);
    doc.body.append(card);
  }
  doc.close(); w.focus(); w.print();
  return null;
}
