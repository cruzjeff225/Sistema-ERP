export const movementLabels: Record<string, string> = {
  OPENING: 'Saldo inicial', RECEIPT: 'Recepción', REVERSAL: 'Reversión', ADJUSTMENT: 'Ajuste',
  TRANSFER_OUT: 'Despacho a sucursal', TRANSFER_IN: 'Recepción de traslado', SALE: 'Venta', RETURN: 'Devolución',
};

/** Las devoluciones aceptadas se registran desde el detalle del lote (RN-INV-012). */
export const returnsEnabled = true;
/** Las ventas dependen del módulo de Ventas, que todavía no existe: no se ofrece filtrarlas. Al habilitarlo basta cambiar este valor. */
export const salesModuleEnabled = false;
/** Tipos que se ofrecen como filtro; los movimientos ya registrados de cualquier tipo siguen mostrándose con su etiqueta. */
export const movementFilterLabels: Record<string, string> = Object.fromEntries(Object.entries(movementLabels).filter(([type]) => (type !== 'SALE' || salesModuleEnabled) && (type !== 'RETURN' || returnsEnabled)));

export const lotStatusLabels: Record<string, string> = { PENDING_PLACEMENT: 'Pendiente de ubicar', ACTIVE: 'Activo', DEPLETED: 'Agotado', CANCELLED: 'Cancelado' };
export const transferStatusLabels: Record<string, string> = {
  PREPARING: 'En preparación', IN_TRANSIT: 'En tránsito', PARTIALLY_RECEIVED: 'Recibido parcial', COMPLETED: 'Recibido', INCIDENT: 'Incidencia',
};

export const quantity = (value: string | number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Number(value));
/** Siempre 2 decimales; solo muestra hasta `digits` cuando el costo los necesita ($35.00, pero $13.3333). */
export const money = (value: string | number, currency = 'USD', digits = 2) =>
  new Intl.NumberFormat('es-SV', { style: 'currency', currency, minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: Math.max(digits, 2) }).format(Number(value));
export const dateTime = (date: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/El_Salvador' }).format(new Date(date));
export const day = (date: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeZone: 'America/El_Salvador' }).format(new Date(date));

/** Documento que respalda una compra: el del proveedor (con su fecha) o, si aún no se registró, la recepción interna. */
export function supportDocumentLabel(doc: { supplierInvoiceNumber: string | null; supplierInvoiceDate: string | null; receipt: string }) {
  if (!doc.supplierInvoiceNumber) return `Recepción ${doc.receipt}`;
  return doc.supplierInvoiceDate ? `Doc. ${doc.supplierInvoiceNumber} · ${day(doc.supplierInvoiceDate)}` : `Doc. ${doc.supplierInvoiceNumber}`;
}

/** Documentos internos que respaldan una compra, del primero al último: solicitud, cotización, orden, recepción y retaceo. */
export function processLabel(process: { requests: { code: string }[]; consolidation?: { code: string } | null; quotation?: { code: string } | null; order?: { code: string } | null; receipt: { code: string }; retaceos: { code: string }[] } | null, receipt: string) {
  if (!process) return `Recepción ${receipt}`;
  const requests = process.requests.map(request => request.code);
  return [
    requests.length ? `${requests.length === 1 ? 'Solicitud' : 'Solicitudes'} ${requests.join(', ')}` : '',
    process.quotation ? `Cotización ${process.quotation.code}` : '',
    process.order ? `Orden ${process.order.code}` : '',
    `Recepción ${process.receipt.code}`,
    process.retaceos.length ? `Retaceo ${process.retaceos.map(retaceo => retaceo.code).join(', ')}` : '',
  ].filter(Boolean).join(' → ');
}

/** Documento de origen de un movimiento, tal como lo muestra el Kardex. */
export function referenceLabel(movement: { referenceType: string; referenceId: number | null; reason?: string; lot?: { purchaseItem?: { purchase?: { documentNumber: string } | null } | null } | null }) {
  const receipt = movement.lot?.purchaseItem?.purchase?.documentNumber;
  switch (movement.referenceType) {
    case 'purchase_detail': return receipt ? `Recepción ${receipt}` : 'Recepción de compra';
    case 'transfer': return movement.reason || `Traslado ${movement.referenceId ?? ''}`.trim();
    case 'sale': return `Venta ${movement.referenceId ?? ''}`.trim();
    case 'retaceo': return 'Costo final por retaceo';
    case 'adjustment': return 'Ajuste de inventario';
    case 'opening': return 'Saldo inicial del inventario';
    case 'return': return movement.reason || 'Devolución aceptada';
    default: return movement.referenceType;
  }
}

/** Ubicación legible: almacén y código del espacio. */
export const locationLabel = (location: { code: string; warehouse?: { name: string } } | null | undefined) =>
  location ? `${location.warehouse ? location.warehouse.name + ' · ' : ''}${location.code}` : '—';
