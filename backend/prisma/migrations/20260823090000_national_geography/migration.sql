-- Normaliza los tres registros de ejemplo anteriores al catálogo territorial oficial.
UPDATE "departments"
SET "name" = 'La Unión'
WHERE "name" = 'La Union'
  AND NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'La Unión');

UPDATE "municipalities"
SET "name" = 'La Unión Norte'
WHERE "name" = 'La Union Norte'
  AND NOT EXISTS (
    SELECT 1
    FROM "municipalities" AS m
    WHERE m."id_department" = "municipalities"."id_department"
      AND m."name" = 'La Unión Norte'
  );

UPDATE "districts"
SET "name" = 'La Unión'
WHERE "name" = 'La Union'
  AND NOT EXISTS (
    SELECT 1
    FROM "districts" AS d
    WHERE d."id_municipality" = "districts"."id_municipality"
      AND d."name" = 'La Unión'
  );

ALTER TABLE "employees"
  ADD COLUMN "id_country" INTEGER,
  ADD COLUMN "id_department" INTEGER,
  ADD COLUMN "id_municipality" INTEGER,
  ADD COLUMN "id_district" INTEGER;

UPDATE "employees" SET "id_country" = 1 WHERE "id_country" IS NULL;
ALTER TABLE "employees" ALTER COLUMN "id_country" SET NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "id_country" SET DEFAULT 1;

ALTER TABLE "customers"
  ADD COLUMN "id_country" INTEGER,
  ADD COLUMN "id_department" INTEGER,
  ADD COLUMN "id_municipality" INTEGER,
  ADD COLUMN "id_district" INTEGER;

UPDATE "customers" SET "id_country" = 1 WHERE "id_country" IS NULL;
ALTER TABLE "customers" ALTER COLUMN "id_country" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "id_country" SET DEFAULT 1;

ALTER TABLE "suppliers"
  ADD COLUMN "id_department" INTEGER,
  ADD COLUMN "id_municipality" INTEGER,
  ADD COLUMN "id_district" INTEGER;

CREATE INDEX "employees_id_country_idx" ON "employees"("id_country");
CREATE INDEX "employees_id_department_idx" ON "employees"("id_department");
CREATE INDEX "employees_id_municipality_idx" ON "employees"("id_municipality");
CREATE INDEX "employees_id_district_idx" ON "employees"("id_district");
CREATE INDEX "customers_id_country_idx" ON "customers"("id_country");
CREATE INDEX "customers_id_department_idx" ON "customers"("id_department");
CREATE INDEX "customers_id_municipality_idx" ON "customers"("id_municipality");
CREATE INDEX "customers_id_district_idx" ON "customers"("id_district");
CREATE INDEX "suppliers_id_department_idx" ON "suppliers"("id_department");
CREATE INDEX "suppliers_id_municipality_idx" ON "suppliers"("id_municipality");
CREATE INDEX "suppliers_id_district_idx" ON "suppliers"("id_district");

ALTER TABLE "employees" ADD CONSTRAINT "employees_id_country_fkey"
  FOREIGN KEY ("id_country") REFERENCES "countries"("id_country") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_id_department_fkey"
  FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_id_municipality_fkey"
  FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_id_district_fkey"
  FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_country_fkey"
  FOREIGN KEY ("id_country") REFERENCES "countries"("id_country") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_department_fkey"
  FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_municipality_fkey"
  FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_district_fkey"
  FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_department_fkey"
  FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_municipality_fkey"
  FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_district_fkey"
  FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE RESTRICT ON UPDATE CASCADE;
