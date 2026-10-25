-- Módulo de Inventario (ERS 6.9): lotes, saldos por ubicación, Kardex, costo promedio,
-- etiquetas y traslados por lote. Los saldos y movimientos existentes se conservan.

-- Ubicaciones de tipo vehículo (mercancía en tránsito).
ALTER TABLE "locations" ADD COLUMN "location_type" TEXT NOT NULL DEFAULT 'STORAGE';
ALTER TABLE "locations" ADD COLUMN "id_vehicle" INTEGER;
ALTER TABLE "locations" ADD CONSTRAINT "locations_id_vehicle_fkey" FOREIGN KEY ("id_vehicle") REFERENCES "vehicles"("id_vehicle") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_type_check" CHECK ("location_type" IN ('STORAGE', 'VEHICLE'));
CREATE INDEX "locations_id_vehicle_idx" ON "locations"("id_vehicle");

-- Lotes
CREATE TABLE "inventory_lots" (
  "id_inventory_lot" SERIAL PRIMARY KEY,
  "lot_code" TEXT NOT NULL,
  "id_product" INTEGER NOT NULL,
  "id_purchase_detail" INTEGER,
  "received_at" TIMESTAMP(3) NOT NULL,
  "quantity_received" DECIMAL(12,2) NOT NULL,
  "unit_cost" DECIMAL(14,4) NOT NULL,
  "total_cost" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_lots_quantity_check" CHECK ("quantity_received" > 0),
  CONSTRAINT "inventory_lots_status_check" CHECK ("status" IN ('ACTIVE', 'DEPLETED', 'CANCELLED')),
  CONSTRAINT "inventory_lots_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_lots_id_purchase_detail_fkey" FOREIGN KEY ("id_purchase_detail") REFERENCES "purchase_items"("id_purchase_item") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_lots_lot_code_key" ON "inventory_lots"("lot_code");
CREATE INDEX "inventory_lots_id_product_received_at_idx" ON "inventory_lots"("id_product", "received_at");
CREATE INDEX "inventory_lots_id_purchase_detail_idx" ON "inventory_lots"("id_purchase_detail");

-- Saldo por lote y ubicación
CREATE TABLE "inventory_location_details" (
  "id_inventory_location_detail" SERIAL PRIMARY KEY,
  "id_inventory_lot" INTEGER NOT NULL,
  "id_location" INTEGER NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_location_details_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "inventory_location_details_id_inventory_lot_fkey" FOREIGN KEY ("id_inventory_lot") REFERENCES "inventory_lots"("id_inventory_lot") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_location_details_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "locations"("id_location") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_location_details_id_inventory_lot_id_location_key" ON "inventory_location_details"("id_inventory_lot", "id_location");
CREATE INDEX "inventory_location_details_id_location_idx" ON "inventory_location_details"("id_location");

-- Costo promedio por empresa y producto
CREATE TABLE "inventory_cost_averages" (
  "id_inventory_cost_average" SERIAL PRIMARY KEY,
  "id_company" INTEGER NOT NULL,
  "id_product" INTEGER NOT NULL,
  "quantity_on_hand" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "inventory_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "average_unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_cost_averages_quantity_check" CHECK ("quantity_on_hand" >= 0),
  CONSTRAINT "inventory_cost_averages_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_cost_averages_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_cost_averages_id_company_id_product_key" ON "inventory_cost_averages"("id_company", "id_product");
CREATE INDEX "inventory_cost_averages_id_product_idx" ON "inventory_cost_averages"("id_product");

-- Impresión de etiquetas
CREATE TABLE "inventory_label_prints" (
  "id_inventory_label_print" SERIAL PRIMARY KEY,
  "id_inventory_lot" INTEGER NOT NULL,
  "quantity_printed" INTEGER NOT NULL,
  "print_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "id_user" INTEGER NOT NULL,
  "reprint_reason" TEXT,
  CONSTRAINT "inventory_label_prints_quantity_check" CHECK ("quantity_printed" > 0),
  CONSTRAINT "inventory_label_prints_id_inventory_lot_fkey" FOREIGN KEY ("id_inventory_lot") REFERENCES "inventory_lots"("id_inventory_lot") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_label_prints_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "inventory_label_prints_id_inventory_lot_idx" ON "inventory_label_prints"("id_inventory_lot");
CREATE INDEX "inventory_label_prints_id_user_idx" ON "inventory_label_prints"("id_user");

-- Respaldo de existencias: un lote por recepción ya ubicada, con el costo final del retaceo cerrado si existe.
INSERT INTO "inventory_lots" ("lot_code", "id_product", "id_purchase_detail", "received_at", "quantity_received", "unit_cost", "total_cost", "status")
SELECT 'LT-' || lpad(pi."id_purchase_item"::text, 6, '0'), pi."id_product", pi."id_purchase_item",
  COALESCE(pi."placed_at", p."purchase_date"), pi."quantity",
  COALESCE(rd."unit_cost", pi."unit_cost"), ROUND(pi."quantity" * COALESCE(rd."unit_cost", pi."unit_cost"), 2), 'ACTIVE'
FROM "purchase_items" pi
JOIN "purchases" p ON p."id_purchase" = pi."id_purchase"
LEFT JOIN LATERAL (
  SELECT d."unit_cost" FROM "retaceo_details" d JOIN "retaceos" r ON r."id_retaceo" = d."id_retaceo"
  WHERE d."id_purchase_item" = pi."id_purchase_item" AND r."status" = 'closed' AND r."deleted_at" IS NULL
  ORDER BY d."id_retaceo_detail" DESC LIMIT 1
) rd ON TRUE
WHERE pi."quantity" > 0 AND EXISTS (SELECT 1 FROM "inventory_movements" m WHERE m."purchase_item_id" = pi."id_purchase_item" AND m."type" = 'RECEIPT');

-- Distribuye cada saldo (producto, ubicación) entre los lotes del producto, del más antiguo al más reciente.
-- Lo que no se explica con una recepción queda en un lote de apertura por producto.
DO $$
DECLARE s RECORD; l RECORD; remaining NUMERIC; take NUMERIC; opening INTEGER;
BEGIN
  CREATE TEMP TABLE lot_free ON COMMIT DROP AS SELECT "id_inventory_lot" AS lot_id, "id_product" AS product_id, "quantity_received" AS free FROM "inventory_lots";
  FOR s IN SELECT "id_product", "id_location", "quantity" FROM "inventory_stocks" WHERE "quantity" > 0 ORDER BY "id_inventory_stock" LOOP
    remaining := s."quantity";
    FOR l IN SELECT lot_id, free FROM lot_free WHERE product_id = s."id_product" AND free > 0 ORDER BY lot_id LOOP
      EXIT WHEN remaining <= 0;
      take := LEAST(remaining, l.free);
      INSERT INTO "inventory_location_details" ("id_inventory_lot", "id_location", "quantity", "updated_at") VALUES (l.lot_id, s."id_location", take, now())
        ON CONFLICT ("id_inventory_lot", "id_location") DO UPDATE SET "quantity" = "inventory_location_details"."quantity" + EXCLUDED."quantity";
      UPDATE lot_free SET free = free - take WHERE lot_id = l.lot_id;
      remaining := remaining - take;
    END LOOP;
    IF remaining > 0 THEN
      INSERT INTO "inventory_lots" ("lot_code", "id_product", "received_at", "quantity_received", "unit_cost", "total_cost", "status")
        SELECT 'LT-INI-' || lpad(s."id_product"::text, 5, '0'), s."id_product", now(), remaining, pr."unit_cost", ROUND(remaining * pr."unit_cost", 2), 'ACTIVE'
        FROM "products" pr WHERE pr."id_product" = s."id_product"
        ON CONFLICT ("lot_code") DO UPDATE SET "quantity_received" = "inventory_lots"."quantity_received" + EXCLUDED."quantity_received",
          "total_cost" = ROUND(("inventory_lots"."quantity_received" + EXCLUDED."quantity_received") * "inventory_lots"."unit_cost", 2)
        RETURNING "id_inventory_lot" INTO opening;
      INSERT INTO "inventory_location_details" ("id_inventory_lot", "id_location", "quantity", "updated_at") VALUES (opening, s."id_location", remaining, now())
        ON CONFLICT ("id_inventory_lot", "id_location") DO UPDATE SET "quantity" = "inventory_location_details"."quantity" + EXCLUDED."quantity";
    END IF;
  END LOOP;
END $$;

-- Saldo valorizado inicial por empresa y producto.
INSERT INTO "inventory_cost_averages" ("id_company", "id_product", "quantity_on_hand", "inventory_value", "average_unit_cost", "updated_at")
SELECT pr."id_company", lot."id_product", SUM(ld."quantity"), ROUND(SUM(ld."quantity" * lot."unit_cost"), 2),
  ROUND(SUM(ld."quantity" * lot."unit_cost") / SUM(ld."quantity"), 4), now()
FROM "inventory_location_details" ld
JOIN "inventory_lots" lot ON lot."id_inventory_lot" = ld."id_inventory_lot"
JOIN "products" pr ON pr."id_product" = lot."id_product"
WHERE ld."quantity" > 0
GROUP BY pr."id_company", lot."id_product";

-- Movimientos: de un saldo con signo a entradas/salidas con lote, almacén, costo y documento de origen.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_type_check";
ALTER TABLE "inventory_movements" RENAME COLUMN "id" TO "id_inventory_movement";
ALTER TABLE "inventory_movements" RENAME COLUMN "type" TO "movement_type";
ALTER TABLE "inventory_movements" RENAME COLUMN "user_id" TO "id_user";
ALTER TABLE "inventory_movements" RENAME CONSTRAINT "inventory_movements_user_id_fkey" TO "inventory_movements_id_user_fkey";
ALTER TABLE "inventory_movements" ADD COLUMN "id_product" INTEGER;
ALTER TABLE "inventory_movements" ADD COLUMN "id_inventory_lot" INTEGER;
ALTER TABLE "inventory_movements" ADD COLUMN "id_warehouse" INTEGER;
ALTER TABLE "inventory_movements" ADD COLUMN "id_location" INTEGER;
ALTER TABLE "inventory_movements" ADD COLUMN "movement_date" TIMESTAMP(3);
ALTER TABLE "inventory_movements" ADD COLUMN "quantity_in" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_movements" ADD COLUMN "quantity_out" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_movements" ADD COLUMN "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_movements" ADD COLUMN "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_movements" ADD COLUMN "reference_type" TEXT;
ALTER TABLE "inventory_movements" ADD COLUMN "reference_id" INTEGER;

UPDATE "inventory_movements" m SET
  "id_product" = st."id_product", "id_location" = st."id_location", "id_warehouse" = loc."id_warehouse",
  "movement_date" = m."created_at",
  "quantity_in" = GREATEST(m."quantity", 0), "quantity_out" = GREATEST(-m."quantity", 0),
  "unit_cost" = pr."unit_cost", "total_cost" = ROUND(ABS(m."quantity") * pr."unit_cost", 2),
  "reference_type" = CASE WHEN m."purchase_item_id" IS NOT NULL THEN 'purchase_detail'
                          WHEN m."movement_type" LIKE 'TRANSFER_%' THEN 'transfer' ELSE 'adjustment' END,
  "reference_id" = m."purchase_item_id"
FROM "inventory_stocks" st
JOIN "locations" loc ON loc."id_location" = st."id_location"
JOIN "products" pr ON pr."id_product" = st."id_product"
WHERE st."id_inventory_stock" = m."stock_id";

-- Las recepciones y reversiones conservan el lote y el costo con el que se valoraron.
UPDATE "inventory_movements" m SET
  "id_inventory_lot" = lot."id_inventory_lot", "unit_cost" = lot."unit_cost",
  "total_cost" = ROUND((m."quantity_in" + m."quantity_out") * lot."unit_cost", 2)
FROM "inventory_lots" lot
WHERE m."reference_type" = 'purchase_detail' AND lot."id_purchase_detail" = m."reference_id";

ALTER TABLE "inventory_movements" DROP COLUMN "stock_id";
ALTER TABLE "inventory_movements" DROP COLUMN "quantity";
ALTER TABLE "inventory_movements" DROP COLUMN "purchase_item_id";
ALTER TABLE "inventory_movements" ALTER COLUMN "id_product" SET NOT NULL;
ALTER TABLE "inventory_movements" ALTER COLUMN "id_warehouse" SET NOT NULL;
ALTER TABLE "inventory_movements" ALTER COLUMN "movement_date" SET NOT NULL;
ALTER TABLE "inventory_movements" ALTER COLUMN "movement_date" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "inventory_movements" ALTER COLUMN "reference_type" SET NOT NULL;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_type_check" CHECK ("movement_type" IN ('OPENING', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RETURN'));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantities_check" CHECK ("quantity_in" >= 0 AND "quantity_out" >= 0 AND ("quantity_in" = 0 OR "quantity_out" = 0));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_id_inventory_lot_fkey" FOREIGN KEY ("id_inventory_lot") REFERENCES "inventory_lots"("id_inventory_lot") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "locations"("id_location") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX IF EXISTS "inventory_movements_stock_id_id_idx";
DROP INDEX IF EXISTS "inventory_movements_purchase_item_id_idx";
DROP INDEX IF EXISTS "inventory_movements_user_id_idx";
CREATE INDEX "inventory_movements_id_product_movement_date_idx" ON "inventory_movements"("id_product", "movement_date");
CREATE INDEX "inventory_movements_id_inventory_lot_idx" ON "inventory_movements"("id_inventory_lot");
CREATE INDEX "inventory_movements_id_warehouse_idx" ON "inventory_movements"("id_warehouse");
CREATE INDEX "inventory_movements_id_location_idx" ON "inventory_movements"("id_location");
CREATE INDEX "inventory_movements_id_user_idx" ON "inventory_movements"("id_user");
CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

-- Traslados: tablas y columnas del modelo de inventario.
ALTER TABLE "transfers" RENAME TO "inventory_transfers";
ALTER TABLE "inventory_transfers" RENAME COLUMN "id_transfer" TO "id_inventory_transfer";
ALTER TABLE "inventory_transfers" RENAME COLUMN "document_number" TO "transfer_code";
ALTER TABLE "inventory_transfers" RENAME COLUMN "id_from_warehouse" TO "id_source_warehouse";
ALTER TABLE "inventory_transfers" RENAME COLUMN "id_to_warehouse" TO "id_destination_warehouse";
ALTER TABLE "inventory_transfers" RENAME COLUMN "company_id" TO "id_company";
ALTER TABLE "inventory_transfers" RENAME COLUMN "user_id" TO "id_user";
ALTER TABLE "inventory_transfers" ADD COLUMN "transfer_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "inventory_transfers" ADD COLUMN "id_vehicle_location" INTEGER;
ALTER TABLE "inventory_transfers" ADD COLUMN "notes" TEXT;
UPDATE "inventory_transfers" SET "transfer_date" = "created_at";
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_id_vehicle_location_fkey" FOREIGN KEY ("id_vehicle_location") REFERENCES "locations"("id_location") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER INDEX "transfers_pkey" RENAME TO "inventory_transfers_pkey";
ALTER INDEX "transfers_document_number_key" RENAME TO "inventory_transfers_transfer_code_key";
ALTER INDEX "transfers_uuid_key" RENAME TO "inventory_transfers_uuid_key";
ALTER INDEX "transfers_id_from_warehouse_idx" RENAME TO "inventory_transfers_id_source_warehouse_idx";
ALTER INDEX "transfers_id_to_warehouse_idx" RENAME TO "inventory_transfers_id_destination_warehouse_idx";
CREATE INDEX "inventory_transfers_id_vehicle_location_idx" ON "inventory_transfers"("id_vehicle_location");

ALTER TABLE "transfer_items" RENAME TO "inventory_transfer_details";
ALTER TABLE "inventory_transfer_details" RENAME COLUMN "id_transfer_item" TO "id_inventory_transfer_detail";
ALTER TABLE "inventory_transfer_details" RENAME COLUMN "id_transfer" TO "id_inventory_transfer";
ALTER TABLE "inventory_transfer_details" RENAME COLUMN "id_from_location" TO "id_source_location";
ALTER TABLE "inventory_transfer_details" RENAME COLUMN "id_to_location" TO "id_destination_location";
ALTER TABLE "inventory_transfer_details" RENAME COLUMN "quantity" TO "quantity_dispatched";
ALTER TABLE "inventory_transfer_details" RENAME COLUMN "received_quantity" TO "quantity_received";
ALTER TABLE "inventory_transfer_details" ADD COLUMN "id_inventory_lot" INTEGER;
ALTER TABLE "inventory_transfer_details" ADD COLUMN "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_transfer_details" ADD COLUMN "notes" TEXT;
ALTER TABLE "inventory_transfer_details" ADD CONSTRAINT "inventory_transfer_details_id_inventory_lot_fkey" FOREIGN KEY ("id_inventory_lot") REFERENCES "inventory_lots"("id_inventory_lot") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transfer_details" RENAME CONSTRAINT "transfer_items_id_product_fkey" TO "inventory_transfer_details_id_product_fkey";
ALTER TABLE "inventory_transfer_details" RENAME CONSTRAINT "transfer_items_id_transfer_fkey" TO "inventory_transfer_details_id_inventory_transfer_fkey";
ALTER TABLE "inventory_transfer_details" RENAME CONSTRAINT "transfer_items_request_detail_id_fkey" TO "inventory_transfer_details_request_detail_id_fkey";
ALTER INDEX "transfer_items_pkey" RENAME TO "inventory_transfer_details_pkey";
ALTER INDEX "transfer_items_id_from_location_idx" RENAME TO "inventory_transfer_details_id_source_location_idx";
ALTER INDEX "transfer_items_id_to_location_idx" RENAME TO "inventory_transfer_details_id_destination_location_idx";
ALTER INDEX "transfer_items_id_product_idx" RENAME TO "inventory_transfer_details_id_product_idx";
ALTER INDEX "transfer_items_id_transfer_idx" RENAME TO "inventory_transfer_details_id_inventory_transfer_idx";
CREATE INDEX "inventory_transfer_details_id_inventory_lot_idx" ON "inventory_transfer_details"("id_inventory_lot");
