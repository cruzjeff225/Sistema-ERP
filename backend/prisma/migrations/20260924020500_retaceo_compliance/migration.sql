-- Extend purchase receipts while preserving existing rows.
ALTER TABLE "purchases"
ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "id_company" INTEGER,
ADD COLUMN "id_user" INTEGER,
ADD COLUMN "id_warehouse" INTEGER,
ADD COLUMN "notes" TEXT,
ADD COLUMN "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "supplier_invoice_date" DATE,
ADD COLUMN "supplier_invoice_number" VARCHAR(100),
ADD COLUMN "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "updated_at" TIMESTAMP(3),
ADD COLUMN "uuid" TEXT,
ALTER COLUMN "status" SET DEFAULT 'RECEIVED',
ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2);

UPDATE "purchases" p
SET "id_company" = b."id_company"
FROM "branches" b
WHERE p."id_branch" = b."id_branch";

UPDATE "purchases" p
SET "id_warehouse" = po."id_warehouse",
    "id_user" = po."id_user"
FROM "purchase_orders" po
WHERE p."id_purchase_order" = po."id_purchase_order";

UPDATE "purchases"
SET "uuid" = gen_random_uuid()::text,
    "updated_at" = COALESCE("created_at", CURRENT_TIMESTAMP),
    "subtotal" = "total"
WHERE "uuid" IS NULL;

ALTER TABLE "purchases" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "purchases" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE TABLE "retaceos" (
    "id_retaceo" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "retaceo_code" TEXT NOT NULL,
    "id_company" INTEGER NOT NULL,
    "id_supplier" INTEGER NOT NULL,
    "id_purchase" INTEGER NOT NULL,
    "id_user" INTEGER NOT NULL,
    "retaceo_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin_country" VARCHAR(100),
    "import_invoice_number" VARCHAR(100),
    "import_invoice_date" DATE,
    "import_policy_number" VARCHAR(100),
    "import_policy_date" DATE,
    "total_fob" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_dai" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "import_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "retaceos_pkey" PRIMARY KEY ("id_retaceo")
);

CREATE TABLE "retaceo_details" (
    "id_retaceo_detail" SERIAL NOT NULL,
    "id_retaceo" INTEGER NOT NULL,
    "id_purchase_item" INTEGER NOT NULL,
    "id_product" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "cost_fob" DECIMAL(14,2) NOT NULL,
    "freight_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expense_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dai_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT "retaceo_details_pkey" PRIMARY KEY ("id_retaceo_detail")
);

CREATE UNIQUE INDEX "retaceos_uuid_key" ON "retaceos"("uuid");
CREATE UNIQUE INDEX "retaceos_retaceo_code_key" ON "retaceos"("retaceo_code");
CREATE INDEX "retaceos_id_company_status_idx" ON "retaceos"("id_company", "status");
CREATE INDEX "retaceos_id_supplier_idx" ON "retaceos"("id_supplier");
CREATE INDEX "retaceos_id_user_idx" ON "retaceos"("id_user");
CREATE UNIQUE INDEX "retaceos_id_purchase_key" ON "retaceos"("id_purchase");
CREATE INDEX "retaceo_details_id_product_idx" ON "retaceo_details"("id_product");
CREATE INDEX "retaceo_details_id_purchase_item_idx" ON "retaceo_details"("id_purchase_item");
CREATE UNIQUE INDEX "retaceo_details_id_retaceo_id_purchase_item_key" ON "retaceo_details"("id_retaceo", "id_purchase_item");
CREATE UNIQUE INDEX "purchases_uuid_key" ON "purchases"("uuid");
CREATE INDEX "purchases_id_company_status_idx" ON "purchases"("id_company", "status");
CREATE INDEX "purchases_id_warehouse_idx" ON "purchases"("id_warehouse");
CREATE INDEX "purchases_id_user_idx" ON "purchases"("id_user");

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_warehouse_fkey" FOREIGN KEY ("id_warehouse") REFERENCES "warehouses"("id_warehouse") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retaceos" ADD CONSTRAINT "retaceos_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retaceos" ADD CONSTRAINT "retaceos_id_supplier_fkey" FOREIGN KEY ("id_supplier") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retaceos" ADD CONSTRAINT "retaceos_id_purchase_fkey" FOREIGN KEY ("id_purchase") REFERENCES "purchases"("id_purchase") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retaceos" ADD CONSTRAINT "retaceos_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retaceo_details" ADD CONSTRAINT "retaceo_details_id_retaceo_fkey" FOREIGN KEY ("id_retaceo") REFERENCES "retaceos"("id_retaceo") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retaceo_details" ADD CONSTRAINT "retaceo_details_id_purchase_item_fkey" FOREIGN KEY ("id_purchase_item") REFERENCES "purchase_items"("id_purchase_item") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retaceo_details" ADD CONSTRAINT "retaceo_details_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE SEQUENCE IF NOT EXISTS "retaceo_code_seq" START WITH 1;
