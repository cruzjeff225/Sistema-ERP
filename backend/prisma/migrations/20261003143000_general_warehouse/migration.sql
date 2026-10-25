ALTER TABLE "erp_configuration" ADD COLUMN "general_warehouse_id" INTEGER;
CREATE UNIQUE INDEX "erp_configuration_general_warehouse_id_key" ON "erp_configuration"("general_warehouse_id");
ALTER TABLE "erp_configuration" ADD CONSTRAINT "erp_configuration_general_warehouse_id_fkey" FOREIGN KEY ("general_warehouse_id") REFERENCES "warehouses"("id_warehouse") ON DELETE RESTRICT ON UPDATE CASCADE;
