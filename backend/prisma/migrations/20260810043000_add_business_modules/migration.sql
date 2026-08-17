CREATE TABLE "customers" (
  "id_customer" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id_customer")
);

CREATE TABLE "suppliers" (
  "id_supplier" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id_supplier")
);

CREATE TABLE "products" (
  "id_product" SERIAL NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sale_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "products_pkey" PRIMARY KEY ("id_product")
);

CREATE TABLE "inventory_stocks" (
  "id_inventory_stock" SERIAL NOT NULL,
  "id_product" INTEGER NOT NULL,
  "id_location" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "min_stock" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("id_inventory_stock")
);

CREATE TABLE "purchases" (
  "id_purchase" SERIAL NOT NULL,
  "id_supplier" INTEGER NOT NULL,
  "id_branch" INTEGER NOT NULL,
  "document_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id_purchase")
);

CREATE TABLE "purchase_items" (
  "id_purchase_item" SERIAL NOT NULL,
  "id_purchase" INTEGER NOT NULL,
  "id_product" INTEGER NOT NULL,
  "id_location" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id_purchase_item")
);

CREATE TABLE "quotations" (
  "id_quotation" SERIAL NOT NULL,
  "id_customer" INTEGER NOT NULL,
  "id_branch" INTEGER NOT NULL,
  "document_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quotations_pkey" PRIMARY KEY ("id_quotation")
);

CREATE TABLE "quotation_items" (
  "id_quotation_item" SERIAL NOT NULL,
  "id_quotation" INTEGER NOT NULL,
  "id_product" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id_quotation_item")
);

CREATE TABLE "sales" (
  "id_sale" SERIAL NOT NULL,
  "id_customer" INTEGER NOT NULL,
  "id_branch" INTEGER NOT NULL,
  "document_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id_sale")
);

CREATE TABLE "sale_items" (
  "id_sale_item" SERIAL NOT NULL,
  "id_sale" INTEGER NOT NULL,
  "id_product" INTEGER NOT NULL,
  "id_location" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id_sale_item")
);

CREATE TABLE "transfers" (
  "id_transfer" SERIAL NOT NULL,
  "document_number" TEXT NOT NULL,
  "id_from_warehouse" INTEGER NOT NULL,
  "id_to_warehouse" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transfers_pkey" PRIMARY KEY ("id_transfer")
);

CREATE TABLE "transfer_items" (
  "id_transfer_item" SERIAL NOT NULL,
  "id_transfer" INTEGER NOT NULL,
  "id_product" INTEGER NOT NULL,
  "id_from_location" INTEGER NOT NULL,
  "id_to_location" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id_transfer_item")
);

CREATE TABLE "vehicles" (
  "id_vehicle" SERIAL NOT NULL,
  "plate" TEXT NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "year" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id_vehicle")
);

CREATE TABLE "drivers" (
  "id_driver" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "license" TEXT NOT NULL,
  "phone" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "drivers_pkey" PRIMARY KEY ("id_driver")
);

CREATE UNIQUE INDEX "customers_document_key" ON "customers"("document");
CREATE UNIQUE INDEX "suppliers_document_key" ON "suppliers"("document");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "inventory_stocks_id_product_id_location_key" ON "inventory_stocks"("id_product", "id_location");
CREATE INDEX "inventory_stocks_id_location_idx" ON "inventory_stocks"("id_location");
CREATE UNIQUE INDEX "purchases_document_number_key" ON "purchases"("document_number");
CREATE INDEX "purchases_id_supplier_idx" ON "purchases"("id_supplier");
CREATE INDEX "purchases_id_branch_idx" ON "purchases"("id_branch");
CREATE INDEX "purchase_items_id_purchase_idx" ON "purchase_items"("id_purchase");
CREATE INDEX "purchase_items_id_product_idx" ON "purchase_items"("id_product");
CREATE INDEX "purchase_items_id_location_idx" ON "purchase_items"("id_location");
CREATE UNIQUE INDEX "quotations_document_number_key" ON "quotations"("document_number");
CREATE INDEX "quotations_id_customer_idx" ON "quotations"("id_customer");
CREATE INDEX "quotations_id_branch_idx" ON "quotations"("id_branch");
CREATE INDEX "quotation_items_id_quotation_idx" ON "quotation_items"("id_quotation");
CREATE INDEX "quotation_items_id_product_idx" ON "quotation_items"("id_product");
CREATE UNIQUE INDEX "sales_document_number_key" ON "sales"("document_number");
CREATE INDEX "sales_id_customer_idx" ON "sales"("id_customer");
CREATE INDEX "sales_id_branch_idx" ON "sales"("id_branch");
CREATE INDEX "sale_items_id_sale_idx" ON "sale_items"("id_sale");
CREATE INDEX "sale_items_id_product_idx" ON "sale_items"("id_product");
CREATE INDEX "sale_items_id_location_idx" ON "sale_items"("id_location");
CREATE UNIQUE INDEX "transfers_document_number_key" ON "transfers"("document_number");
CREATE INDEX "transfers_id_from_warehouse_idx" ON "transfers"("id_from_warehouse");
CREATE INDEX "transfers_id_to_warehouse_idx" ON "transfers"("id_to_warehouse");
CREATE INDEX "transfer_items_id_transfer_idx" ON "transfer_items"("id_transfer");
CREATE INDEX "transfer_items_id_product_idx" ON "transfer_items"("id_product");
CREATE INDEX "transfer_items_id_from_location_idx" ON "transfer_items"("id_from_location");
CREATE INDEX "transfer_items_id_to_location_idx" ON "transfer_items"("id_to_location");
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");
CREATE UNIQUE INDEX "drivers_license_key" ON "drivers"("license");

ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "locations"("id_location") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_supplier_fkey" FOREIGN KEY ("id_supplier") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_branch_fkey" FOREIGN KEY ("id_branch") REFERENCES "branches"("id_branch") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_id_purchase_fkey" FOREIGN KEY ("id_purchase") REFERENCES "purchases"("id_purchase") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_id_customer_fkey" FOREIGN KEY ("id_customer") REFERENCES "customers"("id_customer") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_id_branch_fkey" FOREIGN KEY ("id_branch") REFERENCES "branches"("id_branch") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_id_quotation_fkey" FOREIGN KEY ("id_quotation") REFERENCES "quotations"("id_quotation") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_id_customer_fkey" FOREIGN KEY ("id_customer") REFERENCES "customers"("id_customer") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_id_branch_fkey" FOREIGN KEY ("id_branch") REFERENCES "branches"("id_branch") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_id_sale_fkey" FOREIGN KEY ("id_sale") REFERENCES "sales"("id_sale") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_id_transfer_fkey" FOREIGN KEY ("id_transfer") REFERENCES "transfers"("id_transfer") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;
