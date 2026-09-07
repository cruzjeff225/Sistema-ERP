CREATE TABLE "employees" (
  "id_employee" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "email" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id_employee")
);

CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

ALTER TABLE "users"
  ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "id_employee" INTEGER;

INSERT INTO "employees" ("code", "full_name", "email", "updated_at")
SELECT 'EMP-' || LPAD("id"::TEXT, 6, '0'), "username", "email", CURRENT_TIMESTAMP
FROM "users";

UPDATE "users" AS u
SET "id_employee" = e."id_employee"
FROM "employees" AS e
WHERE e."email" = u."email";

ALTER TABLE "users" ALTER COLUMN "id_employee" SET NOT NULL;
CREATE UNIQUE INDEX "users_id_employee_key" ON "users"("id_employee");
ALTER TABLE "users" ADD CONSTRAINT "users_id_employee_fkey"
  FOREIGN KEY ("id_employee") REFERENCES "employees"("id_employee") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "logs_created_at_idx" ON "logs"("created_at");

CREATE TABLE "countries" (
  "id_country" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "iso_code" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "countries_pkey" PRIMARY KEY ("id_country")
);

CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");
CREATE UNIQUE INDEX "countries_iso_code_key" ON "countries"("iso_code");

INSERT INTO "countries" ("id_country", "name", "iso_code", "updated_at") VALUES
  (1, 'El Salvador', 'SV', CURRENT_TIMESTAMP),
  (2, 'Guatemala', 'GT', CURRENT_TIMESTAMP),
  (3, 'Honduras', 'HN', CURRENT_TIMESTAMP),
  (4, 'Nicaragua', 'NI', CURRENT_TIMESTAMP),
  (5, 'Costa Rica', 'CR', CURRENT_TIMESTAMP),
  (6, 'Panama', 'PA', CURRENT_TIMESTAMP),
  (7, 'Estados Unidos', 'US', CURRENT_TIMESTAMP)
ON CONFLICT ("id_country") DO NOTHING;

SELECT setval(pg_get_serial_sequence('"countries"', 'id_country'), COALESCE((SELECT MAX("id_country") FROM "countries"), 1), true);

ALTER TABLE "suppliers"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "id_country" INTEGER,
  ADD COLUMN "website" TEXT;

UPDATE "suppliers"
SET
  "code" = COALESCE(NULLIF("document", ''), 'SUP-' || LPAD("id_supplier"::TEXT, 6, '0')),
  "id_country" = 1;

DROP INDEX IF EXISTS "suppliers_document_key";
ALTER TABLE "suppliers" DROP COLUMN "document";
ALTER TABLE "suppliers" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "id_country" SET NOT NULL;

CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");
CREATE INDEX "suppliers_id_country_idx" ON "suppliers"("id_country");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_country_fkey"
  FOREIGN KEY ("id_country") REFERENCES "countries"("id_country") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "suppliers_contacts" (
  "id_supplier_contact" SERIAL NOT NULL,
  "id_supplier" INTEGER NOT NULL,
  "full_name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "suppliers_contacts_pkey" PRIMARY KEY ("id_supplier_contact")
);

CREATE INDEX "suppliers_contacts_id_supplier_idx" ON "suppliers_contacts"("id_supplier");
CREATE INDEX "suppliers_contacts_full_name_idx" ON "suppliers_contacts"("full_name");
ALTER TABLE "suppliers_contacts" ADD CONSTRAINT "suppliers_contacts_id_supplier_fkey"
  FOREIGN KEY ("id_supplier") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;
