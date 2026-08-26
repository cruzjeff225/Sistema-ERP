-- El registro de ejemplo previo ubicaba el distrito La Unión en La Unión Norte.
-- Conserva su identificador y lo reubica en el municipio oficial La Unión Sur.
DO $$
DECLARE
  old_district_id INTEGER;
  duplicate_district_id INTEGER;
  south_municipality_id INTEGER;
BEGIN
  SELECT d."id_district"
  INTO old_district_id
  FROM "districts" AS d
  JOIN "municipalities" AS m ON m."id_municipality" = d."id_municipality"
  JOIN "departments" AS dep ON dep."id_department" = m."id_department"
  WHERE dep."name" = 'La Unión' AND m."name" = 'La Unión Norte' AND d."name" = 'La Unión';

  SELECT m."id_municipality"
  INTO south_municipality_id
  FROM "municipalities" AS m
  JOIN "departments" AS dep ON dep."id_department" = m."id_department"
  WHERE dep."name" = 'La Unión' AND m."name" = 'La Unión Sur';

  SELECT d."id_district"
  INTO duplicate_district_id
  FROM "districts" AS d
  WHERE d."id_municipality" = south_municipality_id AND d."name" = 'La Unión';

  IF old_district_id IS NOT NULL AND south_municipality_id IS NOT NULL THEN
    IF duplicate_district_id IS NOT NULL THEN
      UPDATE "companies" SET "id_district" = old_district_id WHERE "id_district" = duplicate_district_id;
      UPDATE "branches" SET "id_district" = old_district_id WHERE "id_district" = duplicate_district_id;
      UPDATE "employees" SET "id_district" = old_district_id WHERE "id_district" = duplicate_district_id;
      UPDATE "customers" SET "id_district" = old_district_id WHERE "id_district" = duplicate_district_id;
      UPDATE "suppliers" SET "id_district" = old_district_id WHERE "id_district" = duplicate_district_id;
      DELETE FROM "districts" WHERE "id_district" = duplicate_district_id;
    END IF;

    UPDATE "companies" SET "id_municipality" = south_municipality_id WHERE "id_district" = old_district_id;
    UPDATE "branches" SET "id_municipality" = south_municipality_id WHERE "id_district" = old_district_id;
    UPDATE "employees" SET "id_municipality" = south_municipality_id WHERE "id_district" = old_district_id;
    UPDATE "customers" SET "id_municipality" = south_municipality_id WHERE "id_district" = old_district_id;
    UPDATE "suppliers" SET "id_municipality" = south_municipality_id WHERE "id_district" = old_district_id;
    UPDATE "districts" SET "id_municipality" = south_municipality_id WHERE "id_district" = old_district_id;
  END IF;
END $$;
