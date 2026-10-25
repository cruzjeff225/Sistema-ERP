export type QuotationOfferExpense = {
  expenseTypeId: number;
  description?: string | null;
  amount: number | string;
  chargeMode?: 'fixed' | 'proportional';
};

type ExpensePermissions = { create: boolean; update: boolean };

export function quotationExpenseCapabilities(originalCount: number, permissions: ExpensePermissions) {
  const edit = originalCount > 0 ? permissions.update : permissions.create;
  return { edit, add: edit && permissions.create };
}

function normalized(expenses: QuotationOfferExpense[]) {
  return expenses.map(expense => ({
    expenseTypeId: expense.expenseTypeId,
    description: expense.description || '',
    amount: Number(expense.amount),
    ...(expense.chargeMode ? {chargeMode:expense.chargeMode} : {}),
  }));
}

// Omitting unchanged or read-only expenses lets the API preserve the original
// records when a user corrects prices without permission to change expenses.
export function quotationExpenseUpdate(expenses: QuotationOfferExpense[], original: QuotationOfferExpense[], permissions: ExpensePermissions) {
  const capabilities = quotationExpenseCapabilities(original.length, permissions);
  const next = normalized(expenses);
  if (!capabilities.edit || expenses.length > original.length && !capabilities.add || JSON.stringify(next) === JSON.stringify(normalized(original))) return {};
  return { expenses: next };
}
