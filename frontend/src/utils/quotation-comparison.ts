type Amount = number | string;
export type ComparisonDetail = {
  id: number;
  quantity: Amount;
  availableQuantity: Amount;
  unitPrice: Amount;
  discount?: Amount | null;
  taxRate?: Amount | null;
  deliveryDays?: number | null;
  notes?: string | null;
  availabilityStatus?: string;
  minimumQuantity?: Amount;
  unitId?: number;
};
export type ComparisonExpense = { amount: Amount; expenseTypeId?: number; description?: string | null; documents?: unknown[]; chargeMode?: string };
export type ComparisonQuotation = {
  currency: string;
  status: string;
  deletedAt?: string | null;
  validUntil: string;
  deliveryDays?: number | null;
  subtotal?: Amount;
  additionalExpenses?: Amount;
  expenses?: ComparisonExpense[];
  details: ComparisonDetail[];
  orders?: { status: string; deletedAt?: string | null; expenses?: ComparisonExpense[]; details?: { quotationDetailId: number; quantity: Amount; subtotal: Amount; discount: Amount; taxAmount: Amount }[] }[];
};
export type ComparisonOffer = {
  detail: ComparisonDetail;
  quotation: ComparisonQuotation;
  supplier: { id: number; name: string; isActive?: boolean; deletedAt?: string | null };
  supplierAlreadyOrdered?: boolean;
  requiredUnitId?: number;
};
export const roundPurchaseAmount = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function consumedLines(quotation: ComparisonQuotation) {
  return quotation.orders?.filter(order => !['cancelled','rejected'].includes(order.status)).flatMap(order => order.details ?? []) ?? [];
}

export function projectComparisonExpenses(quotation: ComparisonQuotation, previousGross: number, addedGross: number, quotationGross: number) {
  const original = quotation.expenses ?? [{ amount: quotation.additionalExpenses ?? 0 }];
  const planned = (gross: number) => original.map(expense => ({ ...expense, amount: roundPurchaseAmount(Number(expense.amount) * (expense.chargeMode === 'fixed' ? gross > 0 ? 1 : 0 : Math.min(1, gross / Math.max(quotationGross, 0.01)))) })).filter(expense => expense.amount > 0);
  const before = planned(previousGross);
  const order = quotation.orders?.find(item => item.status === 'draft' && !item.deletedAt);
  const current = order?.expenses ?? before;
  const automatic = current.length === before.length && before.every((expense, index) => {
    const existing = current[index]!;
    return existing.expenseTypeId === expense.expenseTypeId && (existing.description ?? '') === (expense.description ?? '')
      && roundPurchaseAmount(Number(existing.amount)) === expense.amount && !existing.documents?.length;
  });
  const next = automatic ? planned(previousGross + addedGross) : current;
  const sum = (expenses: ComparisonExpense[]) => roundPurchaseAmount(expenses.reduce((total, expense) => total + Number(expense.amount), 0));
  return { automatic, previous: sum(current), total: sum(next), added: roundPurchaseAmount(sum(next) - sum(current)) };
}

