export type PurchaseSection = 'requests' | 'quotations' | 'orders';

export function isPendingPurchase(section: PurchaseSection, status: string) {
  const pending: Record<PurchaseSection, string[]> = {
    requests: ['draft', 'rejected', 'submitted', 'approved', 'in_quotation', 'partially_ordered'],
    quotations: ['draft', 'received', 'under_review', 'selected'],
    orders: ['draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received'],
  };
  return pending[section].includes(status);
}

export function purchaseStage(section: PurchaseSection, status: string) {
  const stages: Record<PurchaseSection, Record<string, string>> = {
    requests: { draft: 'Pendiente de enviar a aprobación', rejected: 'Pendiente de corregir', submitted: 'Esperando aprobación', approved: 'Lista para cotizar', in_quotation: 'Ofertas en evaluación', partially_ordered: 'Compra parcial', completed: 'Compra ordenada', cancelled: 'Solicitud cancelada' },
    quotations: { draft: 'Oferta pendiente de confirmar', received: 'Pendiente de evaluar', under_review: 'En evaluación', selected: 'Oferta elegida', expired: 'Oferta vencida', rejected: 'Oferta descartada', cancelled: 'Cotización cancelada' },
    orders: { draft: 'Pendiente de enviar a aprobación', pending_approval: 'Esperando aprobación', approved: 'Compra autorizada', sent: 'Esperando entrega', partially_received: 'Entrega incompleta', received: 'Entrega completa', closed: 'Compra cerrada', cancelled: 'Orden cancelada' },
  };
  return stages[section][status] ?? status;
}
