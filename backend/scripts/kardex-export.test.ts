import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { kardexPdf, kardexWorkbook, periodText, type ExportBook, type ExportReport, type ExportRow } from '../src/modules/inventory/kardex-export';

async function extract(bytes: Buffer) {
  const pdfjs = await (new Function('return import("pdfjs-dist/legacy/build/pdf.mjs")'))();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }); const pdf = await task.promise;
  const pages: string[] = [];
  for (let page = 1; page <= pdf.numPages; page++) { const content = await (await pdf.getPage(page)).getTextContent(); pages.push(content.items.map((item: any) => item.str ?? '').join(' ')); }
  await task.destroy(); return pages;
}

const row = (sequence: number, over: Partial<ExportRow> = {}): ExportRow => ({
  sequence, movementDate: '2026-10-03T21:00:00Z', movementType: 'RECEIPT', referenceType: 'purchase_detail', referenceId: sequence, reason: 'Recepción',
  quantityIn: 10, quantityOut: 0, unitCost: 12.5, runningQuantity: sequence * 10, runningValue: sequence * 125, runningAverage: 12.5, entryCost: 125, exitCost: null, costAdjustment: false,
  supportDocument: { supplierInvoiceNumber: 'CCF-0045', supplierInvoiceDate: '2026-10-02T12:00:00Z', receipt: 'RC-00007', process: { requests: [{ code: 'PR-00059' }], quotation: { code: 'COT-00030' }, order: { code: 'OC-00022' }, receipt: { code: 'RC-00007' }, retaceos: [{ code: 'RT-00009' }] } },
  supplier: { name: 'Cubiertas Regionales GT', code: 'DEMO-GT', country: 'Guatemala' }, lot: { lotCode: 'LT-000021' }, location: { code: 'DEMO-METAL-01', warehouse: { name: 'Bodega de cubiertas' } }, user: { username: 'admin' }, ...over,
});
const book = (sku: string, items: ExportRow[], name = `Producto ${sku}`): ExportBook => ({
  product: { sku, internalCode: `IC-${sku}`, name, presentation: 'Tramo de 3 m', description: 'Producto de prueba', purchaseUnit: { name: 'Pieza' }, category: { name: 'Techos' }, subcategory: { name: 'Cubiertas' } },
  opening: 0, openingValue: 0, closing: items.length * 10, closingValue: items.length * 125, closingAverage: 12.5,
  totals: { quantityIn: items.length * 10, quantityOut: 0, entryCost: items.length * 125, exitCost: 0 }, items,
});
const report = (books: ExportBook[], over: Partial<ExportReport> = {}): ExportReport => ({
  header: { company: { name: 'Comercial Demo El Salvador, S.A. de C.V.', commercialName: 'Atlas Roofing', nit: '0614-010190-101-2', nrc: '123456-7' }, period: { from: null, to: null }, generatedAt: '2026-10-24T15:00:00Z' },
  scope: 'Consolidado de la empresa; los traslados entre almacenes no se cuentan como entradas ni salidas.', truncated: false, books, ...over,
});

test('el período se escribe como lo lee un contador', () => {
  assert.equal(periodText({ from: null, to: null }), 'Todo el historial');
  assert.equal(periodText({ from: '2026-01-01', to: '2026-12-31' }), 'Del 01/01/2026 al 31/12/2026');
  assert.equal(periodText({ from: '2026-10-01', to: null }), 'Desde el 01/10/2026');
});

