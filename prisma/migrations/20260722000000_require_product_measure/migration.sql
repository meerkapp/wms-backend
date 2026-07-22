-- Product quantities are only meaningful when their base unit is known.
-- Existing pre-release rows without a unit are assigned the seeded `pcs`
-- measure and marked as updated so incremental read-model syncs receive them.
DO $$
DECLARE
    pieces_measure_id INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM "product_item" WHERE "product_measure_id" IS NULL) THEN
        SELECT "id"
        INTO pieces_measure_id
        FROM "product_measure"
        WHERE "code" = 'pcs';

        IF pieces_measure_id IS NULL THEN
            RAISE EXCEPTION 'Cannot require product units: product_measure code pcs is missing';
        END IF;

        UPDATE "product_item"
        SET
            "product_measure_id" = pieces_measure_id,
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "product_measure_id" IS NULL;
    END IF;
END $$;

-- A stable code is required for transport and localization. Abort instead of
-- inventing codes for unknown custom measures.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "product_measure" WHERE "code" IS NULL) THEN
        RAISE EXCEPTION 'Cannot require product measure codes: null codes must be resolved first';
    END IF;
END $$;

ALTER TABLE "product_item"
DROP CONSTRAINT "product_item_product_measure_id_fkey";

ALTER TABLE "product_measure"
ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "product_item"
ALTER COLUMN "product_measure_id" SET NOT NULL;

ALTER TABLE "product_item"
ADD CONSTRAINT "product_item_product_measure_id_fkey"
FOREIGN KEY ("product_measure_id") REFERENCES "product_measure"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
