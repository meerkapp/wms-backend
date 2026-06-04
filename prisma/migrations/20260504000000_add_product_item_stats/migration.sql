-- CreateTable
CREATE TABLE "product_item_stats" (
    "id" SERIAL NOT NULL,
    "product_item_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "retail_price" BIGINT,
    "currency" "currency_code",
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_item_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_item_stats_product_item_id_warehouse_id_key" ON "product_item_stats"("product_item_id", "warehouse_id");

-- AddForeignKey
ALTER TABLE "product_item_stats"
    ADD CONSTRAINT "product_item_stats_product_item_id_fkey"
    FOREIGN KEY ("product_item_id") REFERENCES "product_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_item_stats"
    ADD CONSTRAINT "product_item_stats_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================
-- Resolve retail price for (product_item_id, warehouse_id).
-- Priority: Warehouse > Organization > Locality > Country > Global (isDefault)
-- ============================================================
CREATE OR REPLACE FUNCTION "resolve_retail_price"(
    p_product_item_id INT,
    p_warehouse_id INT
)
RETURNS TABLE(retail_price BIGINT, currency "currency_code")
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
    v_base_package_id INT;
BEGIN
    SELECT pp.id INTO v_base_package_id
    FROM product_package pp
    WHERE pp.product_item_id = p_product_item_id AND pp.is_base = true
    LIMIT 1;

    IF v_base_package_id IS NULL THEN
        RETURN QUERY SELECT NULL::BIGINT, NULL::"currency_code";
        RETURN;
    END IF;

    -- Warehouse
    RETURN QUERY
    SELECT ppr.price_amount, pl.currency
    FROM price_list_assignment pla
    JOIN price_list pl ON pl.id = pla.price_list_id
    JOIN product_price ppr ON ppr.price_list_id = pla.price_list_id
        AND ppr.product_package_id = v_base_package_id
    WHERE pla.target_type = 'WAREHOUSE' AND pla.warehouse_id = p_warehouse_id
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Organization
    RETURN QUERY
    SELECT ppr.price_amount, pl.currency
    FROM price_list_assignment pla
    JOIN price_list pl ON pl.id = pla.price_list_id
    JOIN product_price ppr ON ppr.price_list_id = pla.price_list_id
        AND ppr.product_package_id = v_base_package_id
    JOIN warehouse w ON w.organization_id = pla.organization_id
    WHERE pla.target_type = 'ORGANIZATION' AND w.id = p_warehouse_id
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Locality
    RETURN QUERY
    SELECT ppr.price_amount, pl.currency
    FROM price_list_assignment pla
    JOIN price_list pl ON pl.id = pla.price_list_id
    JOIN product_price ppr ON ppr.price_list_id = pla.price_list_id
        AND ppr.product_package_id = v_base_package_id
    JOIN warehouse w ON w.locality_id = pla.locality_id
    WHERE pla.target_type = 'LOCALITY' AND w.id = p_warehouse_id
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Country
    RETURN QUERY
    SELECT ppr.price_amount, pl.currency
    FROM price_list_assignment pla
    JOIN price_list pl ON pl.id = pla.price_list_id
    JOIN product_price ppr ON ppr.price_list_id = pla.price_list_id
        AND ppr.product_package_id = v_base_package_id
    JOIN warehouse w ON w.locality_id IN (
        SELECT l.id FROM locality l WHERE l.country_id = pla.country_id
    )
    WHERE pla.target_type = 'COUNTRY' AND w.id = p_warehouse_id
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- Global default
    RETURN QUERY
    SELECT ppr.price_amount, pl.currency
    FROM price_list pl
    JOIN product_price ppr ON ppr.price_list_id = pl.id
        AND ppr.product_package_id = v_base_package_id
    WHERE pl.is_default = true
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    RETURN QUERY SELECT NULL::BIGINT, NULL::"currency_code";
END;
$$;


-- ============================================================
-- Recalculate quantity for (product_item_id, warehouse_id)
-- ============================================================
CREATE OR REPLACE FUNCTION "recalc_stats_quantity"(
    p_product_item_id INT,
    p_warehouse_id INT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_total DECIMAL(12,3);
BEGIN
    SELECT COALESCE(SUM(ps.quantity), 0) INTO v_total
    FROM product_shipment ps
    WHERE ps.product_item_id = p_product_item_id
      AND ps.warehouse_id = p_warehouse_id
      AND ps.quantity > 0;

    INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
    VALUES (p_product_item_id, p_warehouse_id, v_total, NULL, NULL, NOW())
    ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
    SET quantity = v_total, updated_at = NOW();
END;
$$;


-- ============================================================
-- Recalculate retail price for (product_item_id, warehouse_id)
-- ============================================================
CREATE OR REPLACE FUNCTION "recalc_stats_retail_price"(
    p_product_item_id INT,
    p_warehouse_id INT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_retail_price BIGINT;
    v_currency "currency_code";
BEGIN
    SELECT rp.retail_price, rp.currency INTO v_retail_price, v_currency
    FROM resolve_retail_price(p_product_item_id, p_warehouse_id) rp;

    INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
    VALUES (p_product_item_id, p_warehouse_id, 0, v_retail_price, v_currency, NOW())
    ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
    SET retail_price = v_retail_price, currency = v_currency, updated_at = NOW();
END;
$$;


-- ============================================================
-- Recalculate both quantity and retail price
-- ============================================================
CREATE OR REPLACE FUNCTION "recalc_stats_full"(
    p_product_item_id INT,
    p_warehouse_id INT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_total DECIMAL(12,3);
    v_retail_price BIGINT;
    v_currency "currency_code";
BEGIN
    SELECT COALESCE(SUM(ps.quantity), 0) INTO v_total
    FROM product_shipment ps
    WHERE ps.product_item_id = p_product_item_id
      AND ps.warehouse_id = p_warehouse_id
      AND ps.quantity > 0;

    SELECT rp.retail_price, rp.currency INTO v_retail_price, v_currency
    FROM resolve_retail_price(p_product_item_id, p_warehouse_id) rp;

    INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
    VALUES (p_product_item_id, p_warehouse_id, v_total, v_retail_price, v_currency, NOW())
    ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
    SET quantity = v_total, retail_price = v_retail_price, currency = v_currency, updated_at = NOW();
END;
$$;


-- ============================================================
-- Affected warehouses for a price list assignment change
-- ============================================================
CREATE OR REPLACE FUNCTION "warehouses_for_assignment"(
    p_target_type "price_list_target_type",
    p_warehouse_id INT,
    p_organization_id INT,
    p_locality_id INT,
    p_country_id INT
)
RETURNS SETOF INT
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
        RETURN QUERY SELECT w.id FROM warehouse w
            JOIN locality l ON l.id = w.locality_id
            WHERE l.country_id = p_country_id;
    END IF;
END;
$$;


-- ============================================================
-- Generic NOTIFY for db_change channel
-- ============================================================
CREATE OR REPLACE FUNCTION "notify_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id := OLD.id;
    ELSE
        v_id := NEW.id;
    END IF;

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', v_id
    )::text);

    RETURN COALESCE(NEW, OLD);
END;
$$;


-- ============================================================
-- TRIGGER: product_shipment AFTER INSERT/UPDATE/DELETE
-- Recalculates quantity + notifies
-- ============================================================
CREATE OR REPLACE FUNCTION "trg_product_shipment_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_product_item_id INT;
    v_warehouse_id INT;
    v_id INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_product_item_id := OLD.product_item_id;
        v_warehouse_id := OLD.warehouse_id;
        v_id := OLD.id;
    ELSE
        v_product_item_id := NEW.product_item_id;
        v_warehouse_id := NEW.warehouse_id;
        v_id := NEW.id;
    END IF;

    IF TG_OP = 'UPDATE' AND (OLD.product_item_id != NEW.product_item_id OR OLD.warehouse_id != NEW.warehouse_id) THEN
        PERFORM recalc_stats_quantity(OLD.product_item_id, OLD.warehouse_id);
    END IF;

    PERFORM recalc_stats_quantity(v_product_item_id, v_warehouse_id);

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', v_id
    )::text);

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "product_shipment_after_insert"
    AFTER INSERT ON "product_shipment"
    FOR EACH ROW EXECUTE FUNCTION "trg_product_shipment_stats"();

