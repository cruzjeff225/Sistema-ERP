import { Module } from "@nestjs/common";
import { SupplyWorkflowService } from './application/services/supply-workflow.service';
import { SupplyWorkflowController } from './presentation/supply-workflow.controller';
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
    SupplyWorkflowController,
    PurchaseCatalogsController,
    PurchaseRequestsController,
    PurchaseQuotationsController,
    PurchaseOrdersController,
    ExpenseTypesController,
    PurchaseExpenseDocumentsController,
    RetaceosController,
    PurchaseReceiptsController,
  ],
  providers: [SupplyWorkflowService, PurchasesService, PurchaseExpenseDocumentsService, RetaceosService, PurchaseReceiptsService],
})
export class PurchasesModule {}
