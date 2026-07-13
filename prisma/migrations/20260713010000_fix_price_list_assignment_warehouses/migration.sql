-- The assignment trigger reads the helper result as w.id. Name the returned
-- column explicitly so warehouse-scoped assignments can be recalculated.
DROP FUNCTION "warehouses_for_assignment"(
    "price_list_target_type",
    INTEGER,
    INTEGER,
    INTEGER,
    INTEGER
);

CREATE FUNCTION "warehouses_for_assignment"(
    p_target_type "price_list_target_type",
    p_warehouse_id INT,
    p_organization_id INT,
    p_locality_id INT,
    p_country_id INT
)
RETURNS TABLE(id INT)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
BEGIN
    IF p_target_type = 'WAREHOUSE' THEN
        RETURN QUERY SELECT p_warehouse_id WHERE p_warehouse_id IS NOT NULL;
    ELSIF p_target_type = 'ORGANIZATION' THEN
        RETURN QUERY SELECT w.id FROM warehouse w WHERE w.organization_id = p_organization_id;
    ELSIF p_target_type = 'LOCALITY' THEN
        RETURN QUERY SELECT w.id FROM warehouse w WHERE w.locality_id = p_locality_id;
    ELSIF p_target_type = 'COUNTRY' THEN
        RETURN QUERY
        SELECT w.id
        FROM warehouse w
        JOIN locality l ON l.id = w.locality_id
        WHERE l.country_id = p_country_id;
    END IF;
END;
$$;