// Uses the same cumulative line rounding and per-concept expense allocation
// as the server, including when a draft order receives more products.
export function estimateQuotationSelection(quotation: ComparisonQuotation, selections: { detailId: number; quantity: number }[]) {
  const consumed = consumedLines(quotation);
  const lines = selections.flatMap(selection => {
    const detail = quotation.details.find(item => item.id === selection.detailId);
    if (!detail || !Number.isFinite(selection.quantity) || selection.quantity <= 0 || Number(detail.quantity) <= 0) return [];
    const previous = consumed.filter(line => line.quotationDetailId === detail.id);
    const previousQuantity = previous.reduce((sum, line) => sum + Number(line.quantity), 0);
    const previousDiscount = previous.reduce((sum, line) => sum + Number(line.discount), 0);
    const previousSubtotal = previous.reduce((sum, line) => sum + Number(line.subtotal), 0);
    const previousTax = previous.reduce((sum, line) => sum + Number(line.taxAmount), 0);
    const gross = roundPurchaseAmount(Math.max(0, roundPurchaseAmount((previousQuantity + selection.quantity) * Number(detail.unitPrice)) - previousSubtotal - previousDiscount));
    const discount = roundPurchaseAmount(Math.min(gross, Math.max(0, roundPurchaseAmount(Number(detail.discount ?? 0) * (previousQuantity + selection.quantity) / Number(detail.quantity)) - previousDiscount)));
    const subtotal = roundPurchaseAmount(gross - discount);
    const tax = roundPurchaseAmount(Math.max(0, roundPurchaseAmount((previousSubtotal + subtotal) * Number(detail.taxRate ?? 0) / 100) - previousTax));
    return [{ gross, discount, subtotal, tax }];
  });
  const sum = (key: keyof (typeof lines)[number]) => roundPurchaseAmount(lines.reduce((total, line) => total + line[key], 0));
  const gross = sum('gross'), subtotal = sum('subtotal'), tax = sum('tax');
  const quoteGross = roundPurchaseAmount(quotation.details.reduce((total, detail) => total + roundPurchaseAmount(Number(detail.quantity) * Number(detail.unitPrice)), 0));
  const previousGross = roundPurchaseAmount(consumed.reduce((sum, line) => sum + Number(line.subtotal) + Number(line.discount), 0));
  const denominator = Math.max(Number(quotation.subtotal ?? quoteGross), 0.01);
  const projection = projectComparisonExpenses(quotation, previousGross, gross, denominator);
  const expenses = projection.added;
  const total = roundPurchaseAmount(subtotal + tax + expenses);
  const previousTotal = roundPurchaseAmount(consumed.reduce((amount, line) => amount + Number(line.subtotal) + Number(line.taxAmount), 0) + projection.previous);
  return { gross, discount: sum('discount'), subtotal, tax, expenses, expensesAutomatic: projection.automatic, total, previousTotal, orderTotal: roundPurchaseAmount(previousTotal + total) };
}

export function evaluateComparisonOffer(offer: ComparisonOffer, desiredQuantity: number, today: string) {
  const quoted = Number(offer.detail.quantity), available = Number(offer.detail.availableQuantity);
  const consumedQuantity = consumedLines(offer.quotation).filter(line => line.quotationDetailId === offer.detail.id).reduce((total, line) => total + Number(line.quantity), 0);
  const maxQuantity = roundPurchaseAmount(Math.max(0, Math.min(desiredQuantity, available - consumedQuantity, quoted - consumedQuantity)));
  let reason = '';
  if(offer.detail.availabilityStatus==='not_quoted') reason='No cotizado';
  if(offer.detail.availabilityStatus==='unavailable') reason='No tiene este producto';
  if(offer.detail.availabilityStatus==='unconfirmed') reason='Disponibilidad por confirmar';
  if (offer.supplier.isActive === false || offer.supplier.deletedAt) reason = 'Proveedor inactivo';
  if (!reason && offer.requiredUnitId != null && offer.detail.unitId !== offer.requiredUnitId) reason = 'Unidad no equivalente';
  if (!reason && !(Number(offer.detail.unitPrice) > 0)) reason = 'Precio pendiente de confirmar';
  if (!reason && (offer.quotation.deletedAt || !['received', 'under_review', 'selected'].includes(offer.quotation.status))) reason = 'Oferta pendiente de revisión o descartada';
  if (!reason && (!offer.quotation.validUntil || offer.quotation.validUntil.slice(0, 10) < today)) reason = 'Oferta vencida';
  if (!reason && (offer.supplierAlreadyOrdered || offer.quotation.orders?.some(order => !['cancelled','rejected'].includes(order.status) && (order.status !== 'draft' || !!order.deletedAt)))) reason = 'Proveedor con orden creada';
  if (!reason && maxQuantity + consumedQuantity < Number(offer.detail.minimumQuantity??0)) reason='No cumple la cantidad mínima';
  if (!reason && (!Number.isFinite(quoted) || !Number.isFinite(available) || quoted <= 0 || available <= 0)) reason = 'Sin disponibilidad';
  if (!reason && [offer.detail.unitPrice, offer.detail.discount ?? 0, offer.detail.taxRate ?? 0, ...offer.quotation.details.map(detail => detail.unitPrice), ...(offer.quotation.expenses ?? []).map(expense => expense.amount)].some(value => !Number.isFinite(Number(value)) || Number(value) < 0)) reason = 'Importes de oferta incompletos';
  if (!reason && (!Number.isFinite(desiredQuantity) || desiredQuantity <= 0)) reason = 'Cantidad de compra completa';
  if (!reason && maxQuantity <= 0) reason = 'Disponibilidad ya ordenada';
  const rawDays = offer.detail.deliveryDays ?? offer.quotation.deliveryDays;
  const deliveryDays = rawDays != null && Number.isFinite(Number(rawDays)) && Number(rawDays) >= 0 ? Number(rawDays) : null;
  return {
    offer, eligible: !reason, reason, maxQuantity, minimumPurchase: Math.max(0, Number(offer.detail.minimumQuantity ?? 0) - consumedQuantity), quoted, available, pendingAvailable: roundPurchaseAmount(Math.max(0, available - consumedQuantity)), deliveryDays,
    complete: !reason && maxQuantity >= desiredQuantity,
    estimate: estimateQuotationSelection(offer.quotation, [{ detailId: offer.detail.id, quantity: maxQuantity }]),
  };
}

