type ReceiptSource = {
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: string | null;
  items: { id: number; lineTotal: string | number }[];
};

export function retaceoSourceFields(purchase?: ReceiptSource) {
  return {
    originCountry: '',
    importInvoiceNumber: purchase?.supplierInvoiceNumber ?? '',
    importInvoiceDate: purchase?.supplierInvoiceDate?.slice(0, 10) ?? '',
    importPolicyNumber: '',
    importPolicyDate: '',
    totalFreight: 0,
    totalExpenses: 0,
    totalDai: 0,
    importVat: 0,
    notes: '',
    details: (purchase?.items ?? []).map(item => ({ purchaseItemId: item.id, costFob: Number(item.lineTotal) })),
  };
}
