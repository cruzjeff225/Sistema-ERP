ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stock_nonnegative" CHECK (quantity >= 0);
CREATE TABLE "inventory_movements" (
  "id" SERIAL PRIMARY KEY,
  "stock_id" INTEGER NOT NULL REFERENCES "inventory_stocks"("id_inventory_stock"),
  "user_id" INTEGER REFERENCES "users"("id"),
  "purchase_item_id" INTEGER REFERENCES "purchase_items"("id_purchase_item"),
  "key" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL CHECK (type IN ('OPENING', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT')),
  "quantity" DECIMAL(12,2) NOT NULL,
  "balance" DECIMAL(12,2) NOT NULL CHECK (balance >= 0),
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "inventory_movements_stock_id_id_idx" ON "inventory_movements"("stock_id", "id");
CREATE INDEX "inventory_movements_purchase_item_id_idx" ON "inventory_movements"("purchase_item_id");
CREATE INDEX "inventory_movements_user_id_idx" ON "inventory_movements"("user_id");
-- Preserve existing stock without replaying historic receipts.
INSERT INTO "inventory_movements" (stock_id, key, type, quantity, balance, reason)
SELECT id_inventory_stock, 'opening:' || id_inventory_stock, 'OPENING', quantity, quantity, 'Saldo de apertura al habilitar inventario'
FROM inventory_stocks WHERE quantity <> 0;
INSERT INTO modules (name, description, is_active, updated_at)
VALUES ('inventory', 'Existencias, kardex y ajustes', true, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET is_active = true, deleted_at = NULL;
INSERT INTO permissions (action, name, module_id, is_active, is_system, updated_at)
SELECT p.action, p.name, m.id, true, true, CURRENT_TIMESTAMP
FROM modules m CROSS JOIN (VALUES ('inventory.view', 'Consultar inventario y kardex'), ('inventory.adjust', 'Registrar ajustes de inventario')) AS p(action, name)
WHERE m.name = 'inventory'
ON CONFLICT (action) DO UPDATE SET is_active = true, deleted_at = NULL;
