BEGIN;

-- Abort instead of fabricating an origin for legacy documents.
ALTER TABLE "purchases" ALTER COLUMN "id_purchase_order" SET NOT NULL;
ALTER TABLE "purchase_items" ALTER COLUMN "id_purchase_order_detail" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "id_purchase_quotation" SET NOT NULL;
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_id_purchase_quotation_fkey";
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_purchase_quotation_fkey" FOREIGN KEY ("id_purchase_quotation") REFERENCES "purchase_quotations"("id_purchase_quotation") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_id_purchase_order_fkey";
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_purchase_order_fkey" FOREIGN KEY ("id_purchase_order") REFERENCES "purchase_orders"("id_purchase_order") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_id_purchase_order_detail_fkey";
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_id_purchase_order_detail_fkey" FOREIGN KEY ("id_purchase_order_detail") REFERENCES "purchase_order_details"("id_purchase_order_detail") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_items"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(14,4),
  ADD COLUMN "quantity_ordered" DECIMAL(12,2),
  ADD COLUMN "received_before" DECIMAL(12,2),
  ADD COLUMN "id_unit" INTEGER,
  ADD COLUMN "unit_price" DECIMAL(14,4),
  ADD COLUMN "discount" DECIMAL(14,2),
  ADD COLUMN "tax_rate" DECIMAL(5,2),
  ADD COLUMN "tax_amount" DECIMAL(14,2),
  ADD COLUMN "total" DECIMAL(14,2);

-- Existing headers remain authoritative. Single-line receipts have unambiguous
-- taxes/discounts; multi-line receipts with zero taxes/discounts do as well.
-- Unknown historical allocations must be reviewed, not guessed by migration.
UPDATE "purchase_items" i SET
  "quantity_ordered" = d."quantity", "id_unit" = d."id_unit", "unit_price" = d."unit_price",
  "discount" = CASE WHEN p."discount" = 0 OR (SELECT COUNT(*) FROM "purchase_items" x WHERE x."id_purchase" = p."id_purchase") = 1 THEN p."discount" END,
  "tax_rate" = CASE WHEN p."tax" = 0 THEN 0 ELSE d."tax_rate" END,
  "tax_amount" = CASE WHEN p."tax" = 0 OR (SELECT COUNT(*) FROM "purchase_items" x WHERE x."id_purchase" = p."id_purchase") = 1 THEN p."tax" END
FROM "purchase_order_details" d, "purchases" p
WHERE d."id_purchase_order_detail" = i."id_purchase_order_detail" AND p."id_purchase" = i."id_purchase";
UPDATE "purchase_items" SET "total" = "line_total" + "tax_amount";

ALTER TABLE "purchase_items"
  ALTER COLUMN "quantity_ordered" SET NOT NULL,
  ALTER COLUMN "id_unit" SET NOT NULL,
  ALTER COLUMN "unit_price" SET NOT NULL,
  ALTER COLUMN "discount" SET NOT NULL,
  ALTER COLUMN "tax_rate" SET NOT NULL,
  ALTER COLUMN "tax_amount" SET NOT NULL,
  ALTER COLUMN "total" SET NOT NULL;
CREATE INDEX "purchase_items_id_unit_idx" ON "purchase_items"("id_unit");
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_id_unit_fkey" FOREIGN KEY ("id_unit") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ERS 6.8.30: subtotal is net of line discounts. Preserve total, tax and expenses.
UPDATE "purchase_orders" o SET "subtotal" = (SELECT COALESCE(SUM(d."subtotal"),0) FROM "purchase_order_details" d WHERE d."id_purchase_order" = o."id_purchase_order");

COMMIT;
