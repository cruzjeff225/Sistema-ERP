import { isCurrentPurchaseWeek } from './purchase-inbox';

export type QuotationProcessListItem = {
  id: number;
  code: string;
  dateFrom: string;
  dateTo: string;
  createdAt?: string;
};

export function quotationProcessDay(document: QuotationProcessListItem) {
  if (!document.createdAt) return document.dateTo.slice(0, 10);
  const value = new Date(document.createdAt);
  return Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(value)
    : '';
}

export function filterQuotationProcesses<T extends QuotationProcessListItem>(documents: T[], filters: {
  period: 'week' | 'all'; search: string; from: string; to: string;
}, now = new Date()) {
  const term = filters.search.trim().toLocaleLowerCase('es');
  return documents.filter(document => {
    const day = quotationProcessDay(document);
    return !!day
      && (filters.period === 'all' || isCurrentPurchaseWeek(`${day}T12:00:00-06:00`, now))
      && (filters.period !== 'all' || ((!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)))
      && (!term || `${document.id} ${document.code} ${document.dateFrom.slice(0, 10)} ${document.dateTo.slice(0, 10)}`.toLocaleLowerCase('es').includes(term));
  }).sort((a, b) => quotationProcessDay(b).localeCompare(quotationProcessDay(a)) || b.id - a.id);
}
