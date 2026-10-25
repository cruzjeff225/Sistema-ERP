type RetaceoDraft = {
  purchaseId: number;
  retaceoDate: string;
  totalFreight: unknown;
  totalExpenses: unknown;
  totalDai: unknown;
  importVat: unknown;
  details: { costFob: unknown }[];
};

export function retaceoStepError(form: RetaceoDraft, step: number): string {
  if (!form.purchaseId || !form.details.length) return 'Selecciona una recepción con productos.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.retaceoDate) || !Number.isFinite(Date.parse(form.retaceoDate))) return 'Indica la fecha del retaceo.';
  if (step < 2) return '';
  const validAmount = (value: unknown) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0;
  if (form.details.some(item => !validAmount(item.costFob))) return 'El valor de cada producto debe ser un número mayor o igual a cero.';
  if ([form.totalFreight, form.totalExpenses, form.totalDai, form.importVat].some(value => !validAmount(value))) return 'Los gastos deben ser números mayores o iguales a cero. Usa 0 cuando no apliquen.';
  const base = form.details.reduce((sum, item) => sum + Number(item.costFob), 0);
  const costs = Number(form.totalFreight) + Number(form.totalExpenses) + Number(form.totalDai);
  if (!Number.isFinite(base + costs)) return 'Los importes exceden el valor permitido.';
  if (base === 0 && costs > 0) return 'El valor total de los productos debe ser mayor que cero para repartir los gastos.';
  return '';
}
