-- El lote nace al confirmar la recepcion (ERS 6.9.3 y 6.9.12): primero se crea y se etiqueta, y despues se ubica.
-- PENDING_PLACEMENT = recibido y etiquetable, sin existencias ni valoracion hasta confirmar la colocacion.
ALTER TABLE "inventory_lots" DROP CONSTRAINT "inventory_lots_status_check";
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_status_check" CHECK ("status" IN ('PENDING_PLACEMENT', 'ACTIVE', 'DEPLETED', 'CANCELLED'));

-- Las recepciones que hoy esperan ubicacion reciben su lote pendiente.
INSERT INTO "inventory_lots" ("lot_code", "id_product", "id_purchase_detail", "received_at", "quantity_received", "unit_cost", "total_cost", "status")
SELECT 'LT-' || lpad(pi."id_purchase_item"::text, 6, '0'), pi."id_product", pi."id_purchase_item", p."purchase_date", pi."quantity", pi."unit_cost",
  ROUND(pi."quantity" * pi."unit_cost", 2), 'PENDING_PLACEMENT'
FROM "purchase_items" pi
JOIN "purchases" p ON p."id_purchase" = pi."id_purchase"
WHERE pi."id_location" IS NULL AND pi."quantity" > 0 AND p."status" <> 'CANCELLED' AND p."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "inventory_lots" l WHERE l."id_purchase_detail" = pi."id_purchase_item");
