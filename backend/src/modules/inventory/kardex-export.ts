import { join } from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * Exportación del registro de control de inventarios (Código Tributario, art. 142-A): una sección por producto, con el
 * encabezado del contribuyente, el correlativo, el documento que respalda cada operación y las unidades y costos de
 * entradas, salidas y saldo. Recibe los datos ya calculados; no consulta la base de datos.
 */
type Num = { toString(): string } | number | string;
type Day = Date | string;

export type ExportRow = {
  sequence: number; movementDate: Day; movementType: string; referenceType: string; referenceId: number | null; reason: string;
  quantityIn: Num; quantityOut: Num; unitCost: Num; runningQuantity: Num; runningValue: Num; runningAverage: Num;
  entryCost: Num | null; exitCost: Num | null; costAdjustment: boolean;
  supportDocument: { supplierInvoiceNumber: string | null; supplierInvoiceDate: Day | null; receipt: string;
    process: { requests: { code: string }[]; quotation: { code: string } | null; order: { code: string } | null; receipt: { code: string }; retaceos: { code: string }[] } | null } | null;
  supplier: { name: string; code: string; country: string } | null;
  lot: { lotCode: string } | null;
  location: { code: string; warehouse: { name: string } } | null;
  user: { username: string } | null;
};
export type ExportBook = {
  product: { sku: string; internalCode: string; name: string; presentation: string | null; description: string | null; purchaseUnit: { name: string }; category: { name: string }; subcategory: { name: string } };
  opening: Num; openingValue: Num; closing: Num; closingValue: Num; closingAverage: Num;
  totals: { quantityIn: Num; quantityOut: Num; entryCost: Num; exitCost: Num };
  items: ExportRow[];
};
export type ExportReport = {
  header: { company: { name: string; commercialName: string; nit: string; nrc: string }; period: { from: string | null; to: string | null }; generatedAt: string };
  scope: string; truncated: boolean; books: ExportBook[];
};

const TITLE = 'Registro de control de inventarios';
const LAW = 'Art. 142-A del Código Tributario';
const zone = 'America/El_Salvador';
const labels: Record<string, string> = { OPENING: 'Saldo inicial', RECEIPT: 'Recepción', REVERSAL: 'Reversión', ADJUSTMENT: 'Ajuste', TRANSFER_OUT: 'Despacho a sucursal', TRANSFER_IN: 'Recepción de traslado', SALE: 'Venta', RETURN: 'Devolución' };
const n = (value: Num | null | undefined) => value === null || value === undefined ? 0 : Number(value.toString());
const clean = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

const when = (value: Day) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
};
const dayOnly = (value: Day) => when(value).slice(0, 10);
const isoDay = (value: string) => { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; };
export const periodText = (period: { from: string | null; to: string | null }) =>
  period.from && period.to ? `Del ${isoDay(period.from)} al ${isoDay(period.to)}` : period.from ? `Desde el ${isoDay(period.from)}` : period.to ? `Hasta el ${isoDay(period.to)}` : 'Todo el historial';

const operation = (row: ExportRow) => row.costAdjustment ? 'Ajuste de costo' : (labels[row.movementType] ?? row.movementType);
const placement = (row: ExportRow) => [row.lot?.lotCode ?? 'Sin lote (histórico)', row.location ? `${row.location.warehouse.name} · ${row.location.code}` : '', row.user?.username ?? 'Apertura del sistema'].filter(Boolean).join(' · ');

