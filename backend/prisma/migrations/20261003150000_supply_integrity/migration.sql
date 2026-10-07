ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_type_check";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_type_check"
  CHECK ("type" IN ('OPENING', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN'));
ALTER TABLE "purchase_consolidation_lines" ADD CONSTRAINT "consolidation_quantities_nonnegative" CHECK ("requested_quantity" >= 0 AND "purchase_quantity" >= 0);
ALTER TABLE "purchase_consolidation_sources" ADD CONSTRAINT "consolidation_source_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_rfq_lines" ADD CONSTRAINT "rfq_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_actual_expenses" ADD CONSTRAINT "actual_expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "purchase_actual_expenses" ADD CONSTRAINT "actual_expense_category" CHECK ("category" IN ('freight','expense','dai'));
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_receipt_balance" CHECK ("received_quantity" >= 0 AND "received_quantity" <= "quantity");
