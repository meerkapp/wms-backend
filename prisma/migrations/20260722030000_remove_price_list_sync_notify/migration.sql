-- Price lists are loaded through their typed HTTP endpoints and are not part
-- of the Dexie sync registry. Recalculated product_item_stats rows emit their
-- own db_change notifications, so notifying price_list only produces an
-- unsupported-table warning in DbListenerService.
CREATE OR REPLACE FUNCTION "trg_price_list_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_default = OLD.is_default AND NEW.currency = OLD.currency THEN
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

    RETURN NEW;
END;
$$;