/** Cadena de documentos del proceso de compra, de la solicitud a la recepción y el retaceo. */
const chain = (process: NonNullable<ExportRow['supportDocument']>['process'], receipt: string) => {
  if (!process) return `Recepción ${receipt}`;
  const requests = process.requests.map(request => request.code);
  return [requests.length ? `${requests.length === 1 ? 'Solicitud' : 'Solicitudes'} ${requests.join(', ')}` : '', process.quotation ? `Cotización ${process.quotation.code}` : '', process.order ? `Orden ${process.order.code}` : '',
    `Recepción ${process.receipt.code}`, process.retaceos.length ? `Retaceo ${process.retaceos.map(retaceo => retaceo.code).join(', ')}` : ''].filter(Boolean).join(' → ');
};
const supplierDocument = (doc: NonNullable<ExportRow['supportDocument']>) => doc.supplierInvoiceNumber ? `Doc. proveedor ${doc.supplierInvoiceNumber}${doc.supplierInvoiceDate ? ' · ' + dayOnly(doc.supplierInvoiceDate) : ''}` : 'Doc. proveedor: no registrado';
const origin = (row: ExportRow) => {
  switch (row.referenceType) {
    case 'opening': return 'Saldo inicial del inventario';
    case 'adjustment': return row.reason ? `Ajuste de inventario · ${row.reason}` : 'Ajuste de inventario';
    case 'retaceo': return 'Costo final por retaceo';
    case 'sale': return `Venta ${row.referenceId ?? ''}`.trim();
    default: return row.reason || row.referenceType;
  }
};
/** Texto del documento de respaldo: la cadena del proceso y el documento del proveedor; sin compra, el documento de origen. */
const documentText = (row: ExportRow) => row.supportDocument ? `${chain(row.supportDocument.process, row.supportDocument.receipt)}\n${supplierDocument(row.supportDocument)}` : origin(row);
const supplierText = (row: ExportRow) => row.supplier ? `${row.supplier.name}\n${row.supplier.code} · ${row.supplier.country}` : '';
const productTitle = (book: ExportBook) => [book.product.name, book.product.presentation].filter(Boolean).join(' · ');

// ------------------------------------------------------------------------------------------------ Excel

const usedNames = new Set<string>();
function sheetName(sku: string) {
  const base = clean(sku).replace(/[\\/?*[\]:]/g, '-').slice(0, 28) || 'Producto';
  let name = base, index = 2;
  while (usedNames.has(name.toLowerCase())) name = `${base.slice(0, 26)}-${index++}`;
  usedNames.add(name.toLowerCase());
  return name;
}

const money = '"$"#,##0.00', unit = '"$"#,##0.0000', units = '#,##0.##';

