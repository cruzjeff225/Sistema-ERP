ALTER TABLE "inventory_stocks" ALTER COLUMN "quantity" TYPE DECIMAL(12,2);
ALTER TABLE "purchase_items" ALTER COLUMN "quantity" TYPE DECIMAL(12,2);
DROP INDEX "retaceos_id_purchase_key";
CREATE INDEX "retaceos_id_purchase_idx" ON "retaceos"("id_purchase");
CREATE UNIQUE INDEX "retaceos_active_purchase_key" ON "retaceos"("id_purchase")
  WHERE "deleted_at" IS NULL AND "status" <> 'cancelled';
