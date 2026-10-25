-- Visible document numbers are generated independently from internal primary keys.
CREATE SEQUENCE "purchase_request_code_seq" START 1;
CREATE SEQUENCE "purchase_quotation_code_seq" START 1;
CREATE SEQUENCE "purchase_order_code_seq" START 1;
CREATE SEQUENCE "purchase_receipt_code_seq" START 1;

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_id_department_fkey";

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_id_district_fkey";

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_id_municipality_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_id_department_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_id_district_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_id_municipality_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_id_department_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_id_district_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_id_municipality_fkey";

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "countries" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "product_suppliers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products_images" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "id_purchase_order_detail" INTEGER;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "id_purchase_order" INTEGER;

-- AlterTable
ALTER TABLE "sub_categories" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "suppliers_contacts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id_purchase_request" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "purchase_request_code" TEXT NOT NULL,
    "id_company" INTEGER NOT NULL,
    "id_branch" INTEGER NOT NULL,
    "id_warehouse" INTEGER NOT NULL,
    "id_user" INTEGER NOT NULL,
    "request_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "required_date" TIMESTAMP(3) NOT NULL,
    "justification" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id_purchase_request")
);

-- CreateTable
CREATE TABLE "purchase_request_details" (
    "id_purchase_request_detail" SERIAL NOT NULL,
    "id_purchase_request" INTEGER NOT NULL,
    "id_product" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "id_unit" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "notes" TEXT,

    CONSTRAINT "purchase_request_details_pkey" PRIMARY KEY ("id_purchase_request_detail")
);

-- CreateTable
CREATE TABLE "purchase_quotations" (
    "id_purchase_quotation" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "purchase_quotation_code" TEXT NOT NULL,
    "id_company" INTEGER NOT NULL,
    "id_supplier" INTEGER NOT NULL,
    "quotation_date" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "payment_terms" VARCHAR(100),
    "delivery_days" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "additional_expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "id_user" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "purchase_quotations_pkey" PRIMARY KEY ("id_purchase_quotation")
);

-- CreateTable
CREATE TABLE "purchase_quotation_details" (
    "id_purchase_quotation_detail" SERIAL NOT NULL,
    "id_purchase_quotation" INTEGER NOT NULL,
    "id_product" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "id_unit" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "delivery_days" INTEGER,
    "available_quantity" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "purchase_quotation_details_pkey" PRIMARY KEY ("id_purchase_quotation_detail")
);

-- CreateTable
CREATE TABLE "purchase_quotation_requests" (
    "id_purchase_quotation_request" SERIAL NOT NULL,
    "id_purchase_quotation" INTEGER NOT NULL,
    "id_purchase_request" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_quotation_requests_pkey" PRIMARY KEY ("id_purchase_quotation_request")
);

-- CreateTable
CREATE TABLE "purchase_quotation_request_details" (
    "id_purchase_quotation_request_detail" SERIAL NOT NULL,
    "id_purchase_quotation_detail" INTEGER NOT NULL,
    "id_purchase_request_detail" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_quotation_request_details_pkey" PRIMARY KEY ("id_purchase_quotation_request_detail")
);

-- CreateTable
CREATE TABLE "expense_types" (
    "id_expense_type" SERIAL NOT NULL,
    "id_company" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "expense_types_pkey" PRIMARY KEY ("id_expense_type")
);

-- CreateTable
CREATE TABLE "purchase_quotation_expenses" (
    "id_purchase_quotation_expense" SERIAL NOT NULL,
    "id_purchase_quotation" INTEGER NOT NULL,
    "id_expense_type" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_quotation_expenses_pkey" PRIMARY KEY ("id_purchase_quotation_expense")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id_purchase_order" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "purchase_order_code" TEXT NOT NULL,
    "id_company" INTEGER NOT NULL,
    "id_supplier" INTEGER NOT NULL,
    "id_branch" INTEGER NOT NULL,
    "id_warehouse" INTEGER NOT NULL,
    "id_purchase_quotation" INTEGER,
    "id_user" INTEGER NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "payment_terms" VARCHAR(100),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "additional_expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id_purchase_order")
);

-- CreateTable
CREATE TABLE "purchase_order_details" (
    "id_purchase_order_detail" SERIAL NOT NULL,
    "id_purchase_order" INTEGER NOT NULL,
    "id_purchase_quotation_detail" INTEGER,
    "id_product" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "received_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "id_unit" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "purchase_order_details_pkey" PRIMARY KEY ("id_purchase_order_detail")
);

-- CreateTable
CREATE TABLE "purchase_order_expenses" (
    "id_purchase_order_expense" SERIAL NOT NULL,
    "id_purchase_order" INTEGER NOT NULL,
    "id_expense_type" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_expenses_pkey" PRIMARY KEY ("id_purchase_order_expense")
);

