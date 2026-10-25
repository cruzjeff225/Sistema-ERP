CREATE TABLE erp_configuration (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id_company)
);
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM companies WHERE lower(trim(commercial_name)) = 'atlas roofing' AND deleted_at IS NULL AND is_active = true) <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente una empresa activa Atlas Roofing antes de aplicar esta migracion';
  END IF;
END $$;
INSERT INTO erp_configuration (id, company_id)
SELECT 1, id_company FROM companies WHERE lower(trim(commercial_name)) = 'atlas roofing' AND deleted_at IS NULL AND is_active = true;