test('el Excel trae un resumen y una hoja por producto con el encabezado legal y el respaldo de cada operación', async () => {
  const bytes = await kardexWorkbook(report([book('CAN-01', [row(1), row(2, { movementType: 'ADJUSTMENT', referenceType: 'adjustment', reason: 'Conteo', supportDocument: null, supplier: null, quantityIn: 0, quantityOut: 3, entryCost: null, exitCost: 37.5, runningQuantity: 17, runningValue: 212.5 })]), book('CAN/02', [row(1)], 'Cumbrera')]));
  assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'un .xlsx es un zip');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as any);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumen', 'CAN-01', 'CAN-02'], 'los caracteres no válidos del nombre se sustituyen');
  const text = (sheet: ExcelJS.Worksheet) => { const out: string[] = []; sheet.eachRow(r => r.eachCell(cell => out.push(String(cell.text)))); return out.join(' | '); };
  const summary = text(workbook.getWorksheet('Resumen')!);
  assert.match(summary, /Registro de control de inventarios/); assert.match(summary, /0614-010190-101-2/); assert.match(summary, /123456-7/); assert.match(summary, /Todo el historial/); assert.match(summary, /Totales/);
  const sheet = workbook.getWorksheet('CAN-01')!, content = text(sheet);
  for (const expected of ['Comercial Demo El Salvador', '0614-010190-101-2', 'Tramo de 3 m', 'Solicitud PR-00059 → Cotización COT-00030 → Orden OC-00022 → Recepción RC-00007 → Retaceo RT-00009', 'Doc. proveedor CCF-0045', 'Cubiertas Regionales GT', 'Guatemala', 'Ajuste de inventario · Conteo', 'Saldo inicial del período', 'Totales del período'])
    assert(content.includes(expected), `falta «${expected}»`);
  const headerRow = sheet.getRow(9).values as any[];
  assert.equal(headerRow[1], 'N.°'); assert.equal(headerRow[12], 'Saldo ($)');
  const first = sheet.getRow(11);
  assert.equal(first.getCell(1).value, 1); assert.equal(first.getCell(7).value, 10); assert.equal(first.getCell(10).value, 125); assert.equal(first.getCell(12).value, 125); assert.equal(first.getCell(13).value, 12.5);
  const adjust = sheet.getRow(12);
  assert.equal(adjust.getCell(8).value, 3); assert.equal(adjust.getCell(11).value, 37.5); assert.equal(adjust.getCell(10).value, null);
  assert.equal(sheet.getRow(11).getCell(2).text, '03/10/2026 15:00', 'la fecha se muestra en hora de El Salvador');
});

test('el PDF abre con el resumen y cada producto empieza en su propia página, con encabezado legal y numeración', async () => {
  const pages = await extract(await kardexPdf(report([book('CAN-01', [row(1), row(2)]), book('CUM-02', [row(1)], 'Cumbrera')])));
  assert.equal(pages.length, 3);
  assert.match(pages[0]!, /Resumen por producto/); assert.match(pages[0]!, /CAN-01/); assert.match(pages[0]!, /CUM-02/); assert.match(pages[0]!, /Totales/);
  assert.match(pages[1]!, /REGISTRO DE CONTROL DE INVENTARIOS/); assert.match(pages[1]!, /0614-010190-101-2/); assert.match(pages[1]!, /123456-7/); assert.match(pages[1]!, /Producto CAN-01/);
  assert.match(pages[1]!, /Solicitud PR-00059/); assert.match(pages[1]!, /Doc\. proveedor CCF-0045/); assert.match(pages[1]!, /Cubiertas Regionales GT \(Guatemala\)/); assert.match(pages[1]!, /Saldo inicial del período/);
  assert(!pages[1]!.includes('Cumbrera') && pages[2]!.includes('Cumbrera'), 'un producto no se mezcla con el siguiente');
  pages.forEach((page, index) => assert(page.includes(`Página ${index + 1} de 3`)));
});

test('un producto con muchas operaciones continúa en varias páginas y repite el encabezado de la tabla', async () => {
  const items = Array.from({ length: 90 }, (_, index) => row(index + 1));
  const pages = await extract(await kardexPdf(report([book('LARGO-1', items)])));
  assert(pages.length > 3, `se esperaban varias páginas y hubo ${pages.length}`);
  assert.doesNotMatch(pages[0]!, /Resumen por producto/, 'con un solo producto no hace falta el resumen');
  for (const page of pages) { assert.match(page, /Documento de respaldo y proveedor/); assert.match(page, /Producto LARGO-1/); }
  const sequences = new Set<number>(); for (const page of pages) for (const match of page.matchAll(/ (\d{1,2}) \d{2}\/\d{2}\/2026/g)) sequences.add(Number(match[1]));
  for (let sequence = 1; sequence <= 90; sequence++) assert(sequences.has(sequence), `falta la operación ${sequence}`);
});

test('sin productos se genera igual un documento que lo dice', async () => {
  const empty = report([]);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load((await kardexWorkbook(empty)) as any);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumen']);
  const pages = await extract(await kardexPdf(empty));
  assert.equal(pages.length, 1); assert.match(pages[0]!, /No hay productos con movimientos o saldo/);
});

test('cuando se recorta la lista de productos, el documento lo avisa', async () => {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load((await kardexWorkbook(report([book('A-1', [row(1)])], { truncated: true }))) as any);
  const out: string[] = []; workbook.getWorksheet('Resumen')!.eachRow(r => r.eachCell(cell => out.push(cell.text)));
  assert(out.some(value => /primeros productos/.test(value)));
  assert.match((await extract(await kardexPdf(report([book('A-1', [row(1)])], { truncated: true }))))[0]!, /primeros productos/);
});
