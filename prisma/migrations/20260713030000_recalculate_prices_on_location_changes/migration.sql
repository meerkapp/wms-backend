CREATE OR REPLACE FUNCTION "trg_warehouse_price_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.organization_id = OLD.organization_id AND NEW.locality_id = OLD.locality_id THEN
        RETURN NEW;
    END IF;

    WITH resolved_prices AS (
        SELECT pis.id, rp.retail_price, rp.currency
        FROM product_item_stats pis
        CROSS JOIN LATERAL resolve_retail_price(pis.product_item_id, pis.warehouse_id) rp
        WHERE pis.warehouse_id = NEW.id
    )
    UPDATE product_item_stats pis
    SET retail_price = resolved_prices.retail_price,
        currency = resolved_prices.currency,
        updated_at = NOW()
    FROM resolved_prices
    WHERE resolved_prices.id = pis.id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "warehouse_price_stats_after_update"
    AFTER UPDATE OF organization_id, locality_id ON "warehouse"
    FOR EACH ROW EXECUTE FUNCTION "trg_warehouse_price_stats"();

CREATE OR REPLACE FUNCTION "trg_locality_price_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.country_id = OLD.country_id THEN
        RETURN NEW;
    END IF;

    WITH resolved_prices AS (
        SELECT pis.id, rp.retail_price, rp.currency
        FROM product_item_stats pis
        JOIN warehouse w ON w.id = pis.warehouse_id
        CROSS JOIN LATERAL resolve_retail_price(pis.product_item_id, pis.warehouse_id) rp
        WHERE w.locality_id = NEW.id
    )
    UPDATE product_item_stats pis
    SET retail_price = resolved_prices.retail_price,
        currency = resolved_prices.currency,
        updated_at = NOW()
    FROM resolved_prices
    WHERE resolved_prices.id = pis.id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "locality_price_stats_after_update"
    AFTER UPDATE OF country_id ON "locality"
    FOR EACH ROW EXECUTE FUNCTION "trg_locality_price_stats"();
