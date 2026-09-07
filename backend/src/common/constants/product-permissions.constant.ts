export const PRODUCT_CATEGORY_PERMISSIONS = {
  VIEW: "categories.view",
  CREATE: "categories.create",
  UPDATE: "categories.update",
  ACTIVATE: "categories.activate",
  DEACTIVATE: "categories.deactivate",
} as const;

export const PRODUCT_SUBCATEGORY_PERMISSIONS = {
  VIEW: "subcategories.view",
  CREATE: "subcategories.create",
  UPDATE: "subcategories.update",
  ACTIVATE: "subcategories.activate",
  DEACTIVATE: "subcategories.deactivate",
} as const;

export const PRODUCT_UNIT_PERMISSIONS = {
  VIEW: "units.view",
  CREATE: "units.create",
  UPDATE: "units.update",
  ACTIVATE: "units.activate",
  DEACTIVATE: "units.deactivate",
} as const;

export const PRODUCT_PERMISSIONS = {
  VIEW: "products.view",
  CREATE: "products.create",
  UPDATE: "products.update",
  ACTIVATE: "products.activate",
  DEACTIVATE: "products.deactivate",
} as const;

export const PRODUCT_IMAGE_PERMISSIONS = {
  VIEW: "product_images.view",
  CREATE: "product_images.create",
  UPDATE: "product_images.update",
  DELETE: "product_images.delete",
  ACTIVATE: "product_images.activate",
  DEACTIVATE: "product_images.deactivate",
} as const;

export const PRODUCT_SUPPLIER_PERMISSIONS = {
  VIEW: "product_suppliers.view",
  CREATE: "product_suppliers.create",
  UPDATE: "product_suppliers.update",
  ACTIVATE: "product_suppliers.activate",
  DEACTIVATE: "product_suppliers.deactivate",
} as const;
