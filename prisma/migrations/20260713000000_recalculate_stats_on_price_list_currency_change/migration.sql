-- A price list currency is part of every resolved product price. Keep the
-- materialized product_item_stats values consistent when it changes outside
-- the HTTP API or through a future explicit currency-conversion operation.
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

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', NEW.id
    )::text);

    RETURN NEW;
END;
$$;

COMMENT ON COLUMN product_price.price_amount IS
    'Retail price in the price list currency ISO 4217 minor units';

COMMENT ON COLUMN product_shipment.price_amount IS
    'Purchase price in the currency ISO 4217 minor units';
