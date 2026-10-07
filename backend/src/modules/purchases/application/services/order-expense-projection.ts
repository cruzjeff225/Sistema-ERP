import type { Prisma } from '@prisma/client';

type Expense = { id?: number; expenseTypeId: number; description?: string | null; amount: Prisma.Decimal | number | string; documents?: unknown[]; chargeMode?: string };
// Match the original order's per-concept rounding before deciding whether its budget was edited.
const amount = (value: Prisma.Decimal | number | string) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Recalculate unchanged quotation estimates; preserve budgets edited or documented by a person. */
export function projectOrderExpenses(quotation: Expense[], current: Expense[], previousGross: number, addedGross: number, quotationGross: number) {
  const ratio = (gross: number) => Math.min(1, gross / Math.max(quotationGross, 0.01));
  const factor = (expense: Expense, gross: number) => expense.chargeMode === 'fixed' ? (gross > 0 ? 1 : 0) : ratio(gross);
  const before = quotation.map((expense, index) => ({ ...expense, index, amount: amount(Number(expense.amount) * factor(expense, previousGross)) })).filter(expense => expense.amount > 0);
  const automatic = before.length === current.length && before.every((expense, index) => {
    const existing = current[index]!;
    return existing.expenseTypeId === expense.expenseTypeId && (existing.description ?? '') === (expense.description ?? '')
      && amount(existing.amount) === expense.amount && !existing.documents?.length;
  });
  if (!automatic) return { automatic: false, expenses: current.map(expense => ({ ...expense, amount: amount(expense.amount) })) };
  const next = quotation.map((expense, index) => ({
    id: current[before.findIndex(previous => previous.index === index)]?.id,
    expenseTypeId: expense.expenseTypeId, description: expense.description,
    amount: amount(Number(expense.amount) * factor(expense, previousGross + addedGross)),
  })).filter(expense => expense.amount > 0);
  return { automatic: true, expenses: next };
}
