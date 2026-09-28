import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { AuditModule } from "../audit/audit.module";
import { PurchasesService } from "./application/services/purchases.service";
import { PurchaseExpenseDocumentsService } from "./application/services/purchase-expense-documents.service";
import { RetaceosService } from "./application/services/retaceos.service";
import { PurchaseExpenseDocumentsController } from "./presentation/purchase-expense-documents.controller";
import { RetaceosController } from "./presentation/retaceos.controller";
import { PurchaseReceiptsController } from "./presentation/purchase-receipts.controller";
import { PurchaseReceiptsService } from "./application/services/purchase-receipts.service";
import {
  ExpenseTypesController,
  PurchaseCatalogsController,
  PurchaseOrdersController,
  PurchaseQuotationsController,
  PurchaseRequestsController,
} from "./presentation/purchases.controller";

@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [
    PurchaseCatalogsController,
    PurchaseRequestsController,
    PurchaseQuotationsController,
    PurchaseOrdersController,
    ExpenseTypesController,
    PurchaseExpenseDocumentsController,
    RetaceosController,
    PurchaseReceiptsController,
  ],
  providers: [PurchasesService, PurchaseExpenseDocumentsService, RetaceosService, PurchaseReceiptsService],
})
export class PurchasesModule {}
