export const movementLabels: Record<string, string> = {
  OPENING: 'Apertura', RECEIPT: 'Recepción', REVERSAL: 'Reversión', ADJUSTMENT: 'Ajuste',
  TRANSFER_OUT: 'Despacho a sucursal', TRANSFER_IN: 'Recepción de traslado', SALE: 'Venta', RETURN: 'Devolución',
};

export const lotStatusLabels: Record<string, string> = { PENDING_PLACEMENT: 'Pendiente de ubicar', ACTIVE: 'Activo', DEPLETED: 'Agotado', CANCELLED: 'Cancelado' };
export const transferStatusLabels: Record<string, string> = {
  PREPARING: 'En preparación', IN_TRANSIT: 'En tránsito', PARTIALLY_RECEIVED: 'Recibido parcial', COMPLETED: 'Recibido', INCIDENT: 'Incidencia',
};

export const quantity = (value: string | number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(Number(value));
export const money = (value: string | number, currency = 'USD', digits = 2) =>
  new Intl.NumberFormat('es-SV', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) }).format(Number(value));
export const dateTime = (date: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/El_Salvador' }).format(new Date(date));
export const day = (date: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeZone: 'America/El_Salvador' }).format(new Date(date));

/** Documento de origen de un movimiento, tal como lo muestra el Kardex. */
export function referenceLabel(movement: { referenceType: string; referenceId: number | null; reason?: string; lot?: { purchaseItem?: { purchase?: { documentNumber: string } | null } | null } | null }) {
  const receipt = movement.lot?.purchaseItem?.purchase?.documentNumber;
  switch (movement.referenceType) {
    case 'purchase_detail': return receipt ? `Recepción ${receipt}` : 'Recepción de compra';
    case 'transfer': return movement.reason || `Traslado ${movement.referenceId ?? ''}`.trim();
    case 'sale': return `Venta ${movement.referenceId ?? ''}`.trim();
    case 'retaceo': return 'Costo final por retaceo';
    case 'adjustment': return 'Ajuste de inventario';
    default: return movement.referenceType;
  }
}

/** Ubicación legible: almacén y código del espacio. */
export const locationLabel = (location: { code: string; warehouse?: { name: string } } | null | undefined) =>
  location ? `${location.warehouse ? location.warehouse.name + ' · ' : ''}${location.code}` : '—';
