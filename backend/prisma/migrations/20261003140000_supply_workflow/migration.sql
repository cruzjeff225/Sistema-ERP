-- DropForeignKey
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_id_location_fkey";

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "barcode_confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placed_at" TIMESTAMP(3),
ADD COLUMN     "placed_by" INTEGER,
ADD COLUMN     "suggested_location_id" INTEGER,
ALTER COLUMN "id_location" DROP NOT NULL;

-- AlterTable
ALTER TABLE "transfers" ADD COLUMN     "company_id" INTEGER,
ADD COLUMN     "dispatched_at" TIMESTAMP(3),
ADD COLUMN     "received_at" TIMESTAMP(3),
ADD COLUMN     "user_id" INTEGER,
ADD COLUMN     "uuid" TEXT;

-- Preserve existing transfer documents while providing a unique retry identity.
UPDATE "transfers" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "transfers" ALTER COLUMN "uuid" SET NOT NULL;

-- AlterTable
ALTER TABLE "transfer_items" ADD COLUMN     "received_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "request_detail_id" INTEGER,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "purchase_quotations" ADD COLUMN     "rfq_id" INTEGER;

-- AlterTable
ALTER TABLE "purchase_quotation_details" ADD COLUMN     "consolidation_line_id" INTEGER;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "consolidation_id" INTEGER;

-- CreateTable
CREATE TABLE "purchase_consolidations" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_consolidations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_consolidation_lines" (
    "id" SERIAL NOT NULL,
    "consolidation_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "requested_quantity" DECIMAL(12,2) NOT NULL,
    "purchase_quantity" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "purchase_consolidation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_consolidation_sources" (
    "id" SERIAL NOT NULL,
    "line_id" INTEGER NOT NULL,
    "request_detail_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_consolidation_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_rfqs" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "consolidation_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_rfq_lines" (
    "id" SERIAL NOT NULL,
    "rfq_id" INTEGER NOT NULL,
    "line_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_rfq_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_actual_expenses" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "planned_expense_id" INTEGER,
    "expense_type_id" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category" TEXT NOT NULL,
    "capitalizable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_actual_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_expense_allocations" (
    "id" SERIAL NOT NULL,
    "expense_id" INTEGER NOT NULL,
    "retaceo_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_expense_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_consolidations_code_key" ON "purchase_consolidations"("code");

-- CreateIndex
CREATE INDEX "purchase_consolidations_company_id_status_idx" ON "purchase_consolidations"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_consolidation_lines_consolidation_id_product_id_key" ON "purchase_consolidation_lines"("consolidation_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_consolidation_sources_request_detail_id_key" ON "purchase_consolidation_sources"("request_detail_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_rfqs_code_key" ON "purchase_rfqs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_rfq_lines_rfq_id_line_id_key" ON "purchase_rfq_lines"("rfq_id", "line_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_actual_expenses_purchase_id_reference_key" ON "purchase_actual_expenses"("purchase_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_expense_allocations_expense_id_key" ON "purchase_expense_allocations"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_uuid_key" ON "transfers"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quotations_rfq_id_key" ON "purchase_quotations"("rfq_id");

-- AddForeignKey
ALTER TABLE "purchase_consolidations" ADD CONSTRAINT "purchase_consolidations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id_company") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_consolidation_lines" ADD CONSTRAINT "purchase_consolidation_lines_consolidation_id_fkey" FOREIGN KEY ("consolidation_id") REFERENCES "purchase_consolidations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_consolidation_lines" ADD CONSTRAINT "purchase_consolidation_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id_product") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_consolidation_lines" ADD CONSTRAINT "purchase_consolidation_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id_unit") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_consolidation_sources" ADD CONSTRAINT "purchase_consolidation_sources_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "purchase_consolidation_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_consolidation_sources" ADD CONSTRAINT "purchase_consolidation_sources_request_detail_id_fkey" FOREIGN KEY ("request_detail_id") REFERENCES "purchase_request_details"("id_purchase_request_detail") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfqs" ADD CONSTRAINT "purchase_rfqs_consolidation_id_fkey" FOREIGN KEY ("consolidation_id") REFERENCES "purchase_consolidations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfqs" ADD CONSTRAINT "purchase_rfqs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id_supplier") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfq_lines" ADD CONSTRAINT "purchase_rfq_lines_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "purchase_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfq_lines" ADD CONSTRAINT "purchase_rfq_lines_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "purchase_consolidation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_actual_expenses" ADD CONSTRAINT "purchase_actual_expenses_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id_purchase") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_actual_expenses" ADD CONSTRAINT "purchase_actual_expenses_planned_expense_id_fkey" FOREIGN KEY ("planned_expense_id") REFERENCES "purchase_order_expenses"("id_purchase_order_expense") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_actual_expenses" ADD CONSTRAINT "purchase_actual_expenses_expense_type_id_fkey" FOREIGN KEY ("expense_type_id") REFERENCES "expense_types"("id_expense_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expense_allocations" ADD CONSTRAINT "purchase_expense_allocations_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "purchase_actual_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expense_allocations" ADD CONSTRAINT "purchase_expense_allocations_retaceo_id_fkey" FOREIGN KEY ("retaceo_id") REFERENCES "retaceos"("id_retaceo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "locations"("id_location") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_request_detail_id_fkey" FOREIGN KEY ("request_detail_id") REFERENCES "purchase_request_details"("id_purchase_request_detail") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotations" ADD CONSTRAINT "purchase_quotations_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "purchase_rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotation_details" ADD CONSTRAINT "purchase_quotation_details_consolidation_line_id_fkey" FOREIGN KEY ("consolidation_line_id") REFERENCES "purchase_consolidation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_consolidation_id_fkey" FOREIGN KEY ("consolidation_id") REFERENCES "purchase_consolidations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
