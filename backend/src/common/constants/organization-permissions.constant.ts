export const COMPANY_PERMISSIONS = {
  VIEW: "companies.view",
  CREATE: "companies.create",
  UPDATE: "companies.update",
  ACTIVATE: "companies.activate",
  DEACTIVATE: "companies.deactivate",
} as const;

export const BRANCH_PERMISSIONS = {
  VIEW: "branches.view",
  CREATE: "branches.create",
  UPDATE: "branches.update",
  ACTIVATE: "branches.activate",
  DEACTIVATE: "branches.deactivate",
} as const;

export const WAREHOUSE_CATEGORY_PERMISSIONS = {
  VIEW: "warehouse_categories.view",
  CREATE: "warehouse_categories.create",
  UPDATE: "warehouse_categories.update",
  DEACTIVATE: "warehouse_categories.deactivate",
} as const;

export const WAREHOUSE_PERMISSIONS = {
  VIEW: "warehouses.view",
  CREATE: "warehouses.create",
  UPDATE: "warehouses.update",
  ACTIVATE: "warehouses.activate",
  DEACTIVATE: "warehouses.deactivate",
} as const;

export const LOCATION_PERMISSIONS = {
  VIEW: "locations.view",
  CREATE: "locations.create",
  UPDATE: "locations.update",
  ACTIVATE: "locations.activate",
  DEACTIVATE: "locations.deactivate",
} as const;
