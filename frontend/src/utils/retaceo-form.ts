type ReceiptSource = {
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: string | null;
  items: { id: number; lineTotal: string | number }[];
  actualExpenses?: { category: string; capitalizable: boolean; amount: string | number }[];
};

export function retaceoSourceFields(purchase?: ReceiptSource) {
  const sum = (category: string) => (purchase?.actualExpenses ?? []).filter(e => e.capitalizable && e.category === category).reduce((n,e) => n + Number(e.amount), 0);
  return {
    originCountry: '',
    importInvoiceNumber: purchase?.supplierInvoiceNumber ?? '',
    importInvoiceDate: purchase?.supplierInvoiceDate?.slice(0, 10) ?? '',
    importPolicyNumber: '',
    importPolicyDate: '',
    totalFreight: sum('freight'),
    totalExpenses: sum('expense'),
    totalDai: sum('dai'),
    importVat: 0,
    notes: '',
    details: (purchase?.items ?? []).map(item => ({ purchaseItemId: item.id, costFob: Number(item.lineTotal) })),
  };
}
