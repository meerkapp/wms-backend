-- product_package is part of the sync registry, so every CRUD operation must
-- reach the single DB-trigger -> LISTEN/NOTIFY detector pipeline.
-- Keep price-stat recalculation in the business trigger and emit exactly one
-- generic notification from dedicated notify triggers.
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

    RETURN NEW;
END;
$$;

CREATE TRIGGER "product_package_notify_insert"
    AFTER INSERT ON "product_package"
    FOR EACH ROW EXECUTE FUNCTION "notify_change"();

CREATE TRIGGER "product_package_notify_update"
    AFTER UPDATE ON "product_package"
    FOR EACH ROW EXECUTE FUNCTION "notify_change"();

CREATE TRIGGER "product_package_notify_delete"
    AFTER DELETE ON "product_package"
    FOR EACH ROW EXECUTE FUNCTION "notify_change"();
