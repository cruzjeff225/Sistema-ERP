export const PURCHASE_REQUEST_PERMISSIONS = {
  VIEW: "purchase_requests.view",
  CREATE: "purchase_requests.create",
  UPDATE: "purchase_requests.update",
  APPROVE: "purchase_requests.approve",
  REJECT: "purchase_requests.reject",
  CANCEL: "purchase_requests.cancel",
} as const;

export const PURCHASE_QUOTATION_PERMISSIONS = {
  VIEW: "purchase_quotations.view",
  CREATE: "purchase_quotations.create",
  UPDATE: "purchase_quotations.update",
  SELECT: "purchase_quotations.select",
  REJECT: "purchase_quotations.reject",
  CANCEL: "purchase_quotations.cancel",
} as const;

export const PURCHASE_ORDER_PERMISSIONS = {
  VIEW: "purchase_orders.view",
  CREATE: "purchase_orders.create",
  UPDATE: "purchase_orders.update",
  APPROVE: "purchase_orders.approve",
  CANCEL: "purchase_orders.cancel",
  SEND: "purchase_orders.send",
  RECEIVE: "purchase_orders.receive",
} as const;

export const EXPENSE_TYPE_PERMISSIONS = {
  VIEW: "expense_types.view",
  CREATE: "expense_types.create",
  UPDATE: "expense_types.update",
  ACTIVATE: "expense_types.activate",
  DEACTIVATE: "expense_types.deactivate",
} as const;

export const PURCHASE_EXPENSE_PERMISSIONS = {
  VIEW: "purchase_expenses.view",
  CREATE: "purchase_expenses.create",
  UPDATE: "purchase_expenses.update",
} as const;

export const PURCHASE_PERMISSIONS = {
  VIEW: "purchases.view",
  CREATE: "purchases.create",
  UPDATE: "purchases.update",
  CANCEL: "purchases.cancel",
  CLOSE: "purchases.close",
} as const;

export const RETACEO_PERMISSIONS = {
  VIEW: "retaceos.view",
  CREATE: "retaceos.create",
  UPDATE: "retaceos.update",
  CALCULATE: "retaceos.calculate",
  VERIFY: "retaceos.verify",
  CLOSE: "retaceos.close",
  CANCEL: "retaceos.cancel",
} as const;
