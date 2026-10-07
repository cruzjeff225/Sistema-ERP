ALTER TABLE "purchases" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "transfers" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "purchase_consolidations" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "purchase_rfqs" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "purchase_actual_expenses" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE TABLE "trash_entries" (
 "id" SERIAL PRIMARY KEY, "company_id" INTEGER NOT NULL, "entity" TEXT NOT NULL, "record_id" INTEGER NOT NULL, "label" TEXT NOT NULL,
 "deleted_by" INTEGER NOT NULL, "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expires_at" TIMESTAMP(3) NOT NULL, "restored_at" TIMESTAMP(3), "purged_at" TIMESTAMP(3), "retained_for_history" BOOLEAN NOT NULL DEFAULT FALSE,
 "original_state" JSONB NOT NULL
);
CREATE INDEX "trash_entries_company_id_expires_at_idx" ON "trash_entries"("company_id", "expires_at");
CREATE INDEX "trash_entries_entity_record_id_restored_at_idx" ON "trash_entries"("entity", "record_id", "restored_at");
INSERT INTO "modules" ("name","description","is_active","created_at","updated_at") VALUES ('trash','Papelera recuperable por 30 días',true,NOW(),NOW()) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "permissions" ("action","name","description","is_active","is_system","module_id","created_at","updated_at")
SELECT p.action,p.name,p.name,true,false,m.id,NOW(),NOW() FROM (VALUES
 ('trash.view','Consultar papelera'),('trash.delete','Enviar registros a la papelera'),('trash.restore','Restaurar registros de la papelera')
) p(action,name) CROSS JOIN modules m WHERE m.name='trash' ON CONFLICT ("action") DO NOTHING;
INSERT INTO "roles_permissions" ("id_role","id_permission") SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name IN ('admin','superadmin') AND p.action IN ('trash.view','trash.delete','trash.restore') ON CONFLICT DO NOTHING;
