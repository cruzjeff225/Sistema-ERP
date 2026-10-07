export type WarehouseContext = { kind: 'purchase' | 'request'; id: number } | { kind: 'invalid'; id: 0 } | null;

export function warehouseContext(query: Record<string, unknown>): WarehouseContext {
  const kind = query.purchaseId != null ? 'purchase' : query.requestId != null ? 'request' : null;
  if (!kind) return null;
  const value = query[kind === 'purchase' ? 'purchaseId' : 'requestId'];
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return { kind: 'invalid', id: 0 };
  return { kind, id: Number(value) };
}

export function placementsForContext<T extends { purchaseId?: number; purchase?: { id: number } }>(rows: T[], context: WarehouseContext): T[] {
  if (!context) return rows;
  return context.kind === 'purchase' ? rows.filter(row => (row.purchaseId ?? row.purchase?.id) === context.id) : [];
}

export function transfersForContext<T extends { items: Array<{ requestDetail?: { requestId?: number; request?: { id: number } } | null }> }>(rows: T[], context: WarehouseContext): T[] {
  if (!context) return rows;
  if (context.kind !== 'request') return [];
  return rows.map(row => ({ ...row, items: row.items.filter(item => (item.requestDetail?.requestId ?? item.requestDetail?.request?.id) === context.id) })).filter(row => row.items.length > 0);
}

export function receiptStateLabel(status: string) {
  return ({ RECEIVED: 'Por verificar', VERIFIED: 'Verificada', COSTED: 'Costo calculado', CLOSED: 'Cerrada', CANCELLED: 'Cancelada' } as Record<string, string>)[status] ?? 'Estado sin identificar';
}

export function transferStateLabel(status: string) {
  return ({ IN_TRANSIT: 'En tránsito', PARTIALLY_RECEIVED: 'Recepción parcial', COMPLETED: 'Entregado', CANCELLED: 'Cancelado' } as Record<string, string>)[status] ?? 'Estado sin identificar';
}