CREATE TRIGGER "product_shipment_after_update"
    AFTER UPDATE ON "product_shipment"
    FOR EACH ROW EXECUTE FUNCTION "trg_product_shipment_stats"();

CREATE TRIGGER "product_shipment_after_delete"
    AFTER DELETE ON "product_shipment"
    FOR EACH ROW EXECUTE FUNCTION "trg_product_shipment_stats"();


-- ============================================================
-- TRIGGER: product_price AFTER INSERT/UPDATE/DELETE
-- Set-based: recalculates retail price for all affected
-- (product_item_id, warehouse_id) pairs in one pass
-- ============================================================
CREATE OR REPLACE FUNCTION "trg_product_price_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_product_item_id INT;
    v_price_list_id INT;
    v_is_default BOOLEAN;
    v_id INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_price_list_id := OLD.price_list_id;
        v_product_item_id := (SELECT pp.product_item_id FROM product_package pp WHERE pp.id = OLD.product_package_id);
        v_id := OLD.id;
    ELSE
        v_price_list_id := NEW.price_list_id;
        v_product_item_id := (SELECT pp.product_item_id FROM product_package pp WHERE pp.id = NEW.product_package_id);
        v_id := NEW.id;
    END IF;

    SELECT is_default INTO v_is_default FROM price_list WHERE id = v_price_list_id;

    INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
    SELECT
        v_product_item_id,
        w.id,
        COALESCE((
            SELECT SUM(ps.quantity) FROM product_shipment ps
            WHERE ps.product_item_id = v_product_item_id AND ps.warehouse_id = w.id AND ps.quantity > 0
        ), 0),
        rp.retail_price,
        rp.currency,
        NOW()
    FROM warehouse w
    JOIN price_list_assignment pla ON pla.price_list_id = v_price_list_id
    CROSS JOIN LATERAL resolve_retail_price(v_product_item_id, w.id) rp
    WHERE
        (pla.target_type = 'WAREHOUSE' AND pla.warehouse_id = w.id)
        OR (pla.target_type = 'ORGANIZATION' AND pla.organization_id = w.organization_id)
        OR (pla.target_type = 'LOCALITY' AND pla.locality_id = w.locality_id)
        OR (pla.target_type = 'COUNTRY' AND pla.country_id IN (
            SELECT l.country_id FROM locality l WHERE l.id = w.locality_id
        ))
    ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
    SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();

    IF v_is_default THEN
        INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
        SELECT
            v_product_item_id,
            pis.warehouse_id,
            pis.quantity,
            rp.retail_price,
            rp.currency,
            NOW()
        FROM product_item_stats pis
        CROSS JOIN LATERAL resolve_retail_price(v_product_item_id, pis.warehouse_id) rp
        WHERE pis.product_item_id = v_product_item_id
        ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
        SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();
    END IF;

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', v_id
    )::text);

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "product_price_after_insert"
    AFTER INSERT ON "product_price"
    FOR EACH ROW EXECUTE FUNCTION "trg_product_price_stats"();

