CREATE TABLE "departments" (
  "id_department" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id_department")
);

CREATE TABLE "municipalities" (
  "id_municipality" SERIAL NOT NULL,
  "id_department" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id_municipality")
);

CREATE TABLE "districts" (
  "id_district" SERIAL NOT NULL,
  "id_municipality" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "districts_pkey" PRIMARY KEY ("id_district")
);

CREATE TABLE "companies" (
  "id_company" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "commercial_name" TEXT NOT NULL,
  "nit" TEXT NOT NULL,
  "nrc" TEXT NOT NULL,
  "commercial_line_1" TEXT,
  "commercial_line_2" TEXT,
  "commercial_line_3" TEXT,
  "address" TEXT NOT NULL,
  "id_department" INTEGER NOT NULL,
  "id_municipality" INTEGER NOT NULL,
  "id_district" INTEGER NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "web_site" TEXT,
  "logo" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id_company")
);

CREATE TABLE "branches" (
  "id_branch" SERIAL NOT NULL,
  "id_company" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "id_department" INTEGER NOT NULL,
  "id_municipality" INTEGER NOT NULL,
  "id_district" INTEGER NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id_branch")
);

CREATE TABLE "warehouse_category" (
  "id_warehouse_category" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "warehouse_category_pkey" PRIMARY KEY ("id_warehouse_category")
);

CREATE TABLE "warehouses" (
  "id_warehouse" SERIAL NOT NULL,
  "id_branch" INTEGER NOT NULL,
  "id_warehouse_category" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id_warehouse")
);

CREATE TABLE "locations" (
  "id_location" SERIAL NOT NULL,
  "id_warehouse" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "aisle" TEXT NOT NULL,
  "rack" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id_location")
);

CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");
CREATE UNIQUE INDEX "municipalities_id_department_name_key" ON "municipalities"("id_department", "name");
CREATE INDEX "municipalities_id_department_idx" ON "municipalities"("id_department");
CREATE UNIQUE INDEX "districts_id_municipality_name_key" ON "districts"("id_municipality", "name");
CREATE INDEX "districts_id_municipality_idx" ON "districts"("id_municipality");
CREATE UNIQUE INDEX "companies_nit_key" ON "companies"("nit");
CREATE UNIQUE INDEX "companies_nrc_key" ON "companies"("nrc");
CREATE INDEX "companies_id_department_idx" ON "companies"("id_department");
CREATE INDEX "companies_id_municipality_idx" ON "companies"("id_municipality");
CREATE INDEX "companies_id_district_idx" ON "companies"("id_district");
CREATE UNIQUE INDEX "branches_id_company_name_key" ON "branches"("id_company", "name");
CREATE INDEX "branches_id_company_idx" ON "branches"("id_company");
CREATE INDEX "branches_id_department_idx" ON "branches"("id_department");
CREATE INDEX "branches_id_municipality_idx" ON "branches"("id_municipality");
CREATE INDEX "branches_id_district_idx" ON "branches"("id_district");
CREATE UNIQUE INDEX "warehouse_category_name_key" ON "warehouse_category"("name");
CREATE UNIQUE INDEX "warehouses_id_branch_name_key" ON "warehouses"("id_branch", "name");
CREATE INDEX "warehouses_id_branch_idx" ON "warehouses"("id_branch");
CREATE INDEX "warehouses_id_warehouse_category_idx" ON "warehouses"("id_warehouse_category");
CREATE UNIQUE INDEX "locations_id_warehouse_code_key" ON "locations"("id_warehouse", "code");
CREATE UNIQUE INDEX "locations_id_warehouse_aisle_rack_level_position_key" ON "locations"("id_warehouse", "aisle", "rack", "level", "position");
CREATE INDEX "locations_id_warehouse_idx" ON "locations"("id_warehouse");

ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "districts" ADD CONSTRAINT "districts_id_municipality_fkey" FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies" ADD CONSTRAINT "companies_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies" ADD CONSTRAINT "companies_id_municipality_fkey" FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies" ADD CONSTRAINT "companies_id_district_fkey" FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_id_municipality_fkey" FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_id_district_fkey" FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_id_branch_fkey" FOREIGN KEY ("id_branch") REFERENCES "branches"("id_branch") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_id_warehouse_category_fkey" FOREIGN KEY ("id_warehouse_category") REFERENCES "warehouse_category"("id_warehouse_category") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_id_warehouse_fkey" FOREIGN KEY ("id_warehouse") REFERENCES "warehouses"("id_warehouse") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "departments" ("id_department", "name", "updated_at") VALUES
  (1, 'San Salvador', CURRENT_TIMESTAMP),
  (2, 'San Miguel', CURRENT_TIMESTAMP),
  (3, 'La Union', CURRENT_TIMESTAMP)
ON CONFLICT ("id_department") DO NOTHING;

INSERT INTO "municipalities" ("id_municipality", "id_department", "name", "updated_at") VALUES
  (1, 1, 'San Salvador Centro', CURRENT_TIMESTAMP),
  (2, 2, 'San Miguel Centro', CURRENT_TIMESTAMP),
  (3, 3, 'La Union Norte', CURRENT_TIMESTAMP)
ON CONFLICT ("id_municipality") DO NOTHING;

INSERT INTO "districts" ("id_district", "id_municipality", "name", "updated_at") VALUES
  (1, 1, 'San Salvador', CURRENT_TIMESTAMP),
  (2, 2, 'San Miguel', CURRENT_TIMESTAMP),
  (3, 3, 'La Union', CURRENT_TIMESTAMP)
ON CONFLICT ("id_district") DO NOTHING;

SELECT setval(pg_get_serial_sequence('"departments"', 'id_department'), COALESCE((SELECT MAX("id_department") FROM "departments"), 1), true);
SELECT setval(pg_get_serial_sequence('"municipalities"', 'id_municipality'), COALESCE((SELECT MAX("id_municipality") FROM "municipalities"), 1), true);
SELECT setval(pg_get_serial_sequence('"districts"', 'id_district'), COALESCE((SELECT MAX("id_district") FROM "districts"), 1), true);
