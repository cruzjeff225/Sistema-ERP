-- ERS RN-PRO-004/005: identifiers are unique across the system.
-- Fail on collisions rather than silently renaming existing business data.
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "products_internal_code_key" ON "products"("internal_code");

-- Preserve definitions and assignments; future modules are not operational in v0.9.
UPDATE "permissions" SET "is_active" = false, "deleted_at" = CURRENT_TIMESTAMP
WHERE "module_id" IN (SELECT "id" FROM "modules" WHERE "name" IN
  ('customers', 'inventory', 'quotations', 'sales', 'transfers', 'vehicles', 'drivers'));
UPDATE "modules" SET "is_active" = false, "deleted_at" = CURRENT_TIMESTAMP
WHERE "name" IN ('customers', 'inventory', 'quotations', 'sales', 'transfers', 'vehicles', 'drivers');
