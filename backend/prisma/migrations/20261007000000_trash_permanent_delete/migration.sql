INSERT INTO "permissions" ("action","name","description","is_active","is_system","module_id","created_at","updated_at")
SELECT 'trash.purge','Eliminar definitivamente de papelera','Eliminar registros sin recuperación, conservando referencias históricas',true,false,id,NOW(),NOW()
FROM "modules" WHERE "name"='trash' ON CONFLICT ("action") DO NOTHING;
INSERT INTO "roles_permissions" ("id_role","id_permission")
SELECT r.id,p.id FROM "roles" r CROSS JOIN "permissions" p WHERE r.name IN ('admin','superadmin') AND p.action='trash.purge'
ON CONFLICT DO NOTHING;
