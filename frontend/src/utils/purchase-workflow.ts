type Branch = { id: number; warehouses: { id: number }[] };
type Source = { request: { branchId: number; warehouseId: number } };
type Quotation = {
  details: { id: number; quantity?: number | string; availableQuantity: number | string; product: { name: string } }[];
  orders?: { status: string; details?: { quotationDetailId: number; quantity: number | string }[] }[];
};

export function quotationPendingLines(quotation: Quotation) {
  const ordered = new Map<number, number>();
  for (const order of quotation.orders ?? []) {
    if (['cancelled', 'rejected'].includes(order.status)) continue;
    for (const line of order.details ?? []) {
      ordered.set(line.quotationDetailId, (ordered.get(line.quotationDetailId) ?? 0) + Number(line.quantity));
    }
  }
  return quotation.details.map(line => {
    const offered = Math.min(Number(line.quantity ?? line.availableQuantity), Number(line.availableQuantity));
    const pending = Math.max(0, Math.round((offered - (ordered.get(line.id) ?? 0)) * 100) / 100);
    return { quotationDetailId: line.id, productName: line.product.name, pending, quantity: pending };
  }).filter(line => line.pending > 0);
}

export function quotationDestination(sources: Source[], branches: Branch[]) {
  const branchIds = new Set(sources.map(source => source.request.branchId));
  const branch = branchIds.size === 1 ? branches.find(item => branchIds.has(item.id)) : undefined;
  if (!branch) return { branchId: 0, warehouseId: 0 };
  const warehouseIds = new Set(sources.map(source => source.request.warehouseId));
  const warehouse = warehouseIds.size === 1 ? branch.warehouses.find(item => warehouseIds.has(item.id)) : undefined;
  return { branchId: branch.id, warehouseId: warehouse?.id ?? 0 };
}

export function onlyOptionId(options: { id: number }[]) {
  return options.length === 1 ? options[0]!.id : 0;
}

export function comparisonRequestId(options: { id: number }[], requested: unknown, current = 0) {
  if (requested !== undefined && requested !== null) {
    const id = typeof requested === 'string' && /^[1-9]\d*$/.test(requested) ? Number(requested) : 0;
    return options.some(option => option.id === id) ? id : 0;
  }
  return options.some(option => option.id === current) ? current : onlyOptionId(options);
}
export function purchasePurposeLabel(purpose: string | null | undefined): string {
  return ({ resale: 'Reposición para reventa', operations: 'Insumos para operación / instalación', mixed: 'Mixta: reventa y operación' } as Record<string, string>)[purpose ?? ''] ?? 'Finalidad sin registrar';
}

export function receiptProgress(lines: { id: number; quantity: number | string; receivedQuantity: number | string }[], items: { orderDetailId: number; quantity: number | string }[]) {
  const entered = new Map(items.map(item => [item.orderDetailId, Number(item.quantity)]));
  let pendingLines = 0;
  for (const line of lines) {
    const remaining = Math.round((Number(line.quantity) - Number(line.receivedQuantity) - (entered.get(line.id) ?? 0)) * 100) / 100;
    if (remaining > 0) pendingLines++;
  }
  return { complete: pendingLines === 0, pendingLines };
}

type ReceiptDocument = {
  id: number;
  status: string;
  purchaseDate?: string;
  items?: { locationId?: number | null; location?: unknown }[];
  retaceoStatus?: string | null;
  retaceoArchived?: boolean;
  retaceos?: { status: string }[];
};

export function receiptNextStep(receipt: ReceiptDocument) {
  if (receipt.status === 'CANCELLED') return { step: 'cancelled', label: 'Recepción cancelada' } as const;
  if (receipt.status === 'CLOSED') return { step: 'complete', label: 'Recepción cerrada' } as const;
  if (receipt.items?.some(item => item.locationId === null || (item.locationId === undefined && !item.location))) {
    return { step: 'placement', label: 'Pendiente de ubicación' } as const;
  }
  if (receipt.status === 'RECEIVED') return { step: 'verify', label: 'Pendiente de verificar' } as const;
  const retaceoStatus = receipt.retaceoStatus ?? receipt.retaceos?.find(item => item.status !== 'cancelled')?.status;
  if (receipt.retaceoArchived && retaceoStatus !== 'closed') return { step: 'restore', label: 'Retaceo en papelera' } as const;
  if (retaceoStatus !== 'closed') return { step: 'cost', label: retaceoStatus ? 'Retaceo pendiente de cierre' : 'Pendiente de retaceo' } as const;
  return { step: 'close', label: 'Lista para cerrar' } as const;
}

// Receipt dates can arrive in either order. Choose unfinished work rather than
// the last element, which can be an older, already closed partial delivery.
export function nextOrderReceipt(receipts: ReceiptDocument[] = []) {
  return receipts.filter(receipt => !['CLOSED', 'CANCELLED'].includes(receipt.status))
    .sort((a, b) => (Date.parse(a.purchaseDate ?? '') || 0) - (Date.parse(b.purchaseDate ?? '') || 0) || a.id - b.id)[0];
}

export function orderNeedsAttention(order: { status: string; purchases?: ReceiptDocument[] }) {
  if (order.status === 'received') return !!nextOrderReceipt(order.purchases);
  return ['draft', 'returned', 'pending_approval', 'approved', 'sent', 'partially_received'].includes(order.status);
}

export function orderReceiptStage(order: { status: string; purchases?: ReceiptDocument[] }) {
  const receipt = nextOrderReceipt(order.purchases);
  const openCount = order.purchases?.filter(item => !['CLOSED', 'CANCELLED'].includes(item.status)).length ?? 0;
  if (receipt) return `${receiptNextStep(receipt).label} · ${openCount} ${openCount === 1 ? 'recepción abierta' : 'recepciones abiertas'}`;
  const active = order.purchases?.filter(item => item.status !== 'CANCELLED') ?? [];
  return active.length ? 'Productos recibidos · Recepciones cerradas' : 'Productos recibidos';
}

type OriginRequest = { id: number; code: string; justification?: string };
export function purchaseOriginRequests(order?: {
  quotation?: { requestLinks?: { request: OriginRequest }[] } | null;
  consolidation?: { lines: { sources: { requestDetail: { request: OriginRequest } }[] }[] } | null;
} | null) {
  const requests = [
    ...(order?.quotation?.requestLinks ?? []).map(link => link.request),
    ...(order?.consolidation?.lines ?? []).flatMap(line => line.sources.map(source => source.requestDetail.request)),
  ];
  return [...new Map(requests.map(request => [request.id,request])).values()];
}
