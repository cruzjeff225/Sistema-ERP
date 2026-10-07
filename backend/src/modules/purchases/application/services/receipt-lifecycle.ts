type RetaceoLifecycle = { status: string; deletedAt: Date | null };

/** Keep archived cost documents out of lists without losing their effect on the workflow. */
export function withReceiptLifecycle<T extends { retaceos: RetaceoLifecycle[] }>(receipt: T) {
  const active = receipt.retaceos.find((retaceo) => !['cancelled', 'closed'].includes(retaceo.status))
    ?? receipt.retaceos.find((retaceo) => retaceo.status === 'closed');
  return {
    ...receipt,
    retaceos: receipt.retaceos.filter((retaceo) => !retaceo.deletedAt),
    hasActiveRetaceo: !!active,
    retaceoStatus: active?.status ?? null,
    retaceoArchived: !!active?.deletedAt,
  };
}

export function withOrderReceiptLifecycle<T extends { purchases: Array<{ retaceos: RetaceoLifecycle[] }> }>(order: T) {
  return { ...order, purchases: order.purchases.map((receipt) => withReceiptLifecycle(receipt as T['purchases'][number])) };
}