export async function kardexWorkbook(report: ExportReport): Promise<Buffer> {
  usedNames.clear();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.header.company.name; workbook.created = new Date(report.header.generatedAt); workbook.title = TITLE;
  const head = (sheet: ExcelJS.Worksheet, subtitle: string) => {
    sheet.addRow([`${TITLE} · ${LAW}`]).font = { bold: true, size: 13 };
    sheet.addRow(['Contribuyente', report.header.company.name]);
    sheet.addRow(['NIT', report.header.company.nit, 'NRC', report.header.company.nrc]);
    sheet.addRow(['Período', periodText(report.header.period)]);
    sheet.addRow(['Alcance', report.scope]);
    if (subtitle) sheet.addRow(['Producto', subtitle]);
    sheet.eachRow(row => { row.getCell(1).font = { bold: true, size: row.number === 1 ? 13 : 10 }; });
  };
  const styleHeader = (row: ExcelJS.Row) => { row.font = { bold: true }; row.alignment = { vertical: 'middle', wrapText: true }; row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } }; cell.border = { bottom: { style: 'thin' } }; }); };

  // Resumen por producto
  const summary = workbook.addWorksheet('Resumen');
  usedNames.add('resumen');
  head(summary, '');
  if (report.truncated) summary.addRow(['Aviso', 'Se incluyen solo los primeros productos; filtre para ver el resto.']);
  summary.addRow([]);
  const header = summary.addRow(['Código', 'Producto', 'Unidad', 'Saldo inicial (u.)', 'Saldo inicial ($)', 'Entradas (u.)', 'Entradas ($)', 'Salidas (u.)', 'Salidas ($)', 'Saldo final (u.)', 'Saldo final ($)', 'Costo promedio']);
  styleHeader(header);
  for (const book of report.books) {
    const row = summary.addRow([book.product.sku, productTitle(book), book.product.purchaseUnit.name, n(book.opening), n(book.openingValue), n(book.totals.quantityIn), n(book.totals.entryCost), n(book.totals.quantityOut), n(book.totals.exitCost), n(book.closing), n(book.closingValue), n(book.closingAverage)]);
    [4, 6, 8, 10].forEach(column => { row.getCell(column).numFmt = units; }); [5, 7, 9, 11].forEach(column => { row.getCell(column).numFmt = money; }); row.getCell(12).numFmt = unit;
  }
  const total = summary.addRow(['', 'Totales', '', '', report.books.reduce((sum, b) => sum + n(b.openingValue), 0), '', report.books.reduce((sum, b) => sum + n(b.totals.entryCost), 0), '', report.books.reduce((sum, b) => sum + n(b.totals.exitCost), 0), '', report.books.reduce((sum, b) => sum + n(b.closingValue), 0), '']);
  total.font = { bold: true }; [5, 7, 9, 11].forEach(column => { total.getCell(column).numFmt = money; });
  [12, 44, 12, 14, 14, 14, 14, 14, 14, 14, 14, 14].forEach((width, index) => { summary.getColumn(index + 1).width = width; });
  summary.views = [{ state: 'frozen', ySplit: header.number }];

  for (const book of report.books) {
    const sheet = workbook.addWorksheet(sheetName(book.product.sku));
    head(sheet, [productTitle(book), book.product.description].filter(Boolean).join(' — '));
    sheet.addRow(['Código · Unidad', `${book.product.sku} · ${book.product.internalCode} · ${book.product.purchaseUnit.name}`, 'Categoría', `${book.product.category.name} › ${book.product.subcategory.name}`]);
    sheet.addRow([]);
    const columns = sheet.addRow(['N.°', 'Fecha', 'Documento de respaldo', 'Proveedor', 'Operación', 'Lote · ubicación · usuario', 'Entran (u.)', 'Salen (u.)', 'Saldo (u.)', 'Costo entradas ($)', 'Costo salidas ($)', 'Saldo ($)', 'Costo unit. aplicado', 'Promedio resultante']);
    styleHeader(columns);
    const opening = sheet.addRow(['', '', 'Saldo inicial del período', '', '', '', '', '', n(book.opening), '', '', n(book.openingValue), '', '']);
    opening.font = { italic: true }; opening.getCell(9).numFmt = units; opening.getCell(12).numFmt = money;
    for (const item of book.items) {
      const row = sheet.addRow([item.sequence, when(item.movementDate), documentText(item), supplierText(item), operation(item), placement(item),
        n(item.quantityIn) || null, n(item.quantityOut) || null, n(item.runningQuantity), item.entryCost === null ? null : n(item.entryCost), item.exitCost === null ? null : n(item.exitCost), n(item.runningValue), item.costAdjustment ? null : n(item.unitCost), n(item.runningAverage)]);
      row.alignment = { vertical: 'top', wrapText: true };
      [7, 8, 9].forEach(column => { row.getCell(column).numFmt = units; }); [10, 11, 12].forEach(column => { row.getCell(column).numFmt = money; }); [13, 14].forEach(column => { row.getCell(column).numFmt = unit; });
    }
    const totals = sheet.addRow(['', '', 'Totales del período', '', '', '', n(book.totals.quantityIn), n(book.totals.quantityOut), n(book.closing), n(book.totals.entryCost), n(book.totals.exitCost), n(book.closingValue), '', n(book.closingAverage)]);
    totals.font = { bold: true }; [7, 8, 9].forEach(column => { totals.getCell(column).numFmt = units; }); [10, 11, 12].forEach(column => { totals.getCell(column).numFmt = money; }); totals.getCell(14).numFmt = unit;
    [6, 17, 42, 30, 20, 38, 11, 11, 11, 15, 15, 15, 15, 15].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.views = [{ state: 'frozen', ySplit: columns.number, xSplit: 2 }];
    sheet.autoFilter = { from: { row: columns.number, column: 1 }, to: { row: columns.number, column: 14 } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ------------------------------------------------------------------------------------------------ PDF

const assets = join(__dirname, '../../assets/pdf');
const colors = { ink: '#102030', muted: '#657080', line: '#D5DAE0', head: '#E9ECEF', warn: '#8A5A00' };
type Column = { label: string; width: number; align?: 'left' | 'right' };
const fmtUnits = (value: number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(value);
const fmtMoney = (value: number, digits = 2) => `$${new Intl.NumberFormat('es-SV', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits }).format(value)}`;

export async function kardexPdf(report: ExportReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 30, bufferPages: true, pdfVersion: '1.7',
    info: { Title: TITLE, Author: report.header.company.name, Subject: `${TITLE} · ${periodText(report.header.period)}`, Creator: 'ERP' } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  void result.catch(() => undefined);
  doc.registerFont('Regular', join(assets, 'LiberationSans-Regular.ttf'));
  doc.registerFont('Bold', join(assets, 'LiberationSans-Bold.ttf'));
  const left = 30, width = doc.page.width - 60, bottom = doc.page.height - 44;
  let y = 30;
  const text = (value: string, x: number, top: number, w: number, size = 8, bold = false, color = colors.ink, align: 'left' | 'right' = 'left') => { doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(color).text(value, x, top, { width: w, align, lineGap: 1 }); };
  const heightOf = (value: string, w: number, size = 7, bold = false) => doc.font(bold ? 'Bold' : 'Regular').fontSize(size).heightOfString(value, { width: w, lineGap: 1 });

  const heading = (subtitle: string, book?: ExportBook) => {
    y = 30;
    text(`${TITLE.toUpperCase()} · ${LAW.toUpperCase()}`, left, y, width, 8, true, colors.muted); y += 13;
    text(report.header.company.name, left, y, width * 0.55, 11, true); text(`NIT ${report.header.company.nit}   ·   NRC ${report.header.company.nrc}`, left + width * 0.55, y + 2, width * 0.45, 9, true, colors.ink, 'right'); y += 17;
    if (book) {
      text(`${productTitle(book)}`, left, y, width * 0.7, 10, true); text(`${book.product.sku} · ${book.product.internalCode} · ${book.product.purchaseUnit.name}`, left + width * 0.7, y + 1, width * 0.3, 8, false, colors.muted, 'right');
      y += heightOf(productTitle(book), width * 0.7, 10, true) + 3;
      if (book.product.description) { text(book.product.description, left, y, width, 8, false, colors.muted); y += heightOf(book.product.description, width, 8) + 2; }
    } else if (subtitle) { text(subtitle, left, y, width, 10, true); y += 15; }
    text(`${periodText(report.header.period)}  ·  ${report.scope}`, left, y, width, 7.5, false, colors.muted); y += heightOf(`${periodText(report.header.period)}  ·  ${report.scope}`, width, 7.5) + 6;
  };
  const headerRow = (columns: Column[]) => {
    const rowHeight = Math.max(...columns.map(column => heightOf(column.label, column.width - 4, 7, true))) + 6;
    doc.rect(left, y, width, rowHeight).fill(colors.head);
    let x = left; for (const column of columns) { text(column.label, x + 2, y + 3, column.width - 4, 7, true, colors.ink, column.align); x += column.width; }
    y += rowHeight;
  };
  const dataRow = (columns: Column[], cells: string[], bold = false, onBreak: () => void) => {
    const rowHeight = Math.max(...cells.map((cell, index) => heightOf(cell, columns[index]!.width - 4, 7, bold))) + 5;
    if (y + rowHeight > bottom) { doc.addPage(); onBreak(); }
    let x = left; cells.forEach((cell, index) => { text(cell, x + 2, y + 2.5, columns[index]!.width - 4, 7, bold, colors.ink, columns[index]!.align); x += columns[index]!.width; });
    y += rowHeight; doc.strokeColor(colors.line).lineWidth(0.4).moveTo(left, y).lineTo(left + width, y).stroke();
  };

  // Resumen por producto
  const showSummary = report.books.length !== 1 || report.truncated;
  const summaryColumns: Column[] = [{ label: 'Código', width: 70 }, { label: 'Producto', width: 190 }, { label: 'Unidad', width: 45 },
    ...['Saldo inicial u.', 'Saldo inicial $', 'Entradas u.', 'Entradas $', 'Salidas u.', 'Salidas $', 'Saldo final u.', 'Saldo final $'].map<Column>((label, index) => ({ label, width: [51, 62, 51, 62, 51, 62, 51, 63][index]!, align: 'right' }))];
  const summaryScale = width / summaryColumns.reduce((sum, column) => sum + column.width, 0);
  summaryColumns.forEach(column => { column.width *= summaryScale; });
  const summaryTitle = () => { heading('Resumen por producto'); headerRow(summaryColumns); };
  if (showSummary) summaryTitle();
  if (showSummary && report.truncated) { text('Se incluyen solo los primeros productos; filtre para ver el resto.', left, y, width, 8, true, colors.warn); y += 12; }
  if (showSummary && !report.books.length) { text('No hay productos con movimientos o saldo para el alcance y el período elegidos.', left, y + 4, width, 9); y += 18; }
  if (showSummary) for (const book of report.books) dataRow(summaryColumns, [book.product.sku, productTitle(book), book.product.purchaseUnit.name, fmtUnits(n(book.opening)), fmtMoney(n(book.openingValue)), fmtUnits(n(book.totals.quantityIn)), fmtMoney(n(book.totals.entryCost)),
    fmtUnits(n(book.totals.quantityOut)), fmtMoney(n(book.totals.exitCost)), fmtUnits(n(book.closing)), fmtMoney(n(book.closingValue))], false, summaryTitle);
  if (showSummary) dataRow(summaryColumns, ['', 'Totales', '', '', fmtMoney(report.books.reduce((sum, b) => sum + n(b.openingValue), 0)), '', fmtMoney(report.books.reduce((sum, b) => sum + n(b.totals.entryCost), 0)), '', fmtMoney(report.books.reduce((sum, b) => sum + n(b.totals.exitCost), 0)), '', fmtMoney(report.books.reduce((sum, b) => sum + n(b.closingValue), 0))], true, summaryTitle);

  // Una sección por producto
  const columns: Column[] = [{ label: 'N.°', width: 22, align: 'right' }, { label: 'Fecha', width: 56 }, { label: 'Documento de respaldo y proveedor', width: 188 }, { label: 'Operación', width: 112 },
    { label: 'Entran', width: 34, align: 'right' }, { label: 'Salen', width: 34, align: 'right' }, { label: 'Saldo u.', width: 38, align: 'right' }, { label: 'Costo entradas', width: 52, align: 'right' }, { label: 'Costo salidas', width: 52, align: 'right' },
    { label: 'Saldo $', width: 56, align: 'right' }, { label: 'Costo unit.', width: 44, align: 'right' }, { label: 'Promedio', width: 44, align: 'right' }];
  const scale = width / columns.reduce((sum, column) => sum + column.width, 0);
  columns.forEach(column => { column.width *= scale; });
  for (const [position, book] of report.books.entries()) {
    if (showSummary || position > 0) doc.addPage();
    const start = () => { heading('', book); headerRow(columns); };
    heading('', book);
    const stats = [['Saldo inicial', `${fmtUnits(n(book.opening))} u. · ${fmtMoney(n(book.openingValue))}`], ['Entradas', `+${fmtUnits(n(book.totals.quantityIn))} u. · ${fmtMoney(n(book.totals.entryCost))}`], ['Salidas', `−${fmtUnits(n(book.totals.quantityOut))} u. · ${fmtMoney(n(book.totals.exitCost))}`], ['Saldo final', `${fmtUnits(n(book.closing))} u. · ${fmtMoney(n(book.closingValue))} · promedio ${fmtMoney(n(book.closingAverage), 4)}`]];
    stats.forEach(([label, value], index) => { const x = left + (width / 4) * index; text(label!, x, y, width / 4 - 6, 7, false, colors.muted); text(value!, x, y + 9, width / 4 - 6, 8, true); });
    y += 28;
    headerRow(columns);
    dataRow(columns, ['', '', 'Saldo inicial del período', '', '', '', fmtUnits(n(book.opening)), '', '', fmtMoney(n(book.openingValue)), '', ''], true, start);
    for (const item of book.items) {
      dataRow(columns, [String(item.sequence), when(item.movementDate), [documentText(item), item.supplier ? `${item.supplier.name} (${item.supplier.country})` : ''].filter(Boolean).join('\n'), `${operation(item)}\n${placement(item)}`,
        n(item.quantityIn) ? fmtUnits(n(item.quantityIn)) : '', n(item.quantityOut) ? fmtUnits(n(item.quantityOut)) : '', fmtUnits(n(item.runningQuantity)),
        item.entryCost === null ? '' : fmtMoney(n(item.entryCost)), item.exitCost === null ? '' : fmtMoney(n(item.exitCost)), fmtMoney(n(item.runningValue)), item.costAdjustment ? '' : fmtMoney(n(item.unitCost), 4), fmtMoney(n(item.runningAverage), 4)], false, start);
    }
    dataRow(columns, ['', '', 'Totales del período', '', fmtUnits(n(book.totals.quantityIn)), fmtUnits(n(book.totals.quantityOut)), fmtUnits(n(book.closing)), fmtMoney(n(book.totals.entryCost)), fmtMoney(n(book.totals.exitCost)), fmtMoney(n(book.closingValue)), '', fmtMoney(n(book.closingAverage), 4)], true, start);
  }

  // Pie con numeración
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(pages.start + index);
    // El pie queda dentro del margen inferior; sin esto pdfkit abre una página nueva por cada pie.
    doc.page.margins.bottom = 0;
    doc.font('Regular').fontSize(7).fillColor(colors.muted);
    doc.text(`Generado el ${when(report.header.generatedAt)} · ${report.header.company.name}`, left, doc.page.height - 30, { width: width * 0.7, lineBreak: false });
    doc.text(`Página ${index + 1} de ${pages.count}`, left + width * 0.7, doc.page.height - 30, { width: width * 0.3, align: 'right', lineBreak: false });
  }
  doc.end();
  return result;
}
