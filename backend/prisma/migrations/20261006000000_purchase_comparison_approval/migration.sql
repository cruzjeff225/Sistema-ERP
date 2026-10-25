-- Additive migration. A legacy zero is unknown, never invented as supplier availability.
ALTER TABLE "purchase_consolidation_lines" ADD COLUMN "decided_by" INTEGER, ADD COLUMN "decided_at" TIMESTAMP(3);
ALTER TABLE "purchase_quotations"
 ADD COLUMN "costs_confirmed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "conditions_confirmed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "exchange_rate_to_usd" DECIMAL(18,8), ADD COLUMN "exchange_rate_date" DATE,
 ADD COLUMN "provider_confirmation" TEXT;
ALTER TABLE "purchase_quotation_details"
 ADD COLUMN "availability_status" TEXT NOT NULL DEFAULT 'available',
 ADD COLUMN "presentation" TEXT, ADD COLUMN "units_per_pack" DECIMAL(12,4) NOT NULL DEFAULT 1,
 ADD COLUMN "presentation_price" DECIMAL(14,4), ADD COLUMN "minimum_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "purchase_quotation_details" SET "availability_status" = 'unconfirmed' WHERE "available_quantity" = 0;
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "quotation_availability_explicit" CHECK (
 ("availability_status" = 'available' AND "available_quantity" > 0) OR
 ("availability_status" IN ('unavailable','not_quoted','unconfirmed') AND "available_quantity" = 0));
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "quotation_pack_and_minimum" CHECK ("units_per_pack" > 0 AND "minimum_quantity" >= 0 AND "minimum_quantity" <= "quantity");
ALTER TABLE "purchase_quotation_expenses" ADD COLUMN "charge_mode" TEXT NOT NULL DEFAULT 'proportional';
ALTER TABLE "purchase_quotation_expenses" ADD CONSTRAINT "quotation_expense_charge_mode" CHECK ("charge_mode" IN ('fixed','proportional'));
ALTER TABLE "purchase_orders"
 ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "submitted_at" TIMESTAMP(3), ADD COLUMN "submitted_by" INTEGER,
 ADD COLUMN "approved_at" TIMESTAMP(3), ADD COLUMN "approved_by" INTEGER,
 ADD COLUMN "approved_revision" INTEGER, ADD COLUMN "review_notes" TEXT,
 ADD COLUMN "comparison_snapshot" JSONB;
-- Preserve previous authorizations. Historical approval actors/timestamps remain unknown.
UPDATE "purchase_orders" SET "approved_revision" = 1 WHERE "status" IN ('approved','sent','partially_received','received','closed');
