-- Do not silently choose between conflicting price lists. Existing conflicts
-- must be resolved by an operator before the invariant can be installed.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM price_list_assignment
        WHERE warehouse_id IS NOT NULL
        GROUP BY warehouse_id HAVING COUNT(*) > 1
    ) OR EXISTS (
        SELECT 1 FROM price_list_assignment
        WHERE organization_id IS NOT NULL
        GROUP BY organization_id HAVING COUNT(*) > 1
    ) OR EXISTS (
        SELECT 1 FROM price_list_assignment
        WHERE locality_id IS NOT NULL
        GROUP BY locality_id HAVING COUNT(*) > 1
    ) OR EXISTS (
        SELECT 1 FROM price_list_assignment
        WHERE country_id IS NOT NULL
        GROUP BY country_id HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Conflicting price list assignments must be resolved before migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM price_list_assignment
        WHERE NOT (
            (target_type = 'WAREHOUSE' AND warehouse_id IS NOT NULL AND organization_id IS NULL AND locality_id IS NULL AND country_id IS NULL)
            OR (target_type = 'ORGANIZATION' AND warehouse_id IS NULL AND organization_id IS NOT NULL AND locality_id IS NULL AND country_id IS NULL)
            OR (target_type = 'LOCALITY' AND warehouse_id IS NULL AND organization_id IS NULL AND locality_id IS NOT NULL AND country_id IS NULL)
            OR (target_type = 'COUNTRY' AND warehouse_id IS NULL AND organization_id IS NULL AND locality_id IS NULL AND country_id IS NOT NULL)
        )
    ) THEN
        RAISE EXCEPTION 'Invalid price list assignment targets must be resolved before migration';
    END IF;
END;
$$;

DROP INDEX "price_list_assignment_price_list_id_warehouse_id_key";
DROP INDEX "price_list_assignment_price_list_id_organization_id_key";
DROP INDEX "price_list_assignment_price_list_id_locality_id_key";
DROP INDEX "price_list_assignment_price_list_id_country_id_key";

CREATE UNIQUE INDEX "price_list_assignment_warehouse_id_key"
    ON "price_list_assignment"("warehouse_id");
CREATE UNIQUE INDEX "price_list_assignment_organization_id_key"
    ON "price_list_assignment"("organization_id");
CREATE UNIQUE INDEX "price_list_assignment_locality_id_key"
    ON "price_list_assignment"("locality_id");
CREATE UNIQUE INDEX "price_list_assignment_country_id_key"
    ON "price_list_assignment"("country_id");

ALTER TABLE "price_list_assignment"
ADD CONSTRAINT "price_list_assignment_target_check"
CHECK (
    (target_type = 'WAREHOUSE' AND warehouse_id IS NOT NULL AND organization_id IS NULL AND locality_id IS NULL AND country_id IS NULL)
    OR (target_type = 'ORGANIZATION' AND warehouse_id IS NULL AND organization_id IS NOT NULL AND locality_id IS NULL AND country_id IS NULL)
    OR (target_type = 'LOCALITY' AND warehouse_id IS NULL AND organization_id IS NULL AND locality_id IS NOT NULL AND country_id IS NULL)
    OR (target_type = 'COUNTRY' AND warehouse_id IS NULL AND organization_id IS NULL AND locality_id IS NULL AND country_id IS NOT NULL)
);