// Compare one currency and one quantity. A cheap partial offer must never
// displace a complete offer without making that tradeoff explicit.
export function recommendComparisonOffer(offers: ComparisonOffer[], desiredQuantity: number, today: string, currency?: string) {
  const evaluations = offers.map(offer => evaluateComparisonOffer(offer, desiredQuantity, today));
  const eligible = evaluations.filter(item => item.eligible);
  const currencies = [...new Set(eligible.map(item => item.offer.quotation.currency))].sort();
  if (!eligible.length) return { evaluations, currencies, recommendation: null, fastest: null, comparisonQuantity: 0, message: 'No hay una oferta vigente y disponible para recomendar.' };
  if (currencies.length > 1 && !currency) return { evaluations, currencies, recommendation: null, fastest: null, comparisonQuantity: 0, message: 'Elija una moneda para comparar. Las ofertas en monedas distintas requieren un tipo de cambio.' };
  const sameCurrency = eligible.filter(item => item.offer.quotation.currency === (currency ?? currencies[0]));
  if (!sameCurrency.length) return { evaluations, currencies, recommendation: null, fastest: null, comparisonQuantity: 0, message: 'No hay ofertas disponibles en esta moneda.' };
  const full = sameCurrency.filter(item => item.complete);
  const candidates = full.length ? full : sameCurrency;
  const comparisonQuantity = roundPurchaseAmount(Math.min(desiredQuantity, ...candidates.map(item => item.maxQuantity)));
  const ranked = candidates.filter(item => item.minimumPurchase <= comparisonQuantity).map(item => ({ ...item, comparable: estimateQuotationSelection(item.offer.quotation, [{ detailId: item.offer.detail.id, quantity: comparisonQuantity }]) }))
    .sort((a, b) => a.comparable.total - b.comparable.total || (a.deliveryDays ?? Infinity) - (b.deliveryDays ?? Infinity) || b.maxQuantity - a.maxQuantity || a.offer.detail.id - b.offer.detail.id);
  const fastest = [...sameCurrency].filter(item => item.deliveryDays !== null).sort((a, b) => a.deliveryDays! - b.deliveryDays! || a.offer.detail.id - b.offer.detail.id)[0] ?? null;
  return {
    evaluations, currencies, recommendation: ranked[0] ?? null, fastest, comparisonQuantity,
    message: full.length
      ? `Cubre la cantidad pendiente con el menor costo estimado, incluidos descuentos, impuestos y gastos previstos.`
      : `Todas las ofertas son parciales. Se compara el costo de ${comparisonQuantity} unidades; quedará una cantidad pendiente.`,
  };
}
