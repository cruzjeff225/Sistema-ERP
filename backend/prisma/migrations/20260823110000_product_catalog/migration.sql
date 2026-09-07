CREATE TABLE "categories" (
  "id_category" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id_category")
);

CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

CREATE TABLE "sub_categories" (
  "id_sub_category" SERIAL NOT NULL,
  "id_category" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "sub_categories_pkey" PRIMARY KEY ("id_sub_category")
);

CREATE UNIQUE INDEX "sub_categories_id_category_name_key" ON "sub_categories"("id_category", "name");
CREATE INDEX "sub_categories_id_category_idx" ON "sub_categories"("id_category");
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_id_category_fkey"
  FOREIGN KEY ("id_category") REFERENCES "categories"("id_category") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "units" (
  "id_unit" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "units_pkey" PRIMARY KEY ("id_unit"),
  CONSTRAINT "units_type_check" CHECK ("type" IN ('purchase', 'sale'))
);

CREATE UNIQUE INDEX "units_name_type_key" ON "units"("name", "type");
CREATE INDEX "units_type_idx" ON "units"("type");

INSERT INTO "categories" ("name", "description") VALUES ('Sin clasificar', 'Categoría inicial para productos existentes')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "sub_categories" ("id_category", "name", "description")
SELECT "id_category", 'General', 'Subcategoría inicial para productos existentes'
FROM "categories" WHERE "name" = 'Sin clasificar'
ON CONFLICT ("id_category", "name") DO NOTHING;

INSERT INTO "units" ("name", "type") VALUES ('Unidad', 'purchase'), ('Unidad', 'sale')
ON CONFLICT ("name", "type") DO NOTHING;

ALTER TABLE "products"
  ADD COLUMN "uuid" TEXT,
  ADD COLUMN "id_category" INTEGER,
  ADD COLUMN "id_sub_category" INTEGER,
  ADD COLUMN "original_code" TEXT,
  ADD COLUMN "internal_code" TEXT,
  ADD COLUMN "size" TEXT,
  ADD COLUMN "dimensions" TEXT,
  ADD COLUMN "presentation" TEXT,
  ADD COLUMN "id_purchase_unit" INTEGER,
  ADD COLUMN "id_sale_unit" INTEGER;

UPDATE "products"
SET
  "uuid" = md5(random()::text || clock_timestamp()::text || "id_product"::text),
  "id_category" = (SELECT "id_category" FROM "categories" WHERE "name" = 'Sin clasificar'),
  "id_sub_category" = (SELECT "id_sub_category" FROM "sub_categories" WHERE "name" = 'General' LIMIT 1),
  "internal_code" = 'INT-' || LPAD("id_product"::TEXT, 6, '0'),
  "id_purchase_unit" = (SELECT "id_unit" FROM "units" WHERE "name" = 'Unidad' AND "type" = 'purchase'),
  "id_sale_unit" = (SELECT "id_unit" FROM "units" WHERE "name" = 'Unidad' AND "type" = 'sale');

ALTER TABLE "products"
  ALTER COLUMN "uuid" SET NOT NULL,
  ALTER COLUMN "id_category" SET NOT NULL,
  ALTER COLUMN "id_sub_category" SET NOT NULL,
  ALTER COLUMN "internal_code" SET NOT NULL,
  ALTER COLUMN "id_purchase_unit" SET NOT NULL,
  ALTER COLUMN "id_sale_unit" SET NOT NULL;

CREATE UNIQUE INDEX "products_uuid_key" ON "products"("uuid");
CREATE UNIQUE INDEX "products_internal_code_key" ON "products"("internal_code");
CREATE INDEX "products_id_category_idx" ON "products"("id_category");
CREATE INDEX "products_id_sub_category_idx" ON "products"("id_sub_category");
CREATE INDEX "products_id_purchase_unit_idx" ON "products"("id_purchase_unit");
CREATE INDEX "products_id_sale_unit_idx" ON "products"("id_sale_unit");
CREATE INDEX "products_name_idx" ON "products"("name");
ALTER TABLE "products" ADD CONSTRAINT "products_id_category_fkey"
  FOREIGN KEY ("id_category") REFERENCES "categories"("id_category") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_id_sub_category_fkey"
  FOREIGN KEY ("id_sub_category") REFERENCES "sub_categories"("id_sub_category") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_id_purchase_unit_fkey"
  FOREIGN KEY ("id_purchase_unit") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_id_sale_unit_fkey"
  FOREIGN KEY ("id_sale_unit") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "products_images" (
  "id_product_image" SERIAL NOT NULL,
  "uuid" TEXT NOT NULL,
  "id_product" INTEGER NOT NULL,
  "path" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "products_images_pkey" PRIMARY KEY ("id_product_image")
);

CREATE UNIQUE INDEX "products_images_uuid_key" ON "products_images"("uuid");
CREATE UNIQUE INDEX "products_images_id_product_path_key" ON "products_images"("id_product", "path");
CREATE INDEX "products_images_id_product_idx" ON "products_images"("id_product");
ALTER TABLE "products_images" ADD CONSTRAINT "products_images_id_product_fkey"
  FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "product_suppliers" (
  "id_product_supplier" SERIAL NOT NULL,
  "id_product" INTEGER NOT NULL,
  "id_supplier" INTEGER NOT NULL,
  "supplier_code" TEXT,
  "is_preferred" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("id_product_supplier")
);

CREATE UNIQUE INDEX "product_suppliers_id_product_id_supplier_key" ON "product_suppliers"("id_product", "id_supplier");
CREATE INDEX "product_suppliers_id_supplier_idx" ON "product_suppliers"("id_supplier");
CREATE UNIQUE INDEX "product_suppliers_one_preferred_idx" ON "product_suppliers"("id_product") WHERE "is_preferred" AND "is_active" AND "deleted_at" IS NULL;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_id_product_fkey"
  FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_id_supplier_fkey"
  FOREIGN KEY ("id_supplier") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;
