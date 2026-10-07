export type PurchaseSection = 'requests' | 'quotations' | 'orders';

export function isPendingPurchase(section: PurchaseSection, status: string) {
  const pending: Record<PurchaseSection, string[]> = {
    requests: ['draft', 'rejected', 'submitted', 'approved', 'in_quotation', 'partially_ordered', 'in_procurement', 'partially_distributed'],
    quotations: ['draft', 'received', 'under_review', 'selected'],
    orders: ['draft', 'returned','pending_approval', 'approved', 'sent', 'partially_received', 'received'],
  };
  return pending[section].includes(status);
}

export function purchaseStage(section: PurchaseSection, status: string) {
  const stages: Record<PurchaseSection, Record<string, string>> = {
    requests: { draft: 'Pendiente de enviar a Compras', rejected: 'Pendiente de corregir', submitted: 'Disponible para Compras', approved: 'Lista para cotizar', in_quotation: 'Ofertas en evaluación', partially_ordered: 'Compra parcial', completed: 'Compra ordenada', cancelled: 'Solicitud cancelada', in_procurement: 'En proceso de abastecimiento', partially_distributed: 'Entrega parcial a sucursal', fulfilled: 'Solicitud entregada a sucursal' },
    quotations: { draft: 'Oferta pendiente de confirmar', received: 'Pendiente de evaluar', under_review: 'En evaluación', selected: 'Oferta elegida', expired: 'Oferta vencida', rejected: 'Oferta descartada', cancelled: 'Cotización cancelada' },
    orders: { draft: 'Pendiente de enviar a aprobación',returned:'Corregir observaciones de Gerencia',rejected:'Rechazada por Gerencia', pending_approval: 'Esperando aprobación', approved: 'Compra autorizada', sent: 'Esperando entrega', partially_received: 'Entrega incompleta', received: 'Entrega completa', closed: 'Compra cerrada', cancelled: 'Orden cancelada' },
  };
  return stages[section][status] ?? status;
}

// Calendar days in the operating timezone, including today and the previous two days.
export function isRecentRequest(value: string, now = new Date(), days = 3) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(d);
  const ordinal = (d: Date) => Date.parse(day(d) + 'T00:00:00Z') / 86400000;
  const age = ordinal(now) - ordinal(date);
  return age >= 0 && age < days;
}

export function isCurrentPurchaseWeek(value: string, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const localDay = (d: Date) => Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(d) + 'T00:00:00Z');
  const today = localDay(now);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * 86400000;
  const documentDay = localDay(date);
  return documentDay >= monday && documentDay < monday + 7 * 86400000;
}

export function currentPurchaseWeek(now = new Date()) {
  const today = Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(now) + 'T00:00:00Z');
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * 86400000;
  return {
    dateFrom: new Date(monday).toISOString().slice(0, 10),
    dateTo: new Date(monday + 6 * 86400000).toISOString().slice(0, 10),
  };
}