CREATE TRIGGER "product_price_after_update"
    AFTER UPDATE ON "product_price"
    FOR EACH ROW EXECUTE FUNCTION "trg_product_price_stats"();

CREATE TRIGGER "product_price_after_delete"
    AFTER DELETE ON "product_price"
    FOR EACH ROW EXECUTE FUNCTION "trg_product_price_stats"();


-- ============================================================
-- TRIGGER: price_list_assignment AFTER INSERT/UPDATE/DELETE
-- Set-based: recalculates retail price for all affected
-- (product_item_id, warehouse_id) pairs in one pass
-- ============================================================
CREATE OR REPLACE FUNCTION "trg_price_list_assignment_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_id := NEW.id;
        INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
        SELECT
            pi.id,
            w.id,
            COALESCE((
                SELECT SUM(ps.quantity) FROM product_shipment ps
                WHERE ps.product_item_id = pi.id AND ps.warehouse_id = w.id AND ps.quantity > 0
            ), 0),
            rp.retail_price,
            rp.currency,
            NOW()
        FROM product_item pi
        CROSS JOIN warehouses_for_assignment(
            NEW.target_type, NEW.warehouse_id, NEW.organization_id, NEW.locality_id, NEW.country_id
        ) w
        CROSS JOIN LATERAL resolve_retail_price(pi.id, w.id) rp
        ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
        SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();
    ELSIF TG_OP = 'DELETE' THEN
        v_id := OLD.id;
        INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
        SELECT
            pi.id,
            w.id,
            COALESCE((
                SELECT SUM(ps.quantity) FROM product_shipment ps
                WHERE ps.product_item_id = pi.id AND ps.warehouse_id = w.id AND ps.quantity > 0
            ), 0),
            rp.retail_price,
            rp.currency,
            NOW()
        FROM product_item pi
        CROSS JOIN warehouses_for_assignment(
            OLD.target_type, OLD.warehouse_id, OLD.organization_id, OLD.locality_id, OLD.country_id
        ) w
        CROSS JOIN LATERAL resolve_retail_price(pi.id, w.id) rp
        ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
        SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();
    ELSIF TG_OP = 'UPDATE' THEN
        v_id := NEW.id;
        INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
        SELECT
            pi.id,
            w.id,
            COALESCE((
                SELECT SUM(ps.quantity) FROM product_shipment ps
                WHERE ps.product_item_id = pi.id AND ps.warehouse_id = w.id AND ps.quantity > 0
            ), 0),
            rp.retail_price,
            rp.currency,
            NOW()
        FROM product_item pi
        CROSS JOIN warehouses_for_assignment(
            OLD.target_type, OLD.warehouse_id, OLD.organization_id, OLD.locality_id, OLD.country_id
        ) w
        CROSS JOIN LATERAL resolve_retail_price(pi.id, w.id) rp
        ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
        SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();

        INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
        SELECT
            pi.id,
            w.id,
            COALESCE((
                SELECT SUM(ps.quantity) FROM product_shipment ps
                WHERE ps.product_item_id = pi.id AND ps.warehouse_id = w.id AND ps.quantity > 0
            ), 0),
            rp.retail_price,
            rp.currency,
            NOW()
        FROM product_item pi
        CROSS JOIN warehouses_for_assignment(
            NEW.target_type, NEW.warehouse_id, NEW.organization_id, NEW.locality_id, NEW.country_id
        ) w
        CROSS JOIN LATERAL resolve_retail_price(pi.id, w.id) rp
        ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
        SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();
    END IF;

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', v_id
    )::text);

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "price_list_assignment_after_insert"
    AFTER INSERT ON "price_list_assignment"
    FOR EACH ROW EXECUTE FUNCTION "trg_price_list_assignment_stats"();

