type Quantity = number | string;
export type DispatchDemand = { id: number; productId: number; unitId: number; quantity: Quantity; dispatchedQuantity: Quantity; product: { name: string }; unit?: { name: string } };
export type DispatchStock = { quantity: Quantity; product: { id: number; purchaseUnit?: { id?: number } }; location: { id: number; code: string; isActive?: boolean; deletedAt?: unknown } };
export type DispatchSpace = { id: number; code: string; capacity: Quantity; isActive: boolean; deletedAt: unknown; stocks: { productId: number; quantity: Quantity; product: { purchaseUnit: { id: number } } }[] };
export type SuggestedDispatchLine = { requestDetailId: number; productId: number; productName: string; unitName: string; fromLocationId: number; toLocationId: number; quantity: number; pending: number };
export type DispatchSuggestion = { lines: SuggestedDispatchLine[]; shortages: { requestDetailId: number; productName: string; unitName: string; quantity: number; reason: 'stock' | 'space' | 'stock-and-space' }[] };

const cents = (value: Quantity) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(Math.round(amount * 100)) ? Math.round(amount * 100) : 0;
};
const byCode = (a: { code: string; id: number }, b: { code: string; id: number }) => a.code.localeCompare(b.code, 'es', { numeric: true }) || a.id - b.id;

/** Prepare a reviewable plan from actual stock; this never reserves space or posts movements. */
export function suggestDispatch(demands: DispatchDemand[], stocks: DispatchStock[], spaces: DispatchSpace[]): DispatchSuggestion {
  const source = stocks.filter(s => s.location.isActive !== false && !s.location.deletedAt && cents(s.quantity) > 0)
    .map(s => ({ ...s, available: cents(s.quantity) })).sort((a, b) => byCode(a.location, b.location));
  const destination = spaces.filter(s => s.isActive && !s.deletedAt).map(space => {
    const occupied = space.stocks.filter(s => cents(s.quantity) > 0);
    return { space, units: new Set(occupied.map(s => s.product.purchaseUnit.id)), products: new Set(occupied.map(s => s.productId)),
      available: Math.max(0, cents(space.capacity) - occupied.reduce((n, s) => n + cents(s.quantity), 0)) };
  });
  const result: DispatchSuggestion = { lines: [], shortages: [] };
  for (const demand of demands) {
    const pending = Math.max(0, cents(demand.quantity) - cents(demand.dispatchedQuantity));
    let remaining = pending;
    const availableSource = source.filter(s => s.product.id === demand.productId && s.product.purchaseUnit?.id === demand.unitId);
    const stockAvailable = availableSource.reduce((n, s) => n + s.available, 0);
    const availableSpaces = destination.filter(s => !s.units.size || (s.units.size === 1 && s.units.has(demand.unitId)))
      .sort((a, b) => Number(b.products.has(demand.productId)) - Number(a.products.has(demand.productId)) || Number(a.products.size > 0) - Number(b.products.size > 0) || byCode(a.space, b.space));
    const spaceAvailable = availableSpaces.reduce((n, s) => n + s.available, 0);
    for (const from of availableSource) {
      for (const to of availableSpaces) {
        const amount = Math.floor(Math.min(remaining, from.available, to.available) / 100) * 100;
        if (amount <= 0) continue;
        result.lines.push({ requestDetailId: demand.id, productId: demand.productId, productName: demand.product.name, unitName: demand.unit?.name ?? '',
          fromLocationId: from.location.id, toLocationId: to.space.id, quantity: amount / 100, pending: pending / 100 });
        from.available -= amount; to.available -= amount; remaining -= amount; to.units.add(demand.unitId); to.products.add(demand.productId);
      }
    }
    if (remaining > 0) result.shortages.push({ requestDetailId: demand.id, productName: demand.product.name, unitName: demand.unit?.name ?? '', quantity: remaining / 100,
      reason: stockAvailable < pending ? spaceAvailable < Math.min(pending, stockAvailable) ? 'stock-and-space' : 'stock' : 'space' });
  }
  return result;
}

/** Validate the whole editable plan, including multiple lines from the same request or stock slot. */
export function dispatchPlanError(lines: SuggestedDispatchLine[], demands: DispatchDemand[], stocks: DispatchStock[], spaces: DispatchSpace[]): string {
  if (!lines.length) return 'Agrega al menos un producto al traslado.';
  const requested = new Map<number, number>(), used = new Map<string, number>(), destination = new Map<number, { quantity: number; units: Set<number> }>(), combinations = new Set<string>();
  for (const line of lines) {
    const demand = demands.find(d => d.id === line.requestDetailId);
    if (!demand || line.productId !== demand.productId) return 'Revisa los productos de la solicitud.';
    const combination = `${line.requestDetailId}:${line.fromLocationId}:${line.toLocationId}`;
    if (combinations.has(combination)) return `Combina o retira las líneas repetidas de ${line.productName} que tienen el mismo origen y destino.`;
    combinations.add(combination);
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > 9999999999) return `Indica una cantidad entera positiva para ${line.productName}.`;
    const amount = cents(line.quantity);
    requested.set(demand.id, (requested.get(demand.id) ?? 0) + amount);
    if (requested.get(demand.id)! > Math.max(0, cents(demand.quantity) - cents(demand.dispatchedQuantity))) return `El despacho de ${line.productName} supera lo que falta enviar; lo que está en tránsito ya cuenta.`;
    const stock = stocks.find(s => s.product.id === demand.productId && s.location.id === line.fromLocationId && s.location.isActive !== false && !s.location.deletedAt);
    if (!stock || stock.product.purchaseUnit?.id !== demand.unitId) return `Selecciona existencias con una unidad conocida y compatible para ${line.productName}.`;
    const key = `${demand.productId}:${line.fromLocationId}`;
    used.set(key, (used.get(key) ?? 0) + amount);
    if (used.get(key)! > cents(stock.quantity)) return `No hay suficientes existencias de ${line.productName} en el espacio de origen.`;
    const slot = spaces.find(s => s.id === line.toLocationId && s.isActive && !s.deletedAt);
    if (!slot) return 'Selecciona un espacio activo en la sucursal destino.';
    const positive = slot.stocks.filter(s => cents(s.quantity) > 0);
    const planned = destination.get(slot.id) ?? { quantity: positive.reduce((n, s) => n + cents(s.quantity), 0), units: new Set(positive.map(s => s.product.purchaseUnit.id)) };
    planned.units.add(demand.unitId); planned.quantity += amount; destination.set(slot.id, planned);
    if (planned.units.size > 1) return `El espacio ${slot.code} contiene productos con otra unidad de capacidad.`;
    if (planned.quantity > cents(slot.capacity)) return `El espacio ${slot.code} no tiene capacidad suficiente para este despacho.`;
  }
  return '';
}