-- CreateTable
CREATE TABLE "purchase_order_expense_documents" (
    "id_purchase_order_expense_document" SERIAL NOT NULL,
    "id_purchase_order_expense" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_expense_documents_pkey" PRIMARY KEY ("id_purchase_order_expense_document")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_uuid_key" ON "purchase_requests"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_purchase_request_code_key" ON "purchase_requests"("purchase_request_code");

-- CreateIndex
CREATE INDEX "purchase_requests_id_company_status_idx" ON "purchase_requests"("id_company", "status");

-- CreateIndex
CREATE INDEX "purchase_requests_id_branch_idx" ON "purchase_requests"("id_branch");

-- CreateIndex
CREATE INDEX "purchase_requests_id_warehouse_idx" ON "purchase_requests"("id_warehouse");

-- CreateIndex
CREATE INDEX "purchase_requests_id_user_idx" ON "purchase_requests"("id_user");

-- CreateIndex
CREATE INDEX "purchase_request_details_id_product_idx" ON "purchase_request_details"("id_product");

-- CreateIndex
CREATE INDEX "purchase_request_details_id_unit_idx" ON "purchase_request_details"("id_unit");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_details_id_purchase_request_id_product_key" ON "purchase_request_details"("id_purchase_request", "id_product");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotations_uuid_key" ON "purchase_quotations"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotations_purchase_quotation_code_key" ON "purchase_quotations"("purchase_quotation_code");

-- CreateIndex
CREATE INDEX "purchase_quotations_id_company_status_idx" ON "purchase_quotations"("id_company", "status");

-- CreateIndex
CREATE INDEX "purchase_quotations_id_supplier_idx" ON "purchase_quotations"("id_supplier");

-- CreateIndex
CREATE INDEX "purchase_quotations_id_user_idx" ON "purchase_quotations"("id_user");

-- CreateIndex
CREATE INDEX "purchase_quotation_details_id_product_idx" ON "purchase_quotation_details"("id_product");

-- CreateIndex
CREATE INDEX "purchase_quotation_details_id_unit_idx" ON "purchase_quotation_details"("id_unit");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotation_details_id_purchase_quotation_id_product_key" ON "purchase_quotation_details"("id_purchase_quotation", "id_product");

-- CreateIndex
CREATE INDEX "purchase_quotation_requests_id_purchase_request_idx" ON "purchase_quotation_requests"("id_purchase_request");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotation_requests_id_purchase_quotation_id_purcha_key" ON "purchase_quotation_requests"("id_purchase_quotation", "id_purchase_request");

-- CreateIndex
CREATE INDEX "purchase_quotation_request_details_id_purchase_request_deta_idx" ON "purchase_quotation_request_details"("id_purchase_request_detail");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotation_request_details_id_purchase_quotation_de_key" ON "purchase_quotation_request_details"("id_purchase_quotation_detail", "id_purchase_request_detail");

-- CreateIndex
CREATE INDEX "expense_types_id_company_is_active_idx" ON "expense_types"("id_company", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "expense_types_id_company_name_key" ON "expense_types"("id_company", "name");

-- CreateIndex
CREATE INDEX "purchase_quotation_expenses_id_purchase_quotation_idx" ON "purchase_quotation_expenses"("id_purchase_quotation");

-- CreateIndex
CREATE INDEX "purchase_quotation_expenses_id_expense_type_idx" ON "purchase_quotation_expenses"("id_expense_type");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_uuid_key" ON "purchase_orders"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_purchase_order_code_key" ON "purchase_orders"("purchase_order_code");

-- CreateIndex
CREATE INDEX "purchase_orders_id_company_status_idx" ON "purchase_orders"("id_company", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_id_supplier_idx" ON "purchase_orders"("id_supplier");

-- CreateIndex
CREATE INDEX "purchase_orders_id_branch_idx" ON "purchase_orders"("id_branch");

-- CreateIndex
CREATE INDEX "purchase_orders_id_warehouse_idx" ON "purchase_orders"("id_warehouse");

-- CreateIndex
CREATE INDEX "purchase_orders_id_purchase_quotation_idx" ON "purchase_orders"("id_purchase_quotation");

-- CreateIndex
CREATE INDEX "purchase_orders_id_user_idx" ON "purchase_orders"("id_user");

-- CreateIndex
CREATE INDEX "purchase_order_details_id_purchase_quotation_detail_idx" ON "purchase_order_details"("id_purchase_quotation_detail");

-- CreateIndex
CREATE INDEX "purchase_order_details_id_product_idx" ON "purchase_order_details"("id_product");

-- CreateIndex
CREATE INDEX "purchase_order_details_id_unit_idx" ON "purchase_order_details"("id_unit");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_details_id_purchase_order_id_product_key" ON "purchase_order_details"("id_purchase_order", "id_product");

-- CreateIndex
CREATE INDEX "purchase_order_expenses_id_purchase_order_idx" ON "purchase_order_expenses"("id_purchase_order");

-- CreateIndex
CREATE INDEX "purchase_order_expenses_id_expense_type_idx" ON "purchase_order_expenses"("id_expense_type");

-- CreateIndex
CREATE INDEX "purchase_order_expense_documents_id_purchase_order_expense_idx" ON "purchase_order_expense_documents"("id_purchase_order_expense");

-- CreateIndex
CREATE INDEX "purchase_items_id_purchase_order_detail_idx" ON "purchase_items"("id_purchase_order_detail");

-- CreateIndex
CREATE INDEX "purchases_id_purchase_order_idx" ON "purchases"("id_purchase_order");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_id_municipality_fkey" FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_id_district_fkey" FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_municipality_fkey" FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_district_fkey" FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "departments"("id_department") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_municipality_fkey" FOREIGN KEY ("id_municipality") REFERENCES "municipalities"("id_municipality") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_district_fkey" FOREIGN KEY ("id_district") REFERENCES "districts"("id_district") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_id_purchase_order_fkey" FOREIGN KEY ("id_purchase_order") REFERENCES "purchase_orders"("id_purchase_order") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "locations"("id_location") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_id_purchase_order_detail_fkey" FOREIGN KEY ("id_purchase_order_detail") REFERENCES "purchase_order_details"("id_purchase_order_detail") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_id_branch_fkey" FOREIGN KEY ("id_branch") REFERENCES "branches"("id_branch") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_id_warehouse_fkey" FOREIGN KEY ("id_warehouse") REFERENCES "warehouses"("id_warehouse") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_details" ADD CONSTRAINT "purchase_request_details_id_purchase_request_fkey" FOREIGN KEY ("id_purchase_request") REFERENCES "purchase_requests"("id_purchase_request") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_details" ADD CONSTRAINT "purchase_request_details_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_details" ADD CONSTRAINT "purchase_request_details_id_unit_fkey" FOREIGN KEY ("id_unit") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_id_supplier_fkey" FOREIGN KEY ("id_supplier") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "purchase_quotation_details_id_purchase_quotation_fkey" FOREIGN KEY ("id_purchase_quotation") REFERENCES "purchase_quotations"("id_purchase_quotation") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "purchase_quotation_details_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "purchase_quotation_details_id_unit_fkey" FOREIGN KEY ("id_unit") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_requests" ADD CONSTRAINT "purchase_quotation_requests_id_purchase_quotation_fkey" FOREIGN KEY ("id_purchase_quotation") REFERENCES "purchase_quotations"("id_purchase_quotation") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_requests" ADD CONSTRAINT "purchase_quotation_requests_id_purchase_request_fkey" FOREIGN KEY ("id_purchase_request") REFERENCES "purchase_requests"("id_purchase_request") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_request_details" ADD CONSTRAINT "purchase_quotation_request_details_id_purchase_quotation_d_fkey" FOREIGN KEY ("id_purchase_quotation_detail") REFERENCES "purchase_quotation_details"("id_purchase_quotation_detail") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_request_details" ADD CONSTRAINT "purchase_quotation_request_details_id_purchase_request_det_fkey" FOREIGN KEY ("id_purchase_request_detail") REFERENCES "purchase_request_details"("id_purchase_request_detail") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_types" ADD CONSTRAINT "expense_types_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_expenses" ADD CONSTRAINT "purchase_quotation_expenses_id_purchase_quotation_fkey" FOREIGN KEY ("id_purchase_quotation") REFERENCES "purchase_quotations"("id_purchase_quotation") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_expenses" ADD CONSTRAINT "purchase_quotation_expenses_id_expense_type_fkey" FOREIGN KEY ("id_expense_type") REFERENCES "expense_types"("id_expense_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_supplier_fkey" FOREIGN KEY ("id_supplier") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_branch_fkey" FOREIGN KEY ("id_branch") REFERENCES "branches"("id_branch") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_warehouse_fkey" FOREIGN KEY ("id_warehouse") REFERENCES "warehouses"("id_warehouse") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_purchase_quotation_fkey" FOREIGN KEY ("id_purchase_quotation") REFERENCES "purchase_quotations"("id_purchase_quotation") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_details" ADD CONSTRAINT "purchase_order_details_id_purchase_order_fkey" FOREIGN KEY ("id_purchase_order") REFERENCES "purchase_orders"("id_purchase_order") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_details" ADD CONSTRAINT "purchase_order_details_id_purchase_quotation_detail_fkey" FOREIGN KEY ("id_purchase_quotation_detail") REFERENCES "purchase_quotation_details"("id_purchase_quotation_detail") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_details" ADD CONSTRAINT "purchase_order_details_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_details" ADD CONSTRAINT "purchase_order_details_id_unit_fkey" FOREIGN KEY ("id_unit") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_expenses" ADD CONSTRAINT "purchase_order_expenses_id_purchase_order_fkey" FOREIGN KEY ("id_purchase_order") REFERENCES "purchase_orders"("id_purchase_order") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_expenses" ADD CONSTRAINT "purchase_order_expenses_id_expense_type_fkey" FOREIGN KEY ("id_expense_type") REFERENCES "expense_types"("id_expense_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_expense_documents" ADD CONSTRAINT "purchase_order_expense_documents_id_purchase_order_expense_fkey" FOREIGN KEY ("id_purchase_order_expense") REFERENCES "purchase_order_expenses"("id_purchase_order_expense") ON DELETE CASCADE ON UPDATE CASCADE;
