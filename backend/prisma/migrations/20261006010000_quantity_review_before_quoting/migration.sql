ALTER TABLE "purchase_consolidations"
  ADD COLUMN "quantity_review_status" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "quantity_revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "quantity_approved_revision" INTEGER,
  ADD COLUMN "quantity_approved_by" INTEGER,
  ADD COLUMN "quantity_approved_at" TIMESTAMP(3),
  ADD COLUMN "quantity_review_notes" TEXT;

-- Keep purchases already quoted or ordered operational, without inventing a manager's approval.
UPDATE "purchase_consolidations" c SET
  "quantity_review_status" = 'approved', "quantity_approved_revision" = 1,
  "quantity_review_notes" = 'Proceso anterior a la revisión previa de cantidades; se conserva su continuidad.'
WHERE EXISTS (SELECT 1 FROM "purchase_rfqs" r WHERE r."consolidation_id" = c.id)
   OR EXISTS (SELECT 1 FROM "purchase_orders" o WHERE o."consolidation_id" = c.id);

ALTER TABLE "purchase_consolidations" ADD CONSTRAINT "quantity_review_valid"
  CHECK ("quantity_review_status" IN ('draft','pending_review','approved','returned') AND "quantity_revision" > 0
    AND ("quantity_review_status" <> 'approved' OR ("quantity_approved_revision" IS NOT NULL AND "quantity_approved_revision" = "quantity_revision")));