CREATE TRIGGER "price_list_assignment_after_update"
    AFTER UPDATE ON "price_list_assignment"
    FOR EACH ROW EXECUTE FUNCTION "trg_price_list_assignment_stats"();

CREATE TRIGGER "price_list_assignment_after_delete"
    AFTER DELETE ON "price_list_assignment"
    FOR EACH ROW EXECUTE FUNCTION "trg_price_list_assignment_stats"();


-- ============================================================
-- TRIGGER: price_list AFTER UPDATE (is_default changed)
-- Set-based: recalculates retail price for all stats rows
-- ============================================================
CREATE OR REPLACE FUNCTION "trg_price_list_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_default = OLD.is_default THEN
        RETURN NEW;
    END IF;

    INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
    SELECT
        pis.product_item_id,
        pis.warehouse_id,
        pis.quantity,
        rp.retail_price,
        rp.currency,
        NOW()
    FROM product_item_stats pis
    CROSS JOIN LATERAL resolve_retail_price(pis.product_item_id, pis.warehouse_id) rp
    ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
    SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', NEW.id
    )::text);

    RETURN NEW;
END;
$$;

CREATE TRIGGER "price_list_after_update"
    AFTER UPDATE ON "price_list"
    FOR EACH ROW EXECUTE FUNCTION "trg_price_list_stats"();


-- ============================================================
-- TRIGGER: product_package AFTER UPDATE (is_base changed)
-- Set-based: recalculates retail price for all stats rows
-- of this product_item
-- ============================================================
CREATE OR REPLACE FUNCTION "trg_product_package_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_base = OLD.is_base THEN
        RETURN NEW;
    END IF;

    INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
    SELECT
        NEW.product_item_id,
        pis.warehouse_id,
        pis.quantity,
        rp.retail_price,
        rp.currency,
        NOW()
    FROM product_item_stats pis
    CROSS JOIN LATERAL resolve_retail_price(NEW.product_item_id, pis.warehouse_id) rp
    WHERE pis.product_item_id = NEW.product_item_id
    ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
    SET retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency, updated_at = NOW();

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', NEW.id
    )::text);

    RETURN NEW;
