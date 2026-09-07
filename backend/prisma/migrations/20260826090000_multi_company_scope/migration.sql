CREATE TABLE "users_companies" (
  "id" SERIAL NOT NULL,
  "id_user" INTEGER NOT NULL,
  "id_company" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_companies_id_user_id_company_key" ON "users_companies"("id_user", "id_company");
CREATE INDEX "users_companies_id_company_idx" ON "users_companies"("id_company");
ALTER TABLE "users_companies" ADD CONSTRAINT "users_companies_id_user_fkey"
  FOREIGN KEY ("id_user") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users_companies" ADD CONSTRAINT "users_companies_id_company_fkey"
  FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD COLUMN "id_company" INTEGER;
ALTER TABLE "customers" ADD COLUMN "id_company" INTEGER;
ALTER TABLE "products" ADD COLUMN "id_company" INTEGER;

WITH default_company AS (
  SELECT "id_company" FROM "companies" WHERE "deleted_at" IS NULL ORDER BY "id_company" LIMIT 1
)
UPDATE "suppliers" SET "id_company" = (SELECT "id_company" FROM default_company) WHERE "id_company" IS NULL;

WITH default_company AS (
  SELECT "id_company" FROM "companies" WHERE "deleted_at" IS NULL ORDER BY "id_company" LIMIT 1
)
UPDATE "customers" SET "id_company" = (SELECT "id_company" FROM default_company) WHERE "id_company" IS NULL;

WITH default_company AS (
  SELECT "id_company" FROM "companies" WHERE "deleted_at" IS NULL ORDER BY "id_company" LIMIT 1
)
UPDATE "products" SET "id_company" = (SELECT "id_company" FROM default_company) WHERE "id_company" IS NULL;

ALTER TABLE "suppliers" ALTER COLUMN "id_company" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "id_company" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "id_company" SET NOT NULL;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_company_fkey"
  FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_company_fkey"
  FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_id_company_fkey"
  FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "suppliers_code_key";
DROP INDEX IF EXISTS "customers_document_key";
DROP INDEX IF EXISTS "products_sku_key";
DROP INDEX IF EXISTS "products_internal_code_key";

CREATE UNIQUE INDEX "suppliers_id_company_code_key" ON "suppliers"("id_company", "code");
CREATE INDEX "suppliers_id_company_idx" ON "suppliers"("id_company");
CREATE UNIQUE INDEX "customers_id_company_document_key" ON "customers"("id_company", "document");
CREATE INDEX "customers_id_company_idx" ON "customers"("id_company");
CREATE UNIQUE INDEX "products_id_company_sku_key" ON "products"("id_company", "sku");
CREATE UNIQUE INDEX "products_id_company_internal_code_key" ON "products"("id_company", "internal_code");
CREATE INDEX "products_id_company_idx" ON "products"("id_company");

ALTER TABLE "suppliers_contacts"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notes" TEXT;
CREATE UNIQUE INDEX "suppliers_contacts_one_primary_idx"
  ON "suppliers_contacts"("id_supplier")
  WHERE "is_primary" AND "is_active" AND "deleted_at" IS NULL;

INSERT INTO "users_companies" ("id_user", "id_company")
SELECT "users"."id", "companies"."id_company"
FROM "users"
CROSS JOIN "companies"
WHERE "users"."deleted_at" IS NULL AND "companies"."deleted_at" IS NULL
ON CONFLICT ("id_user", "id_company") DO NOTHING;
