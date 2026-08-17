export const SUPPLIER_PERMISSIONS = {
  VIEW: "suppliers.view",
  CREATE: "suppliers.create",
  UPDATE: "suppliers.update",
  ACTIVATE: "suppliers.activate",
  DEACTIVATE: "suppliers.deactivate",
} as const;

export const SUPPLIER_CONTACT_PERMISSIONS = {
  VIEW: "supplier_contacts.view",
  CREATE: "supplier_contacts.create",
  UPDATE: "supplier_contacts.update",
  ACTIVATE: "supplier_contacts.activate",
  DEACTIVATE: "supplier_contacts.deactivate",
} as const;