END;
$$;

CREATE TRIGGER "product_package_after_update"
    AFTER UPDATE ON "product_package"
    FOR EACH ROW EXECUTE FUNCTION "trg_product_package_stats"();


-- ============================================================
-- NOTIFY-only triggers for tables without business triggers
-- ============================================================

-- country
CREATE TRIGGER "country_notify_insert" AFTER INSERT ON "country" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "country_notify_update" AFTER UPDATE ON "country" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "country_notify_delete" AFTER DELETE ON "country" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- locality
CREATE TRIGGER "locality_notify_insert" AFTER INSERT ON "locality" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "locality_notify_update" AFTER UPDATE ON "locality" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "locality_notify_delete" AFTER DELETE ON "locality" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- organization
CREATE TRIGGER "organization_notify_insert" AFTER INSERT ON "organization" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "organization_notify_update" AFTER UPDATE ON "organization" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "organization_notify_delete" AFTER DELETE ON "organization" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- warehouse
CREATE TRIGGER "warehouse_notify_insert" AFTER INSERT ON "warehouse" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "warehouse_notify_update" AFTER UPDATE ON "warehouse" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "warehouse_notify_delete" AFTER DELETE ON "warehouse" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- product_type
CREATE TRIGGER "product_type_notify_insert" AFTER INSERT ON "product_type" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_type_notify_update" AFTER UPDATE ON "product_type" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_type_notify_delete" AFTER DELETE ON "product_type" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- folder
CREATE TRIGGER "folder_notify_insert" AFTER INSERT ON "folder" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "folder_notify_update" AFTER UPDATE ON "folder" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "folder_notify_delete" AFTER DELETE ON "folder" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- product_collection
CREATE TRIGGER "product_collection_notify_insert" AFTER INSERT ON "product_collection" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_collection_notify_update" AFTER UPDATE ON "product_collection" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_collection_notify_delete" AFTER DELETE ON "product_collection" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- product_measure
CREATE TRIGGER "product_measure_notify_insert" AFTER INSERT ON "product_measure" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_measure_notify_update" AFTER UPDATE ON "product_measure" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_measure_notify_delete" AFTER DELETE ON "product_measure" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- product_brand
CREATE TRIGGER "product_brand_notify_insert" AFTER INSERT ON "product_brand" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_brand_notify_update" AFTER UPDATE ON "product_brand" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_brand_notify_delete" AFTER DELETE ON "product_brand" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- product_barcode
CREATE TRIGGER "product_barcode_notify_insert" AFTER INSERT ON "product_barcode" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_barcode_notify_update" AFTER UPDATE ON "product_barcode" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_barcode_notify_delete" AFTER DELETE ON "product_barcode" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- product_item
CREATE TRIGGER "product_item_notify_insert" AFTER INSERT ON "product_item" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_item_notify_update" AFTER UPDATE ON "product_item" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_item_notify_delete" AFTER DELETE ON "product_item" FOR EACH ROW EXECUTE FUNCTION "notify_change"();

-- product_item_stats
CREATE TRIGGER "product_item_stats_notify_insert" AFTER INSERT ON "product_item_stats" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_item_stats_notify_update" AFTER UPDATE ON "product_item_stats" FOR EACH ROW EXECUTE FUNCTION "notify_change"();
CREATE TRIGGER "product_item_stats_notify_delete" AFTER DELETE ON "product_item_stats" FOR EACH ROW EXECUTE FUNCTION "notify_change"();


-- ============================================================
-- Seed: populate product_item_stats from existing data
-- ============================================================
INSERT INTO product_item_stats (product_item_id, warehouse_id, quantity, retail_price, currency, updated_at)
SELECT
    ps.product_item_id,
    ps.warehouse_id,
    SUM(ps.quantity),
    NULL,
    NULL,
    NOW()
FROM product_shipment ps
WHERE ps.quantity > 0
GROUP BY ps.product_item_id, ps.warehouse_id
ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
SET quantity = EXCLUDED.quantity, updated_at = NOW();

UPDATE product_item_stats pis
SET retail_price = rp.retail_price,
    currency = rp.currency,
    updated_at = NOW()
FROM resolve_retail_price(pis.product_item_id, pis.warehouse_id) rp;
