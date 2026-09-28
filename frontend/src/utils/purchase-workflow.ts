type Branch = { id: number; warehouses: { id: number }[] };
type Source = { request: { branchId: number; warehouseId: number } };
type Quotation = {
  details: { id: number; availableQuantity: number | string; product: { name: string } }[];
  orders?: { status: string; details?: { quotationDetailId: number; quantity: number | string }[] }[];
};

export function quotationPendingLines(quotation: Quotation) {
  const ordered = new Map<number, number>();
  for (const order of quotation.orders ?? []) {
    if (order.status === 'cancelled') continue;
    for (const line of order.details ?? []) {
      ordered.set(line.quotationDetailId, (ordered.get(line.quotationDetailId) ?? 0) + Number(line.quantity));
    }
  }
  return quotation.details.map(line => {
    const pending = Math.max(0, Math.round((Number(line.availableQuantity) - (ordered.get(line.id) ?? 0)) * 100) / 100);
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
