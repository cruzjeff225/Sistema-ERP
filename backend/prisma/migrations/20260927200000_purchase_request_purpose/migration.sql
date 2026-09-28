BEGIN;
CREATE TYPE "PurchaseRequestPurpose" AS ENUM ('resale', 'operations', 'mixed');
-- Historical requests retain an unknown purpose; do not infer it from the product.
ALTER TABLE "purchase_requests" ADD COLUMN "purpose" "PurchaseRequestPurpose";
COMMIT;
